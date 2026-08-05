-- 20_input_bounds_and_quotas.sql — third security pass.
--
-- Earlier security passes audited RLS and the ingest function, the anonymous
-- surface and the limiter arithmetic, and fixed the anon grants. All three
-- asked "who may write this row". None asked "how big may the row be", and
-- none revisited the surfaces added after them (`feature_requests`, migration
-- 16; the `feedback` function; `savings_goal_entries`, migration 19).
--
-- Four things here, all of them cases where the application layer states a
-- rule that the database does not enforce.

-- ── 1. Text columns had no length bound at all ──────────────────────────────
-- `04_grants.sql` gives `authenticated` direct INSERT on every table, so every
-- cap that lives in application code is reachable around: the ingest
-- function's 4 KB `MAX_TEXT_BYTES` and the feedback function's 4,000-character
-- `MAX_DESCRIPTION` are both bypassed by a plain PostgREST insert made with
-- the app's own anon key and any signed-in session. One account could fill the
-- 500 MB free-tier database a single `notes` field at a time.
--
-- 18_subscriptions.sql already does this correctly — `check (length(btrim(name))
-- between 1 and 80)`, `notes` capped at 500. The pattern was known; it just was
-- never applied to the tables that predate it. This migration finishes the job.
--
-- NOT VALID throughout, deliberately and not as a hedge: a NOT VALID check
-- constraint is fully enforced on INSERT and UPDATE from the moment it exists.
-- What it skips is the scan that proves *existing* rows comply, which is the
-- part that could fail a deploy or take a lock on live data for no security
-- gain. Nothing can write an oversized value from here on. To also prove the
-- back catalogue clean, run the VALIDATE block at the foot of this file
-- separately, where a failure costs nothing.

alter table public.transactions
  add constraint transactions_merchant_len
    check (length(merchant) <= 200) not valid,
  add constraint transactions_merchant_normalized_len
    check (length(merchant_normalized) <= 200) not valid,
  add constraint transactions_notes_len
    check (length(notes) <= 2000) not valid,
  -- 4096 characters is at least as loose as the ingest function's 4096 *bytes*
  -- (a 4 KB UTF-8 string cannot exceed 4096 characters), so a message the
  -- server accepts can never be refused here. Manual entries build a short
  -- fixed string, well inside it.
  add constraint transactions_raw_text_len
    check (length(raw_text) <= 4096) not valid,
  -- `user_cards` has carried this check since 01_schema.sql; `transactions`
  -- never did, though both write paths validate it client-side
  -- (transactions/new.tsx, subscriptions/edit.tsx) and both parsers can only
  -- produce four digits or null.
  add constraint transactions_card_last4_fmt
    check (card_last4 ~ '^[0-9]{4}$') not valid;

alter table public.categories
  add constraint categories_name_len check (length(name) <= 60) not valid,
  add constraint categories_color_len check (length(color) <= 32) not valid;

alter table public.profiles
  add constraint profiles_display_name_len check (length(display_name) <= 80) not valid;

-- `create_ingest_token` btrims this and inserts it with no cap of its own; the
-- function gains a matching guard below so the failure is a clear message
-- rather than a constraint violation.
alter table public.ingest_devices
  add constraint ingest_devices_name_len check (length(name) <= 80) not valid;

alter table public.savings_goals
  add constraint savings_goals_name_len check (length(name) <= 80) not valid,
  -- 09_goal_currency.sql added this as bare `text`, unlike every other currency
  -- column in the schema (char(3)). Every value the app can produce comes from
  -- CURRENCY_OPTIONS in primaryCurrency.tsx — seven three-letter codes.
  add constraint savings_goals_currency_fmt check (currency ~ '^[A-Z]{3}$') not valid;

alter table public.savings_goal_entries
  add constraint savings_goal_entries_note_len check (length(note) <= 200) not valid;

-- These four mirror MAX_DESCRIPTION / MAX_AREA / MAX_APP_VERSION / MAX_SHORT_ID
-- in supabase/functions/_shared/feedback.ts. The function is not the only way
-- in — both tables are directly insertable by `authenticated` — so the caps
-- have to exist here to mean anything.
alter table public.bug_reports
  add constraint bug_reports_bounds
    check (length(description) <= 4000
       and length(short_id) <= 32
       and length(app_version) <= 32) not valid;

