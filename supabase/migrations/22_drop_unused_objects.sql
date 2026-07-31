-- 22_drop_unused_objects.sql — remove two objects nothing reads.
--
-- Both are dead in the same way: they were built for a feature that either
-- moved elsewhere or never arrived, and nothing in apps/, packages/, supabase/
-- or scripts/ has referenced them since. They are dropped for the reason
-- migration 21 gives for its unnecessary grants — an object that exists is a
-- fact every future security pass has to re-derive, and `04_grants.sql` hands
-- `authenticated` full DML on every table by default, so a table nobody
-- maintains is still a table anyone can write to.

-- ── 1. merchant_totals: the dashboard card it fed is gone ──────────────────
-- Added in 03_functions_views.sql for the dashboard's "Top merchants" card and
-- widened in 08 to fold SGD into BND at par. That card was removed on
-- 2026-07-30 (playbook decision log) because Insights covers the same ground
-- better — and Insights computes its merchant totals from the transactions it
-- already fetched for the year, so it never read this view. The last client
-- reference (`useTopMerchants`) goes in the same PR as this migration.
--
-- monthly_totals stays: the dashboard still reads it for the notification
-- digest's "spent this month" figure.
drop view if exists public.merchant_totals;

-- ── 2. user_cards: written by the seed, read by nothing ────────────────────
-- Created in 01_schema.sql for card labels — naming "•0213" as "Baiduri Visa"
-- so the transactions list and the Card filter could show something friendlier
-- than four digits. The app never gained that feature: no query, mutation or
-- type in apps/mobile touches this table, and the only INSERT anywhere is in
-- the dev-only seed.
--
-- Dropped rather than left dormant. The feature is still a good idea, and if it
-- is built the table comes back in a migration alongside the screen that reads
-- it — at which point its shape can match what that screen actually needs,
-- rather than what was guessed for it in migration 01.
--
-- Its four RLS policies go with it (dropping a table drops its policies), as
-- does the `card_last4 ~ '^\d{4}$'` check that migration 20 cited as the
-- precedent for adding the same constraint to `transactions` — that one stays
-- where it now matters.
drop table if exists public.user_cards;
