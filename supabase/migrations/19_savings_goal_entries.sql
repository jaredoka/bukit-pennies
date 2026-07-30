-- 19_savings_goal_entries.sql — goal progress becomes a ledger.
--
-- `savings_goals.saved_amount` was a single mutable number, written by a
-- read-modify-write from the client ("Add" read it, added, wrote it back).
-- Three problems with that, and the third is what forced this change:
--
--   1. No history. Nothing recorded that BND 50 went in on 12 July, so the
--      goal card could show progress but never explain it.
--   2. Racy. Two adds from two devices in the same moment lose one, because
--      each read the same starting figure.
--   3. **No way to correct a mistake.** The only operation was "add", so a
--      fat-fingered 500 instead of 50, or money actually taken back out of
--      the pot, had no path at all. That was the reported gap.
--
-- Each add or withdrawal is now a row here and `saved` is derived by summing
-- them, so correcting a mistake is deleting the wrong entry — the same shape
-- the rest of the app already has, where a log produces the figures rather
-- than a figure being stored on its own.
--
-- A negative `amount` is a withdrawal. Both directions live in one table
-- rather than an add table and a withdraw table: they are the same event with
-- opposite signs, and summing one column is what makes the total trivially
-- correct.

create table public.savings_goal_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id      uuid not null references public.savings_goals (id) on delete cascade,
  -- Signed: positive puts money in, negative takes it out. Zero would be a
  -- row that changes nothing, so it is refused.
  amount       numeric(12, 2) not null check (amount <> 0),
  -- Brunei-local calendar day (+08:00, no DST), matching every other date in
  -- the app. A date, not a timestamp: "when did I put this aside" is a day.
  occurred_on  date not null default ((now() at time zone 'Asia/Brunei')::date),
  note         text check (length(note) <= 200),
  created_at   timestamptz not null default now()
);

-- The detail screen reads one goal's entries newest-first; the progress view
-- groups by goal. created_at breaks ties so same-day entries have a stable
-- order rather than shuffling between fetches.
create index savings_goal_entries_goal_idx
  on public.savings_goal_entries (user_id, goal_id, occurred_on desc, created_at desc);

alter table public.savings_goal_entries enable row level security;

create policy savings_goal_entries_select on public.savings_goal_entries for select using (user_id = auth.uid());
create policy savings_goal_entries_insert on public.savings_goal_entries for insert with check (user_id = auth.uid());
create policy savings_goal_entries_update on public.savings_goal_entries for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy savings_goal_entries_delete on public.savings_goal_entries for delete using (user_id = auth.uid());

-- ── Backfill before dropping anything ────────────────────────────────────────
-- Existing goals carry real progress in `saved_amount` with no entries to
-- explain it. Each becomes one opening-balance entry dated from the goal's
-- creation, so no user loses progress and the sum still matches what they saw
-- before the migration. Goals sitting at 0 need no row.
insert into public.savings_goal_entries (user_id, goal_id, amount, occurred_on, note)
select
  g.user_id,
  g.id,
  g.saved_amount,
  (g.created_at at time zone 'Asia/Brunei')::date,
  'Opening balance'
from public.savings_goals g
where g.saved_amount <> 0;

-- ── `saved` is now derived ───────────────────────────────────────────────────
-- A left join so a goal with no entries still appears at 0, rather than
-- vanishing from the list until its first deposit.
--
-- security_invoker so the caller's RLS applies; without it the view runs as
-- its owner and hands every user everyone else's savings (same note as
-- 03_functions_views.sql and 17_transaction_facets.sql).
create view public.savings_goal_progress
with (security_invoker = true)
as
select
  g.user_id,
  g.id                                as goal_id,
  coalesce(sum(e.amount), 0)::numeric(12, 2) as saved,
  count(e.id)                         as entry_count,
  max(e.occurred_on)                  as last_entry_on
from public.savings_goals g
left join public.savings_goal_entries e on e.goal_id = g.id
group by g.user_id, g.id;

-- The column is gone rather than left as a stale duplicate. Keeping it would
-- recreate exactly the two-sources-of-truth problem §19 of HANDOFF.md
-- complains about with the duplicated privacy policy: whichever one a future
-- reader trusts, the other silently rots.
--
-- COMPATIBILITY: an app build predating this migration reads `saved_amount`
-- via `select *` and writes it on Add, so on such a build a goal's progress
-- reads as blank and Add fails. Closed, not open — and acceptable because the
-- app is in neither store yet (§16.4). Replace the installed build.
alter table public.savings_goals drop column saved_amount;

-- Grants come from 04_grants.sql's default privileges (authenticated,
-- service_role); 14_revoke_anon_dml.sql keeps anon out. Nothing to add here.
