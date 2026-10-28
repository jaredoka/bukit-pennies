-- 27_perf_indexes_and_rpcs.sql — make the dashboard flat and the list indexed.
--
-- Three changes, one paste, because all three are answers to the same question:
-- what still costs *more* as history grows?
--
--   1. Index coverage for the list, the review queue and the filter columns
--      (C3/I10/I11), plus trigram indexes for search (C3). No client change.
--   2. Small derived tables maintained on write — month x currency x category x
--      merchant totals, per-user counters, and the filter facets — so the
--      dashboard stops grouping over every row in the account (I2/I3).
--   3. Two RPCs, `dashboard_snapshot` and `insights_year`, that answer the two
--      screens in one request each from those tables (C1/I4/I8).
--
-- Why a summary *table* and not a materialized view: the dashboard is the first
-- screen the app opens, and `refresh materialized view concurrently` needs a
-- unique index of its own plus a scheduled refresh, which means the numbers are
-- either stale (the owner's explicit objection) or refreshed on a timer nobody
-- watches. Row triggers keep it exact at the moment of write.
--
-- Why row-level triggers and not statement-level with transition tables:
-- Postgres rejects REFERENCING with more than one event
-- ("transition tables cannot be specified for triggers with more than one
-- event"), and the incremental arithmetic below is atomic under concurrency
-- because every write to a bucket is a single `INSERT ... ON CONFLICT DO UPDATE`
-- that takes a row lock. A delete-then-reinsert recompute would need advisory
-- locks to stop two concurrent imports from each writing a partial total.
--
-- Neither summary table has a foreign key, and that is deliberate. A cascading
-- `on delete` would change the summary *before* the row triggers ran, and the
-- triggers would then resurrect rows for a transaction that no longer exists.
-- They are derived tables: `transactions` is the only source of truth, and
-- `public.rebuild_transaction_summaries()` can always regenerate them.

-- ── 1. Search: trigram indexes ───────────────────────────────────────────────
-- `transaction_facets` and the list's search both use ILIKE '%term%', which no
-- btree index can answer: the leading wildcard kills prefix matching. pg_trgm
-- indexes the trigrams inside the string instead, so the planner can use an
-- index for `raw_text ilike '%kopi%'`.
--
-- Installed into `extensions` explicitly and referenced with that schema below.
-- Supabase projects keep extensions there; naming the schema means the operator
-- class resolves no matter what the migration's search_path happens to be.
create extension if not exists pg_trgm with schema extensions;

create index transactions_merchant_normalized_trgm_idx
  on public.transactions using gin (merchant_normalized extensions.gin_trgm_ops);
create index transactions_merchant_trgm_idx
  on public.transactions using gin (merchant extensions.gin_trgm_ops);
create index transactions_raw_text_trgm_idx
  on public.transactions using gin (raw_text extensions.gin_trgm_ops);
create index transactions_notes_trgm_idx
  on public.transactions using gin (notes extensions.gin_trgm_ops);

-- ── 2. List pagination ───────────────────────────────────────────────────────
-- The exact order `useFilteredTransactions` asks for, including the NULLS LAST
-- placement of undated rows and the `id` tiebreaker. Without the matching sort
-- direction on `id` the keyset predicate cannot be an index range and Postgres
-- falls back to sorting the whole user's history for every page.
create index transactions_user_list_idx
  on public.transactions (user_id, occurred_at desc nulls last, created_at desc, id desc);

-- ── 3. Review queue + filter columns ─────────────────────────────────────────
-- The review inbox is `parse_status = 'needs_review' OR possible_duplicate_of is
-- not null`, ordered oldest first and capped. A partial index covers exactly the
-- rows the inbox can contain, so the count and the page are proportional to the
-- queue rather than to the account.
create index transactions_user_review_idx
  on public.transactions (user_id, created_at)
  where parse_status = 'needs_review' or possible_duplicate_of is not null;

-- The three list filters that had no index at all. `bank` and `currency` also
-- serve the facets view's underlying scan.
create index transactions_user_bank_idx on public.transactions (user_id, bank);
create index transactions_user_currency_idx on public.transactions (user_id, currency);
create index transactions_user_card_idx on public.transactions (user_id, card_last4);

-- ── 4. Derived tables ────────────────────────────────────────────────────────
-- Granularity: one row per user, Brunei month, currency, category and merchant.
-- That is the smallest grain that still answers every aggregate the app asks
-- for: month totals, category breakdowns (dashboard donut, budgets), top
-- merchants and month x category series (Insights). Cardinality is
-- months x categories x merchants, not transactions — an account with 1,000
-- spends a year across 100 merchants lands near a thousand rows, not ten
-- thousand, and years of history do not multiply the *cost* of reading it.
--
-- Only parsed, dated, priced rows are stored, matching the old `monthly_totals`
-- view exactly. Unpriced or undated rows are Review's business.
create table public.transaction_month_summary (
  user_id uuid not null,
  -- First day of the Brunei month, not UTC: the old view bucketed with
  -- `date_trunc('month', occurred_at at time zone 'Asia/Brunei')`, and a UTC
  -- bucket would put a 00:30 +08 purchase on the 1st into the previous month.
  month date not null,
  currency char(3) not null,
  category_id uuid,
  merchant_normalized text,
  total numeric not null,
  tx_count integer not null,
  -- `nulls not distinct` is what lets one bucket hold "uncategorised" and
  -- "no merchant". With ordinary uniqueness every NULL is its own row, so each
  -- uncategorised spend would create a new bucket and the upsert below would
  -- never merge them.
  constraint transaction_month_summary_key
    unique nulls not distinct (user_id, month, currency, category_id, merchant_normalized)
);

-- Counters the dashboard and the rate-me gate ask for by exact count. A count
-- over the review predicate is index-only with the partial index above, but it
-- is still O(queue); these are two integers on a primary-key read.
create table public.transaction_counters (
  user_id uuid primary key,
  parsed_count integer not null default 0,
  review_count integer not null default 0
);

-- The filter pickers need every distinct bank/card/currency the user has ever
-- used, including banks they only used years ago. That was
-- `select distinct ... from transactions` over the whole account; now the
-- distinct set is maintained as rows appear and disappear.
create table public.transaction_facets_summary (
  user_id uuid not null,
  bank bank_id not null,
  card_last4 text,
  currency char(3) not null,
  constraint transaction_facets_summary_key
    unique nulls not distinct (user_id, bank, card_last4, currency)
);

alter table public.transaction_month_summary enable row level security;
alter table public.transaction_counters enable row level security;
alter table public.transaction_facets_summary enable row level security;

create policy transaction_month_summary_select on public.transaction_month_summary
  for select using (user_id = auth.uid());
create policy transaction_counters_select on public.transaction_counters
  for select using (user_id = auth.uid());
create policy transaction_facets_summary_select on public.transaction_facets_summary
  for select using (user_id = auth.uid());

-- Read-only from the API. There is no insert/update/delete policy above, so RLS
-- already refuses writes; the revoke makes it explicit rather than an inference
-- from the absence of a policy, and 04_grants.sql's default privileges would
-- otherwise have granted them.
revoke insert, update, delete on public.transaction_month_summary from anon, authenticated;
revoke insert, update, delete on public.transaction_counters from anon, authenticated;
revoke insert, update, delete on public.transaction_facets_summary from anon, authenticated;
grant select on public.transaction_month_summary to authenticated;
grant select on public.transaction_counters to authenticated;
grant select on public.transaction_facets_summary to authenticated;

-- ── 5. Apply one transaction to the derived tables ───────────────────────────
-- Each helper takes a row and a sign: +1 for "this row now exists", −1 for "this
-- row no longer exists this way". An UPDATE is (−old, +new), which is what makes
-- a category change or a re-dated row land in the right bucket without any
-- knowledge of which column moved.
--
-- SECURITY DEFINER because the caller is `authenticated`, which has no write
-- grant on these tables. `search_path = ''` with everything schema-qualified,
-- per the convention recorded in 21_function_grant_hygiene.sql.

create function public.tx_summary_apply(p_tx public.transactions, p_sign integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date;
begin
  if p_tx.parse_status <> 'parsed'
     or p_tx.amount is null
     or p_tx.occurred_at is null then
    return;
  end if;

  v_month := date_trunc('month', p_tx.occurred_at at time zone 'Asia/Brunei')::date;

  insert into public.transaction_month_summary as s
    (user_id, month, currency, category_id, merchant_normalized, total, tx_count)
  values
    (p_tx.user_id, v_month, p_tx.currency, p_tx.category_id, p_tx.merchant_normalized,
     p_sign * p_tx.amount, p_sign)
  on conflict (user_id, month, currency, category_id, merchant_normalized)
  do update set
    total = s.total + excluded.total,
    tx_count = s.tx_count + excluded.tx_count;

  -- A bucket whose last transaction left is not a total of zero, it is absence:
  -- keeping it would leave a phantom category in the donut's legend with 0.00
  -- beside it, and the pickers read from a different table so nothing else needs
  -- it. Scoped to this exact bucket, so the delete is one index probe.
  if p_sign < 0 then
    delete from public.transaction_month_summary
    where user_id = p_tx.user_id
      and month = v_month
      and currency = p_tx.currency
      and category_id is not distinct from p_tx.category_id
      and merchant_normalized is not distinct from p_tx.merchant_normalized
      and tx_count <= 0;
  end if;
end;
$$;

create function public.tx_counters_apply(p_tx public.transactions, p_sign integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.transaction_counters as c (user_id, parsed_count, review_count)
  values (
    p_tx.user_id,
    p_sign * (p_tx.parse_status = 'parsed'
              and p_tx.amount is not null
              and p_tx.occurred_at is not null)::integer,
    p_sign * (p_tx.parse_status = 'needs_review'
              or p_tx.possible_duplicate_of is not null)::integer
  )
  on conflict (user_id) do update set
    -- `greatest(..., 0)`: the arithmetic is exact when the triggers see every
    -- write, and the floor is there so a rebuild that runs mid-migration can
    -- never leave a negative counter rendered as "-1 waiting".
    parsed_count = greatest(c.parsed_count + excluded.parsed_count, 0),
    review_count = greatest(c.review_count + excluded.review_count, 0);
end;
$$;

create function public.tx_facets_apply(p_tx public.transactions, p_sign integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_sign > 0 then
    insert into public.transaction_facets_summary (user_id, bank, card_last4, currency)
    values (p_tx.user_id, p_tx.bank, p_tx.card_last4, p_tx.currency)
    on conflict do nothing;
  else
    -- Drop the combination only once nothing is left using it. `is not
    -- distinct from` rather than `=` because an unknown card has a NULL
    -- last4 and NULL = NULL is never true.
    delete from public.transaction_facets_summary f
    where f.user_id = p_tx.user_id
      and f.bank = p_tx.bank
      and f.card_last4 is not distinct from p_tx.card_last4
      and f.currency = p_tx.currency
      and not exists (
        select 1
        from public.transactions t
        where t.user_id = f.user_id
          and t.bank = f.bank
          and t.card_last4 is not distinct from f.card_last4
          and t.currency = f.currency
        limit 1
      );
  end if;
end;
$$;

-- The three trigger entry points. Small on purpose: all of the arithmetic lives
-- in the helpers above, so an INSERT and an UPDATE cannot drift apart.
create function public.tx_derived_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.tx_summary_apply(new, 1);
  perform public.tx_counters_apply(new, 1);
  perform public.tx_facets_apply(new, 1);
  return null;
end;
$$;

create function public.tx_derived_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.tx_summary_apply(old, -1);
  perform public.tx_counters_apply(old, -1);
  perform public.tx_facets_apply(old, -1);
  return null;
end;
$$;

create function public.tx_derived_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Subtract what the row used to contribute, then add what it contributes now.
  -- The subtraction runs first so a row moving out of a bucket that only it
  -- occupied leaves no zero row behind.
  perform public.tx_summary_apply(old, -1);
  perform public.tx_counters_apply(old, -1);
  perform public.tx_facets_apply(old, -1);

  perform public.tx_summary_apply(new, 1);
  perform public.tx_counters_apply(new, 1);
  perform public.tx_facets_apply(new, 1);
  return null;
end;
$$;

-- Nothing outside the owner may call these: they take an arbitrary
-- `transactions` row, so a caller who could reach them could add a total that no
-- transaction backs. Postgres checks EXECUTE at CREATE TRIGGER time, not when
-- the trigger fires, so revoking does not stop the triggers working.
revoke execute on function public.tx_summary_apply(public.transactions, integer) from public, anon, authenticated;
revoke execute on function public.tx_counters_apply(public.transactions, integer) from public, anon, authenticated;
revoke execute on function public.tx_facets_apply(public.transactions, integer) from public, anon, authenticated;
revoke execute on function public.tx_derived_after_insert() from public, anon, authenticated;
revoke execute on function public.tx_derived_after_delete() from public, anon, authenticated;
revoke execute on function public.tx_derived_after_update() from public, anon, authenticated;

-- ── 6. Backfill, then arm the triggers ───────────────────────────────────────
-- Backfill before creating the triggers, or every backfilled row would be
-- counted a second time by the trigger and the totals would double.
insert into public.transaction_month_summary
  (user_id, month, currency, category_id, merchant_normalized, total, tx_count)
select
  user_id,
  date_trunc('month', occurred_at at time zone 'Asia/Brunei')::date,
  currency,
  category_id,
  merchant_normalized,
  sum(amount),
  count(*)
from public.transactions
where parse_status = 'parsed' and amount is not null and occurred_at is not null
group by 1, 2, 3, 4, 5;

insert into public.transaction_counters (user_id, parsed_count, review_count)
select
  user_id,
  count(*) filter (
    where parse_status = 'parsed' and amount is not null and occurred_at is not null
  ),
  count(*) filter (
    where parse_status = 'needs_review' or possible_duplicate_of is not null
  )
from public.transactions
group by user_id;

insert into public.transaction_facets_summary (user_id, bank, card_last4, currency)
select distinct user_id, bank, card_last4, currency
from public.transactions;

create trigger transactions_derived_ins
  after insert on public.transactions
  for each row execute function public.tx_derived_after_insert();

create trigger transactions_derived_upd
  after update on public.transactions
  for each row execute function public.tx_derived_after_update();

create trigger transactions_derived_del
  after delete on public.transactions
  for each row execute function public.tx_derived_after_delete();

-- Repair hatch. The triggers keep the tables exact, but a restore or a manual
-- `alter table ... disable trigger` can leave them wrong, and the honest
-- response to a suspected drift is to recompute rather than to patch numbers by
-- hand. Owner-only: it rewrites every user's rows.
create function public.rebuild_transaction_summaries()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.transaction_month_summary;
  delete from public.transaction_counters;
  delete from public.transaction_facets_summary;

  insert into public.transaction_month_summary
    (user_id, month, currency, category_id, merchant_normalized, total, tx_count)
  select
    user_id,
    date_trunc('month', occurred_at at time zone 'Asia/Brunei')::date,
    currency,
    category_id,
    merchant_normalized,
    sum(amount),
    count(*)
  from public.transactions
  where parse_status = 'parsed' and amount is not null and occurred_at is not null
  group by 1, 2, 3, 4, 5;

  insert into public.transaction_counters (user_id, parsed_count, review_count)
  select
    user_id,
    count(*) filter (
      where parse_status = 'parsed' and amount is not null and occurred_at is not null
    ),
    count(*) filter (
      where parse_status = 'needs_review' or possible_duplicate_of is not null
    )
  from public.transactions
  group by user_id;

  insert into public.transaction_facets_summary (user_id, bank, card_last4, currency)
  select distinct user_id, bank, card_last4, currency
  from public.transactions;
end;
$$;

revoke execute on function public.rebuild_transaction_summaries() from public, anon, authenticated;

-- ── 7. Keep the old view names, now backed by the summary table ──────────────
-- `useMonthlyTotals` and the facets hook already read these names, and so does
-- anything else that was written against them. Replacing the view's *source*
-- rather than its name means the client can be changed in its own time.
--
-- Column list and types are unchanged on purpose: `create or replace view`
-- rejects a rename or a type change, and the point is that nothing downstream
-- can tell the difference except that it is fast.
--
-- `currency::bpchar` is load-bearing, not decoration. The old view got its
-- currency from a `group by`, which drops the `char(3)` typmod and leaves bare
-- `bpchar`; a direct column reference in the new target list keeps the typmod,
-- and `create or replace view` refuses that as a type change
-- (42P16 "cannot change data type of view column"). Verified against a local
-- `supabase db reset` — the first attempt failed exactly there.
create or replace view public.monthly_totals
with (security_invoker = true)
as
select
  user_id,
  month,
  currency::bpchar as currency,
  sum(total) as total,
  sum(tx_count) as tx_count
from public.transaction_month_summary
group by user_id, month, currency;

-- The facets view has to be dropped rather than replaced: it was a DISTINCT over
-- `transactions` and is now a projection of the maintained table, and
-- `create or replace view` cannot change a view into a different query shape
-- when the underlying objects differ. Nothing else depends on it — checked
-- across supabase/ and apps/ before dropping.
drop view public.transaction_facets;

create view public.transaction_facets
with (security_invoker = true)
as
select user_id, bank, card_last4, currency
from public.transaction_facets_summary;

-- ── 8. The two reads the app actually makes ──────────────────────────────────
-- Both are SECURITY INVOKER so the caller's RLS still decides what exists, and
-- `auth.uid()` filters are kept as well so the planner can use the leading
-- `user_id` of every index rather than relying on the policy qual.
--
-- `p_month = 0` means "the whole year" — the dashboard's month wheel has an
-- "All year" position and this avoids a second RPC with a nullable parameter.

create function public.dashboard_snapshot(
  p_year integer,
  p_month integer default 0,
  p_currency text default 'BND'
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with bounds as (
  select
    make_date(p_year, case when p_month between 1 and 12 then p_month else 1 end, 1) as first_month,
    make_date(p_year, case when p_month between 1 and 12 then p_month else 12 end, 1) as last_month
),
scope as (
  select s.*
  from public.transaction_month_summary s, bounds b
  where s.user_id = (select auth.uid())
    and s.month between b.first_month and b.last_month
),
this_month as (
  select s.*
  from public.transaction_month_summary s
  where s.user_id = (select auth.uid())
    and s.month = date_trunc('month', now() at time zone 'Asia/Brunei')::date
),
period_category as (
  select category_id, sum(total) as total
  from scope
  where currency = p_currency
  group by category_id
),
month_category as (
  select category_id, sum(total) as total
  from this_month
  where currency = p_currency
  group by category_id
)
select jsonb_build_object(
  'period', jsonb_build_object(
    'total', coalesce((select sum(total) from scope where currency = p_currency), 0),
    'tx_count', coalesce((select sum(tx_count) from scope where currency = p_currency), 0),
    'by_category', coalesce(
      (select jsonb_agg(jsonb_build_object('category_id', category_id, 'total', total) order by total desc)
       from period_category),
      '[]'::jsonb
    ),
    -- Currencies present in the period, whatever their total, so the dashboard
    -- can say "you also have USD transactions here" without a second query.
    'currencies', coalesce(
      (select jsonb_agg(c order by c) from (select distinct currency as c from scope) d),
      '[]'::jsonb
    )
  ),
  'this_month', jsonb_build_object(
    'total', coalesce((select sum(total) from this_month where currency = p_currency), 0),
    'tx_count', coalesce((select sum(tx_count) from this_month where currency = p_currency), 0),
    'by_category', coalesce(
      (select jsonb_agg(jsonb_build_object('category_id', category_id, 'total', total) order by total desc)
       from month_category),
      '[]'::jsonb
    )
  )
);
$$;

create function public.insights_year(
  p_year integer,
  p_currency text default 'BND'
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with scope as (
  select s.*
  from public.transaction_month_summary s
  where s.user_id = (select auth.uid())
    and s.currency = p_currency
    and s.month between make_date(p_year, 1, 1) and make_date(p_year, 12, 1)
),
per_month as (
  select month, sum(total) as total
  from scope
  group by month
),
per_month_category as (
  select month, jsonb_agg(jsonb_build_object('category_id', category_id, 'total', total) order by total desc) as by_category
  from (
    select month, category_id, sum(total) as total
    from scope
    group by month, category_id
  ) g
  group by month
),
category_totals as (
  select category_id, sum(total) as total
  from scope
  group by category_id
),
merchant_totals as (
  select merchant_normalized, sum(total) as total
  from scope
  where merchant_normalized is not null
  group by merchant_normalized
  order by total desc
  limit 10
)
select jsonb_build_object(
  -- Only months that have data: the client renders twelve bars regardless and
  -- fills the gaps itself, so returning eleven empty objects would be payload
  -- describing nothing.
  'months', coalesce(
    (select jsonb_agg(
       jsonb_build_object(
         'month', extract(month from m.month)::integer,
         'total', m.total,
         'by_category', coalesce(c.by_category, '[]'::jsonb)
       ) order by m.month)
     from per_month m
     left join per_month_category c using (month)),
    '[]'::jsonb
  ),
  'category_totals', coalesce(
    (select jsonb_agg(jsonb_build_object('category_id', category_id, 'total', total) order by total desc)
     from category_totals),
    '[]'::jsonb
  ),
  'merchant_totals', coalesce(
    (select jsonb_agg(jsonb_build_object('merchant_normalized', merchant_normalized, 'total', total))
     from merchant_totals),
    '[]'::jsonb
  ),
  'tx_count', coalesce((select sum(tx_count) from scope), 0)
);
$$;

-- Postgres grants EXECUTE to PUBLIC on every new function, which would expose
-- both through /rest/v1/rpc to anon as well. Narrow to the one role that has a
-- session, per 21_function_grant_hygiene.sql.
revoke execute on function public.dashboard_snapshot(integer, integer, text) from public, anon;
revoke execute on function public.insights_year(integer, text) from public, anon;
grant execute on function public.dashboard_snapshot(integer, integer, text) to authenticated;
grant execute on function public.insights_year(integer, text) to authenticated;
