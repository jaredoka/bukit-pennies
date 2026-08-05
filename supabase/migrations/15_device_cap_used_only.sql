-- 15_device_cap_used_only.sql — the device cap counted abandoned setup attempts.
--
-- Migration 13 capped a user at 10 ACTIVE capture devices. The number was
-- chosen against "real usage is 1-2 devices", which was true and beside the
-- point: iOS Shortcut setup is a multi-attempt flow, and its
-- failure mode is minting *another* token. Verifying the deploy found the
-- owner's own account already at exactly 10 active, five of them never used —
-- so token creation was blocked by abandoned attempts alone.
--
-- Splitting the budget in two: a device that has actually captured something is
-- real and worth 1 against a tight cap; a never-used one is setup debris and
-- gets a loose one. Both are still bounded, because an unbounded device list is
-- an unbounded client-driven write into `ingest_devices` — that part of 13
-- still matters. What no longer matters is using this cap as the rate-limit
-- amplifier control: migration 13's per-user 120/min budget does that job, and
-- does it regardless of how many tokens exist.
create or replace function public.create_ingest_token(p_name text, p_kind tx_source)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  plaintext text;
  v_used    integer;
  v_unused  integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'device name required';
  end if;

  select count(*) filter (where last_seen_at is not null),
         count(*) filter (where last_seen_at is null)
    into v_used, v_unused
    from public.ingest_devices
   where user_id = auth.uid()
     and revoked_at is null;

  -- Devices that have actually captured. Reaching 10 of these means something
  -- genuinely unusual, so the message points at the real remedy.
  if v_used >= 10 then
    raise exception 'device limit reached: revoke a capture device you no longer use (Settings > Capture > Capture devices)';
  end if;

  -- Setup debris. Loose enough that no plausible number of failed Shortcut
  -- attempts hits it, tight enough that the table cannot grow without limit.
  if v_unused >= 20 then
    raise exception 'too many unused capture devices: revoke the ones you never finished setting up (Settings > Capture > Capture devices)';
  end if;

  plaintext := 'bp_' || public.base62_encode(gen_random_bytes(32));

  insert into public.ingest_devices (user_id, name, kind, token_hash)
  values (auth.uid(), btrim(p_name), p_kind, encode(digest(plaintext, 'sha256'), 'hex'));

  return plaintext;
end;
$$;

-- Restated for anyone reading this file alone; `create or replace` preserves
-- them regardless.
revoke execute on function public.create_ingest_token(text, tx_source) from public, anon;
grant execute on function public.create_ingest_token(text, tx_source) to authenticated;
