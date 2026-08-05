-- 11_security_hardening.sql — follow-ups from the security audit.

-- ── SEC-3: ingest_devices must not be client-writable ──────────────────────
-- 02_rls.sql gave `authenticated` the full insert/update quartet on
-- ingest_devices while its own comment claimed "token_hash is only ever
-- written by the security-definer RPC". It wasn't enforced: a client could
-- insert a row bearing a token_hash of its choosing (defeating the
-- shown-once, 32-random-byte guarantee of create_ingest_token) or clear
-- revoked_at to resurrect a revoked device.
--
-- Insert now belongs solely to create_ingest_token (security definer, so RLS
-- does not apply to it). Update is narrowed to revocation via the RPC below.
-- Select and delete stay as they were — both are owner-scoped and harmless.

drop policy ingest_devices_insert on public.ingest_devices;
drop policy ingest_devices_update on public.ingest_devices;

revoke insert, update on public.ingest_devices from authenticated;

-- Revocation is one-way: a revoked device can never be reactivated, and
-- token_hash is untouchable. Idempotent — re-revoking is a no-op.
create function public.revoke_ingest_device(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.ingest_devices
     set revoked_at = coalesce(revoked_at, now())
   where id = p_device_id
     and user_id = auth.uid();

  if not found then
    raise exception 'device not found';
  end if;
end;
$$;

revoke execute on function public.revoke_ingest_device(uuid) from public, anon;
grant execute on function public.revoke_ingest_device(uuid) to authenticated;

-- 04_grants.sql's default privileges would re-grant insert/update on future
-- tables, but not on this existing one; the explicit revoke above holds.

-- ── SEC-5: bug_reports.user_id was never populated ─────────────────────────
-- The client inserts {short_id, app_version, description} only, so every
-- submission failed the not-null constraint — bug reporting has been silently
-- broken since it shipped. Defaulting to auth.uid() fixes it and removes the
-- chance of a client claiming another user's id (the RLS with-check already
-- rejected that, but a default is the safer shape).
alter table public.bug_reports
  alter column user_id set default auth.uid();
