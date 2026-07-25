-- 13_per_user_ingest_budget.sql — SEC-6: the per-token budget was multipliable.
--
-- Migration 12 bounded /ingest with two budgets: 60 requests/minute keyed on
-- `token:<sha256>`, and 20 FAILED auths/minute keyed on `peer:<ip>`. Neither
-- bounds an authenticated user, because:
--
--   • every token minted gets its own fresh 60/min bucket, and
--     `create_ingest_token` had no cap on how many a user could mint; and
--   • the peer budget counts failures only (deliberately — Brunei mobile
--     networks NAT heavily, so a blanket per-IP request cap would throttle
--     unrelated real users), so a stream of VALID requests never touches it.
--
-- So one free account could mint N tokens and sustain N x 60 valid requests per
-- minute, none of which the limiter would see. The exposure is invocation count
-- and egress against the free tier (HANDOFF §16.5 names egress as the first
-- ceiling to be hit), not data — every request still writes only to its own
-- user's rows.
--
-- Two changes, belt and braces: a per-user budget that no amount of token
-- minting can widen, and a cap on active devices so the device table itself
-- cannot be used as an amplifier.

-- ── SEC-6a: per-user budget ────────────────────────────────────────────────
-- 120 requests/minute per user, sitting above the unchanged 60/min per token.
-- Rationale for the number: bulk paste posts at a 1,200 ms interval (see
-- `postIngestMany`), i.e. ~50/min from one device, so 120 leaves room for two
-- devices bulk-pasting concurrently plus Shortcut traffic arriving alongside.
-- A real user has no way to reach it; a user minting tokens to amplify hits it
-- immediately.
--
-- Cost: one extra indexed upsert on the happy path, still inside the single
-- round trip the edge function already makes — `resolve_ingest_device` remains
-- one call, so no added network latency to real captures (the invariant
-- migration 12 was built around).
--
-- Order matters: the token budget is bumped first and checked first, so a
-- single runaway device is reported against its own budget rather than
-- silently consuming the account's.
create or replace function public.resolve_ingest_device(p_token_hash text, p_peer text default null)
returns table (device_id uuid, device_user_id uuid, blocked boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id         uuid;
  v_user       uuid;
  v_token_hits integer;
  v_user_hits  integer;
begin
  -- Spent peer budget: refuse before touching ingest_devices at all.
  if p_peer is not null
     and public.rate_limit_peek('peer:' || p_peer, interval '1 minute') >= 20 then
    return query select null::uuid, null::uuid, true;
    return;
  end if;

  select d.id, d.user_id into v_id, v_user
    from public.ingest_devices d
   where d.token_hash = p_token_hash
     and d.revoked_at is null;

  if v_id is null then
    if p_peer is not null then
      perform public.rate_limit_bump('peer:' || p_peer, interval '1 minute');
    end if;
    return query select null::uuid, null::uuid, false;
    return;
  end if;

  v_token_hits := public.rate_limit_bump('token:' || p_token_hash, interval '1 minute');
  v_user_hits  := public.rate_limit_bump('user:' || v_user::text, interval '1 minute');

  return query select v_id, v_user, (v_token_hits > 60 or v_user_hits > 120);
end;
$$;

-- ── SEC-6b: cap active devices per user ────────────────────────────────────
-- Unlimited minting was the amplifier the per-user budget now defuses, but an
-- unbounded device list is worth closing on its own: it is also an unbounded
-- write into `ingest_devices` from an authenticated client, and a long list
-- makes the Settings > Capture revocation screen useless as a security tool.
--
-- 10 ACTIVE devices (revoked ones do not count, so revoking frees a slot).
-- Real usage is 1–2 per account: this device (paste) plus the Shortcut.
create or replace function public.create_ingest_token(p_name text, p_kind tx_source)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  plaintext text;
  v_active  integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'device name required';
  end if;

  select count(*) into v_active
    from public.ingest_devices
   where user_id = auth.uid()
     and revoked_at is null;

  if v_active >= 10 then
    raise exception 'device limit reached: revoke an existing capture device first';
  end if;

  plaintext := 'bp_' || public.base62_encode(gen_random_bytes(32));

  insert into public.ingest_devices (user_id, name, kind, token_hash)
  values (auth.uid(), btrim(p_name), p_kind, encode(digest(plaintext, 'sha256'), 'hex'));

  return plaintext;
end;
$$;

-- `create or replace` preserves the grants from migration 03 (revoked from
-- public/anon, execute to authenticated) — restated here so a reader of this
-- file alone is not left guessing.
revoke execute on function public.create_ingest_token(text, tx_source) from public, anon;
grant execute on function public.create_ingest_token(text, tx_source) to authenticated;

revoke execute on function public.resolve_ingest_device(text, text) from public, anon, authenticated;
grant execute on function public.resolve_ingest_device(text, text) to service_role;