alter table public.feature_requests
  add constraint feature_requests_bounds
    check (length(description) <= 4000
       and length(short_id) <= 32
       and length(app_version) <= 32
       and length(area) <= 64) not valid;

-- ── 2. Feedback had no quota of any kind ───────────────────────────────────
-- `/ingest` got a durable Postgres limiter across migrations 12 and 13 after
-- two rounds of analysis. `/feedback` shipped with none, and signup is
-- free and unrestricted — an earlier pass established that "needs an account"
-- is not a control here. A loop over `functions.invoke('feedback', …)` writes
-- unbounded rows and sends one Resend email per call, against a free tier of
-- 100/day.
--
-- The quota lives here rather than in the edge function for three reasons:
--
--   • `feedback/index.ts` deliberately holds no service-role key — it inserts
--     through the caller's JWT so RLS stays the boundary. Calling a
--     service_role-only limiter would give that up.
--   • The insert happens *before* the email (`_shared/feedback.ts`), so
--     bounding the row bounds Resend for free. One control, both resources.
--   • It also binds the direct-PostgREST path, which the edge function cannot
--     see at all.
--
-- SECURITY DEFINER is required, not decorative: both tables are insert-only by
-- design (no select policy), so an invoker-rights function would count zero
-- rows every time and the quota would never fire.
--
-- 5/hour and 20/day. A user filing a real bug files one, occasionally two; the
-- numbers are set where no honest submission is ever refused.

create function public.enforce_bug_report_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hour integer;
  v_day  integer;
begin
  select count(*) filter (where created_at > now() - interval '1 hour'),
         count(*) filter (where created_at > now() - interval '1 day')
    into v_hour, v_day
    from public.bug_reports
   where user_id = new.user_id;

  if v_hour >= 5 or v_day >= 20 then
    raise exception 'too many submissions — please try again later';
  end if;

  return new;
end;
$$;

create function public.enforce_feature_request_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hour integer;
  v_day  integer;
begin
  select count(*) filter (where created_at > now() - interval '1 hour'),
         count(*) filter (where created_at > now() - interval '1 day')
    into v_hour, v_day
    from public.feature_requests
   where user_id = new.user_id;

  if v_hour >= 5 or v_day >= 20 then
    raise exception 'too many submissions — please try again later';
  end if;

  return new;
end;
$$;

-- BEFORE INSERT: column defaults (including `user_id default auth.uid()`) are
-- applied before row triggers fire, so `new.user_id` is populated even though
-- the client never sends it.
create trigger bug_reports_quota
before insert on public.bug_reports
for each row execute function public.enforce_bug_report_quota();

create trigger feature_requests_quota
before insert on public.feature_requests
for each row execute function public.enforce_feature_request_quota();

create index bug_reports_user_created_idx
  on public.bug_reports (user_id, created_at desc);
create index feature_requests_user_created_idx
  on public.feature_requests (user_id, created_at desc);

-- ── 3. A goal entry could name a goal the caller does not own ───────────────
-- Migration 19's insert policy checks `user_id = auth.uid()` and nothing else.
-- `goal_id` is constrained only by its foreign key to `savings_goals` — to the
-- table, not to *this caller's rows in* the table. So a crafted insert attaches
-- ledger entries to somebody else's goal id.
--
-- Contained today: `savings_goal_progress` is security_invoker and
-- `useSavingsGoalEntries` reads under RLS, so the rows are orphans only their
-- author can see. Two reasons to close it anyway. It is a valid/invalid oracle
-- for goal UUIDs. And it stops being contained the moment anything sums
-- `savings_goal_entries` without joining back through `savings_goals` — which
-- is precisely the shape migration 19 exists to encourage.

drop policy savings_goal_entries_insert on public.savings_goal_entries;
create policy savings_goal_entries_insert on public.savings_goal_entries
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.savings_goals g
       where g.id = goal_id and g.user_id = auth.uid()
    )
  );

