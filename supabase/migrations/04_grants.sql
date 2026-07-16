-- 04_grants.sql — explicit table/sequence privileges for API roles.
--
-- Newer Supabase Postgres images no longer auto-grant DML on public-schema
-- tables to anon/authenticated/service_role (default privileges only carry
-- TRUNCATE/REFERENCES/TRIGGER). Without these grants the ingest edge function
-- (service_role) and the app (authenticated, row-filtered by RLS) get
-- "permission denied". anon gets schema usage only — all app access is
-- authenticated, and ingest authenticates via token + service_role.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;

grant usage, select on all sequences in schema public
  to authenticated, service_role;

-- Future tables/sequences created by migrations (run as postgres) get the
-- same grants automatically.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;

alter default privileges for role postgres in schema public
  grant usage, select on sequences to authenticated, service_role;
