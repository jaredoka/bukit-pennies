-- 16_feature_requests.sql — feature requests submitted from
-- Settings > Request a feature. Same shape as bug_reports (10_bug_reports.sql
-- plus the SEC-5 fix in 11_security_hardening.sql): write-only from the client,
-- user_id defaulted server-side from auth.uid() so the client never claims it.
create table public.feature_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  short_id    text not null,
  app_version text not null,
  area        text not null,
  description text not null,
  created_at  timestamptz not null default now()
);

alter table public.feature_requests enable row level security;

-- Insert-only: users submit requests but cannot read them (or anyone else's)
-- back. No select/update/delete policy is intentional — with RLS enabled and no
-- matching policy, those commands return nothing / are refused.
create policy feature_requests_insert on public.feature_requests
  for insert with check (user_id = auth.uid());

-- Grants come from 04_grants.sql's default privileges (authenticated,
-- service_role) and 14_revoke_anon_dml.sql keeps anon out; nothing to add here.
