-- 31_bug_report_diagnostics.sql — give a bug report enough context to be fixable.
--
-- The report form has always carried four fields: who, which build string, and
-- the user's prose. `app_version` was the literal "0.2.0" for every build ever
-- made, so a report could not be tied to a binary; and nothing recorded the
-- screen, the OS, or the crash it followed. Most reports were therefore
-- unreproducible, which is exactly what the automated triage loop needs least.
--
-- Free text stays free text. The structured fields are an **allowlist**: what is
-- written here is chosen by the client in `src/lib/diagnostics.ts` and validated
-- again by the feedback function before it reaches this table. Amounts, merchant
-- names, notes, raw SMS text and card digits must never appear in any of these
-- columns, and nothing here is ever published to a public repository.
--
-- Consent is opt-in and lives on the device (`bukit.diagnostics_consent`). When
-- it is off, the columns arrive null. The database does not enforce that — it
-- cannot know — so the app and the function are the two places that must.

alter table public.bug_reports
  -- Identity of the binary that produced the report. `git_sha` is the short
  -- commit the build was made from; `build_number` is CFBundleVersion, which is
  -- what Sentry keys a release on.
  add column build_number    text,
  add column git_sha         text,
  -- Device and place. Model is a model ("iPhone18,3"), never a name or serial.
  add column platform        text,
  add column os_version      text,
  add column device_model    text,
  add column route           text,
  -- The Sentry event this report is about, when the user reported straight
  -- after a crash or error screen. Null for ordinary reports.
  add column sentry_event_id text,
  -- Everything else the allowlist collects: locale, screen size, network
  -- reachability, app state, breadcrumb route names. Kept as one object so the
  -- intake job can evolve its query without a migration per field, but capped
  -- so a client cannot turn the table into a blob store.
  add column diagnostics     jsonb;

alter table public.bug_reports
  add constraint bug_reports_diagnostics_is_object
    check (diagnostics is null or jsonb_typeof(diagnostics) = 'object'),
  add constraint bug_reports_diagnostics_size
    check (diagnostics is null or length(diagnostics::text) <= 8192);

comment on column public.bug_reports.diagnostics is
  'Allowlisted, consent-gated diagnostics from the reporting device. Never '
  'amounts, merchants, notes, SMS text or card digits. See '
  'apps/mobile/src/lib/diagnostics.ts and supabase/functions/_shared/feedback.ts.';

-- The intake job reads newest-first in small batches. created_at alone would
-- scan the whole table as reports accumulate; the index keeps that constant.
create index bug_reports_created_at_idx
  on public.bug_reports (created_at desc);
