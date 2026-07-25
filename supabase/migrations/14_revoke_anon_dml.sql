-- 14_revoke_anon_dml.sql — SEC-8: the hosted project granted `anon` full DML.
--
-- Found by `supabase db diff --linked` after pushing migration 13 (HANDOFF
-- §24). The hosted project hands `anon` SELECT/INSERT/UPDATE/DELETE on every
-- public table; a local `supabase db reset` does not, because 04_grants.sql
-- deliberately gives anon schema USAGE only. The project was created on an
-- image that still auto-granted to anon, and 04 was written to add back the
-- grants newer images *stopped* issuing — it never revoked the ones an older
-- image had already issued.
--
-- Nothing was exposed: RLS is enabled on every affected table with owner-scoped
-- policies, and a logged-out write is refused with "new row violates row-level
-- security policy" — the policy talking, not the grant. The problem is that
-- production was running on one layer where this repo intends two, and that
-- local was STRICTER than production: a table shipped without
-- `enable row level security` would pass local testing (anon has no grant, so
-- "permission denied") and be world-writable in production (anon has the
-- grant, and no RLS means no second gate). That asymmetry is the bug.
--
-- Roles are unchanged otherwise: the app authenticates for everything, so it
-- acts as `authenticated`; /ingest holds the service-role key. `anon` needs no
-- table access at all — sign-up and sign-in go through GoTrue, not PostgREST.

-- Schema USAGE stays (04_grants.sql): PostgREST needs it to introspect, and it
-- conveys no data access on its own.
revoke select, insert, update, delete on all tables in schema public from anon;
revoke usage, select on all sequences in schema public from anon;

-- Stop future tables inheriting it. 04_grants.sql sets default privileges for
-- role postgres granting authenticated/service_role; the matching revoke for
-- anon keeps the two in step as new migrations add tables.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon;

-- Scope note: migrations run as `postgres`, and default privileges can only be
-- altered for a role you are a member of — `alter default privileges for role
-- supabase_admin` fails here with "permission denied to change default
-- privileges", so it is deliberately not attempted. It does not need to be:
-- default privileges key off whichever role CREATES an object, and every table
-- in this schema is created by a migration running as postgres. Tables created
-- by hand in the Supabase dashboard are the gap — if you ever make one there,
-- check its grants.

-- Note for whoever adds the next table: this migration does NOT substitute for
-- `enable row level security` plus the policy quartet. It restores the second
-- layer; RLS is still the boundary.