-- Update needs the same predicate on both sides: `using` so a row cannot be
-- re-pointed *away* from a goal the caller owns, `with check` so it cannot be
-- re-pointed *at* one they do not.
drop policy savings_goal_entries_update on public.savings_goal_entries;
create policy savings_goal_entries_update on public.savings_goal_entries
  for update
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.savings_goals g
       where g.id = goal_id and g.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.savings_goals g
       where g.id = goal_id and g.user_id = auth.uid()
    )
  );

-- ── 4. "Remove is only for revoked devices" was a UI claim ──────────────────
-- Removal is offered only on already-revoked devices, because
-- `last_seen_at` on a revoked token is the evidence of when it was last used —
-- which matters most in exactly the situation you revoked for. The devices
-- screen honours that; the database never did. 02_rls.sql's delete policy
-- allows deleting any of the caller's devices, active ones included, so the
-- audit trail the decision protects could be erased by anyone who skipped the
-- UI. Owner-scoped either way; this makes the stated rule the enforced one.
drop policy ingest_devices_delete on public.ingest_devices;
create policy ingest_devices_delete on public.ingest_devices
  for delete using (user_id = auth.uid() and revoked_at is not null);

-- ── 5. Device name length, in the function that writes it ──────────────────
-- The constraint above already refuses the row. Checking here too turns a
-- constraint violation into the same shape of message as the other two limits
-- this function enforces.
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
  if length(btrim(p_name)) > 80 then
    raise exception 'device name too long (80 characters maximum)';
  end if;

  select count(*) filter (where last_seen_at is not null),
         count(*) filter (where last_seen_at is null)
    into v_used, v_unused
    from public.ingest_devices
   where user_id = auth.uid()
     and revoked_at is null;

  if v_used >= 10 then
    raise exception 'device limit reached: revoke a capture device you no longer use (Settings > Capture > Capture devices)';
  end if;

  if v_unused >= 20 then
    raise exception 'too many unused capture devices: revoke the ones you never finished setting up (Settings > Capture > Capture devices)';
  end if;

  plaintext := 'bp_' || public.base62_encode(gen_random_bytes(32));

  insert into public.ingest_devices (user_id, name, kind, token_hash)
  values (auth.uid(), btrim(p_name), p_kind, encode(digest(plaintext, 'sha256'), 'hex'));

  return plaintext;
end;
$$;

-- `create or replace` preserves them; restated so a reader of this file alone
-- is not left guessing (same convention as migrations 13 and 15).
revoke execute on function public.create_ingest_token(text, tx_source) from public, anon;
grant execute on function public.create_ingest_token(text, tx_source) to authenticated;

-- Trigger functions are called by the trigger, never by a client. No grant is
-- needed for a trigger to fire, so none is given.
revoke execute on function public.enforce_bug_report_quota() from public, anon, authenticated;
revoke execute on function public.enforce_feature_request_quota() from public, anon, authenticated;

-- ── Optional: prove the back catalogue clean ───────────────────────────────
-- Every constraint above is already enforced for new writes. Running these
-- additionally verifies existing rows; a failure names the row to fix and
-- changes nothing else. Kept out of the migration so a deploy cannot be
-- blocked by historical data.
--
--   alter table public.transactions          validate constraint transactions_merchant_len;
--   alter table public.transactions          validate constraint transactions_merchant_normalized_len;
--   alter table public.transactions          validate constraint transactions_notes_len;
--   alter table public.transactions          validate constraint transactions_raw_text_len;
--   alter table public.transactions          validate constraint transactions_card_last4_fmt;
--   alter table public.categories            validate constraint categories_name_len;
--   alter table public.categories            validate constraint categories_color_len;
--   alter table public.profiles              validate constraint profiles_display_name_len;
--   alter table public.ingest_devices        validate constraint ingest_devices_name_len;
--   alter table public.savings_goals         validate constraint savings_goals_name_len;
--   alter table public.savings_goals         validate constraint savings_goals_currency_fmt;
--   alter table public.savings_goal_entries  validate constraint savings_goal_entries_note_len;
--   alter table public.bug_reports           validate constraint bug_reports_bounds;
--   alter table public.feature_requests      validate constraint feature_requests_bounds;
