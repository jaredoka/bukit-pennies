-- 12_ingest_rate_limits.sql — durable rate limiting for /ingest (HANDOFF §18 SEC-2).
--
-- The previous limiter lived in edge-instance memory. Supabase Edge Functions
-- run every request in a fresh isolate (verified in production 2026-07-25: a
-- module-level counter returned a new boot id and `1` on twelve consecutive
-- requests), so that state was always empty and the limit never applied — not
-- the peer budget added during the audit, and not the original per-token
-- limit from §6 step 7 either.
--
-- Shared state on this stack means Postgres. The design constraint is that the
-- happy path must not get slower: `resolve_ingest_device` therefore resolves
-- the token AND applies both budgets in a SINGLE round trip, replacing the
-- lookup the function already performed. Real captures cost exactly what they
-- cost before; an anonymous flood is stopped by a tiny indexed upsert instead
-- of reaching the parser.

-- ── counter store ──────────────────────────────────────────────────────────
-- One row per key ('peer:<ip>' or 'token:<sha256>'), holding a fixed window.
-- Touched only by the security-definer functions below.
create table public.ingest_rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  hits         integer not null default 0
);

create index ingest_rate_limits_window_idx on public.ingest_rate_limits (window_start);

-- No policies: RLS on with none defined denies every API role. 04_grants.sql
-- sets default privileges that would otherwise hand DML to `authenticated`,
-- so revoke explicitly. Only the security-definer functions (owned by
-- postgres) and service_role reach this table.
alter table public.ingest_rate_limits enable row level security;
revoke all on public.ingest_rate_limits from anon, authenticated;

-- ── windowed counters ──────────────────────────────────────────────────────

-- Increments `key`'s counter, resetting first if its window has expired, and
-- returns the new count. Fixed window, not sliding: a sliding window needs
-- per-hit timestamps, and the extra precision buys nothing here — the goal is
-- bounding abuse, not fairness.
create function public.rate_limit_bump(p_key text, p_window interval)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hits integer;
begin
  insert into public.ingest_rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
     set hits = case when r.window_start < now() - p_window then 1 else r.hits + 1 end,
         window_start = case when r.window_start < now() - p_window then now() else r.window_start end
  returning r.hits into v_hits;

  -- Self-maintaining cleanup: ~1 call in 1000 sweeps abandoned keys. Cheaper
  -- and simpler than a scheduled job, and this table is pure scratch data.
  if random() < 0.001 then
    delete from public.ingest_rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits;
end;
$$;

-- Reads a counter without incrementing it; 0 once the window has lapsed.
create function public.rate_limit_peek(p_key text, p_window interval)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select hits from public.ingest_rate_limits
      where key = p_key and window_start >= now() - p_window),
    0);
$$;

-- ── token resolution + limiting, in one round trip ─────────────────────────
-- Returns the owning device for a token hash, plus whether the caller is
-- currently rate limited.
--
-- Budgets:
--   • peer  — 20 FAILED auths/minute per client IP. Keyed on failures, not on
--     all requests, because Brunei mobile networks NAT heavily: a blanket
--     per-IP cap would throttle unrelated legitimate users, while a device
--     with a valid token never records a failure.
--   • token — 60 requests/minute, bounding damage if a real token leaks.
create function public.resolve_ingest_device(p_token_hash text, p_peer text default null)
returns table (device_id uuid, device_user_id uuid, blocked boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_user uuid;
  v_hits integer;
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

  v_hits := public.rate_limit_bump('token:' || p_token_hash, interval '1 minute');
  return query select v_id, v_user, v_hits > 60;
end;
$$;

-- Edge function only (it holds the service-role key). Never client-callable:
-- a client that could call this would be able to probe token hashes and to
-- burn other peers' budgets.
revoke execute on function public.rate_limit_bump(text, interval) from public, anon, authenticated;
revoke execute on function public.rate_limit_peek(text, interval) from public, anon, authenticated;
revoke execute on function public.resolve_ingest_device(text, text) from public, anon, authenticated;
grant execute on function public.resolve_ingest_device(text, text) to service_role;
