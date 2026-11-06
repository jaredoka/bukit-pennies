-- 32_transaction_direction.sql — optional money-flow direction on every transaction.
--
-- Until now every row was a spend: amount is a positive number and every read
-- path summed it. This adds an optional direction so the app can also record
-- money coming in, refunds, and transfers between the user's own pockets, while
-- leaving the old "it is a spend" behaviour as the default for untagged rows.
--
-- Deliberate choices:
--   • `direction` is NULLABLE. Some people do not want to tag every row, and
--     forcing a choice on a quick cash entry is friction for no benefit.
--   • NULL is an effective `out` in every aggregate. This preserves every
--     existing total and means an untagged row behaves exactly like a spend;
--     the list can still say "Not set".
--   • `refund` is its own direction rather than "in with a category": a refund
--     reduces the original category's spend and is NOT extra money in. Treating
--     it as inflow as well would let one refund improve the dashboard twice.
--   • `in` is money coming in, not "income" in the accounting sense. A salary,
--     a gift, and money someone sends you all land here.
--   • `transfer` is recorded but excluded from every total (bank withdrawal to
--     cash, moving money between your own accounts).
--
-- The summary table stores the *effective* direction (`coalesce(direction,
-- 'out')`), so the RPCs never need a nullable branch in their arithmetic.
-- Transfers are never summarised at all.

create type public.tx_direction as enum ('out', 'in', 'refund', 'transfer');

alter table public.transactions
  add column direction public.tx_direction;

comment on column public.transactions.direction is
  'Optional money-flow direction. NULL = not set, treated as money out by all aggregates.';

-- Existing history is known spends: the app had no way to record anything
-- else. New rows default to NULL ("Not set") unless a capture or the user says
-- otherwise.
update public.transactions set direction = 'out';

create index transactions_user_direction_idx
  on public.transactions (user_id, direction);

-- A refund without a category cannot reduce anything, and silently behaving
-- like plain money in would be the double-count this design avoids.
alter table public.transactions
  add constraint transactions_refund_needs_category
  check (direction is distinct from 'refund' or category_id is not null);

-- ── Summary table gains the direction dimension ──────────────────────────────
-- `direction` is NOT NULL here on purpose: the trigger writes the effective
-- direction. `nulls not distinct` still matters for category_id and merchant.
alter table public.transaction_month_summary
  add column direction public.tx_direction not null default 'out';

alter table public.transaction_month_summary
  drop constraint transaction_month_summary_key;

alter table public.transaction_month_summary
  add constraint transaction_month_summary_key
  unique nulls not distinct
    (user_id, month, currency, category_id, merchant_normalized, direction);

-- ── Apply one transaction to the derived tables ──────────────────────────────
create or replace function public.tx_summary_apply(p_tx public.transactions, p_sign integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date;
  v_direction public.tx_direction;
begin
  if p_tx.parse_status <> 'parsed'
     or p_tx.amount is null
     or p_tx.occurred_at is null then
    return;
  end if;

  -- Untagged is a spend. Transfer is recorded in `transactions` only.
  v_direction := coalesce(p_tx.direction, 'out');
  if v_direction = 'transfer' then
    return;
  end if;

  v_month := date_trunc('month', p_tx.occurred_at at time zone 'Asia/Brunei')::date;

  insert into public.transaction_month_summary as s
    (user_id, month, currency, category_id, merchant_normalized, direction, total, tx_count)
  values
    (p_tx.user_id, v_month, p_tx.currency, p_tx.category_id, p_tx.merchant_normalized,
     v_direction, p_sign * p_tx.amount, p_sign)
  on conflict (user_id, month, currency, category_id, merchant_normalized, direction)
  do update set
    total = s.total + excluded.total,
    tx_count = s.tx_count + excluded.tx_count;

  if p_sign < 0 then
    delete from public.transaction_month_summary
    where user_id = p_tx.user_id
      and month = v_month
      and currency = p_tx.currency
      and category_id is not distinct from p_tx.category_id
      and merchant_normalized is not distinct from p_tx.merchant_normalized
      and direction = v_direction
      and tx_count <= 0;
  end if;
end;
$$;

-- Repair hatch: rebuild now carries direction through as well.
create or replace function public.rebuild_transaction_summaries()
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
    (user_id, month, currency, category_id, merchant_normalized, direction, total, tx_count)
  select
    user_id,
    date_trunc('month', occurred_at at time zone 'Asia/Brunei')::date,
    currency,
    category_id,
    merchant_normalized,
    coalesce(direction, 'out'),
    sum(amount),
    count(*)
  from public.transactions
  where parse_status = 'parsed'
    and amount is not null
    and occurred_at is not null
    and coalesce(direction, 'out') <> 'transfer'
  group by 1, 2, 3, 4, 5, 6;

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

-- Backfill the new dimension now so existing summary rows and the trigger's
-- future writes agree. Everything historical is 'out', which is already the
-- column default, so this is only a safety net for a partially-applied paste.
update public.transaction_month_summary set direction = 'out' where direction is null;

-- ── Keep the old view name, now as net spending ──────────────────────────────
-- Only `monthly_totals` remains from the pre-27 summary surface and it has no
-- live consumer, but leaving it summing refunds as if they were spends would
-- make it silently wrong. `tx_count` counts real spending rows only; refunds
-- reduce the money, not the number of purchases.
create or replace view public.monthly_totals
with (security_invoker = true)
as
select
  user_id,
  month,
  currency::bpchar as currency,
  sum(case when direction = 'refund' then -total else total end) as total,
  sum(case when direction = 'out' then tx_count else 0 end) as tx_count
from public.transaction_month_summary
where direction in ('out', 'refund')
group by user_id, month, currency;

-- ── Dashboard ────────────────────────────────────────────────────────────────
-- Replace the current 4-argument overload (migration 29). Spending is net of
-- refunds, money in is `in` only, transfers never reach the summary.
create or replace function public.dashboard_snapshot(
  p_year integer,
  p_month integer,
  p_currency text,
  p_convert boolean
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
  select
    s.*,
    src.fx_month    as src_fx_month,
    src.rate_to_bnd as src_rate,
    pri.fx_month    as pri_fx_month,
    pri.rate_to_bnd as pri_rate
  from public.transaction_month_summary s
  cross join bounds b
  left join lateral public.bp_fx_asof(s.currency, s.month) src on true
  left join lateral public.bp_fx_asof(p_currency, s.month) pri on true
  where s.user_id = (select auth.uid())
    and s.month between b.first_month and b.last_month
),
valued as (
  select
    s.*,
    case
      when not p_convert then
        case when s.currency = p_currency then s.total end
      when s.src_rate is null or s.pri_rate is null then null
      else s.total * s.src_rate / s.pri_rate
    end as value,
    case
      when not p_convert then
        case when s.currency = p_currency then s.tx_count else 0 end
      when s.src_rate is null or s.pri_rate is null then 0
      else s.tx_count
    end as counted_tx,
    coalesce(
      p_convert
      and s.currency <> p_currency
      and s.src_fx_month is not null
      and s.src_fx_month < s.month,
      false
    ) as approximate
  from scope s
),
spend_valued as (
  select * from valued where direction in ('out', 'refund')
),
income_valued as (
  select * from valued where direction = 'in'
),
this_month_spend as (
  select * from spend_valued
  where month = date_trunc('month', now() at time zone 'Asia/Brunei')::date
),
this_month_income as (
  select * from income_valued
  where month = date_trunc('month', now() at time zone 'Asia/Brunei')::date
),
period_category as (
  select
    category_id,
    sum(case when direction = 'refund' then -value else value end) as total
  from spend_valued
  where value is not null
  group by category_id
  having sum(case when direction = 'refund' then -value else value end) > 0
),
month_category as (
  select
    category_id,
    sum(case when direction = 'refund' then -value else value end) as total
  from this_month_spend
  where value is not null
  group by category_id
  having sum(case when direction = 'refund' then -value else value end) > 0
),
unconverted as (
  select currency, sum(total) as total, sum(tx_count) as tx_count
  from valued
  where p_convert and value is null
  group by currency
)
select jsonb_build_object(
  'period', jsonb_build_object(
    -- Sum of the positive, per-category nets, so the donut and the total agree.
    'total', coalesce((select sum(total) from period_category), 0),
    'tx_count', coalesce((select sum(counted_tx) from spend_valued), 0),
    'money_in', coalesce((select sum(value) from income_valued where value is not null), 0),
    'money_in_tx_count', coalesce((select sum(counted_tx) from income_valued), 0),
    'by_category', coalesce(
      (select jsonb_agg(jsonb_build_object('category_id', category_id, 'total', total) order by total desc)
       from period_category),
      '[]'::jsonb
    ),
    'currencies', coalesce(
      (select jsonb_agg(c order by c) from (select distinct currency as c from scope) d),
      '[]'::jsonb
    )
  ),
  'this_month', jsonb_build_object(
    'total', coalesce((select sum(total) from month_category), 0),
    'tx_count', coalesce((select sum(counted_tx) from this_month_spend), 0),
    'money_in', coalesce((select sum(value) from this_month_income where value is not null), 0),
    'money_in_tx_count', coalesce((select sum(counted_tx) from this_month_income), 0),
    'by_category', coalesce(
      (select jsonb_agg(jsonb_build_object('category_id', category_id, 'total', total) order by total desc)
       from month_category),
      '[]'::jsonb
    )
  ),
  'fx', jsonb_build_object(
    'enabled', p_convert,
    'primary_currency', p_currency,
    'converted_currencies', coalesce(
      (select jsonb_agg(c order by c) from (
         select distinct currency as c from valued
         where p_convert and value is not null and currency <> p_currency
       ) d),
      '[]'::jsonb
    ),
    'approximate', coalesce((select bool_or(approximate) from valued), false),
    'unconverted', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'currency', currency, 'total', total, 'tx_count', tx_count) order by currency)
       from unconverted),
      '[]'::jsonb
    )
  )
);
$$;

-- Pre-29 overload, kept for installed builds. It has no FX arm, so it delegates
-- to the modern one with conversion off rather than growing a second copy of
-- the arithmetic.
create or replace function public.dashboard_snapshot(
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
  select public.dashboard_snapshot(p_year, p_month, p_currency, false);
$$;

-- ── Insights ─────────────────────────────────────────────────────────────────
create or replace function public.insights_year(
  p_year integer,
  p_currency text,
  p_convert boolean
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with scope as (
  select
    s.*,
    src.fx_month    as src_fx_month,
    src.rate_to_bnd as src_rate,
    pri.rate_to_bnd as pri_rate
  from public.transaction_month_summary s
  left join lateral public.bp_fx_asof(s.currency, s.month) src on true
  left join lateral public.bp_fx_asof(p_currency, s.month) pri on true
  where s.user_id = (select auth.uid())
    and s.month between make_date(p_year, 1, 1) and make_date(p_year, 12, 1)
),
valued as (
  select
    s.*,
    case
      when not p_convert then
        case when s.currency = p_currency then s.total end
      when s.src_rate is null or s.pri_rate is null then null
      else s.total * s.src_rate / s.pri_rate
    end as value,
    case
      when not p_convert then
        case when s.currency = p_currency then s.tx_count else 0 end
      when s.src_rate is null or s.pri_rate is null then 0
      else s.tx_count
    end as counted_tx,
    coalesce(
      p_convert
      and s.currency <> p_currency
      and s.src_fx_month is not null
      and s.src_fx_month < s.month,
      false
    ) as approximate
  from scope s
),
spend_valued as (
  select * from valued where direction in ('out', 'refund')
),
income_valued as (
  select * from valued where direction = 'in'
),
month_keys as (
  select distinct month
  from valued
  where value is not null
    and direction in ('out', 'refund', 'in')
),
per_month as (
  select month, sum(case when direction = 'refund' then -value else value end) as total
  from spend_valued
  where value is not null
  group by month
),
per_month_category as (
  select month, jsonb_agg(jsonb_build_object('category_id', category_id, 'total', total) order by total desc) as by_category
  from (
    select month, category_id,
           sum(case when direction = 'refund' then -value else value end) as total
    from spend_valued
    where value is not null
    group by month, category_id
    having sum(case when direction = 'refund' then -value else value end) > 0
  ) g
  group by month
),
per_month_income as (
  select month, sum(value) as money_in
  from income_valued
  where value is not null
  group by month
),
category_totals as (
  select category_id, sum(case when direction = 'refund' then -value else value end) as total
  from spend_valued
  where value is not null
  group by category_id
  having sum(case when direction = 'refund' then -value else value end) > 0
),
merchant_totals as (
  select merchant_normalized, sum(value) as total
  from spend_valued
  where value is not null
    and direction = 'out'
    and merchant_normalized is not null
  group by merchant_normalized
  order by total desc, merchant_normalized
  limit 10
),
unconverted as (
  select currency, sum(total) as total, sum(tx_count) as tx_count
  from valued
  where p_convert and value is null
  group by currency
)
select jsonb_build_object(
  'months', coalesce(
    (select jsonb_agg(
       jsonb_build_object(
         'month', extract(month from k.month)::integer,
         'total', coalesce(m.total, 0),
         'money_in', coalesce(i.money_in, 0),
         'by_category', coalesce(c.by_category, '[]'::jsonb)
       ) order by k.month)
     from month_keys k
     left join per_month m using (month)
     left join per_month_income i using (month)
     left join per_month_category c using (month)),
    '[]'::jsonb
  ),
  'category_totals', coalesce(
    (select jsonb_agg(jsonb_build_object('category_id', category_id, 'total', total) order by total desc)
     from category_totals),
    '[]'::jsonb
  ),
  'merchant_totals', coalesce(
    (select jsonb_agg(jsonb_build_object('merchant_normalized', merchant_normalized, 'total', total)
                      order by total desc, merchant_normalized)
     from merchant_totals),
    '[]'::jsonb
  ),
  'tx_count', coalesce((select sum(counted_tx) from spend_valued), 0),
  'money_in', coalesce((select sum(value) from income_valued where value is not null), 0),
  'fx', jsonb_build_object(
    'enabled', p_convert,
    'primary_currency', p_currency,
    'converted_currencies', coalesce(
      (select jsonb_agg(c order by c) from (
         select distinct currency as c from valued
         where p_convert and value is not null and currency <> p_currency
       ) d),
      '[]'::jsonb
    ),
    'approximate', coalesce((select bool_or(approximate) from valued), false),
    'unconverted', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'currency', currency, 'total', total, 'tx_count', tx_count) order by currency)
       from unconverted),
      '[]'::jsonb
    )
  )
);
$$;

-- Pre-29 overload, same delegation rule as the dashboard wrapper.
create or replace function public.insights_year(
  p_year integer,
  p_currency text default 'BND'
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.insights_year(p_year, p_currency, false);
$$;

-- ── Transaction edit RPC ─────────────────────────────────────────────────────
-- `direction` joins the allowlist. JSON null clears it (the column is
-- nullable); the table's refund/category check is the value-level guard.
create or replace function public.update_transaction(p_id uuid, p_patch jsonb)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_row public.transactions;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'invalid patch: expected a JSON object';
  end if;

  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in (
      'merchant', 'merchant_normalized', 'category_id', 'amount',
      'currency', 'occurred_at', 'card_last4', 'notes', 'bank',
      'parse_status', 'confidence', 'possible_duplicate_of', 'direction'
    ) then
      raise exception 'column "%" is not editable through this path', v_key;
    end if;
  end loop;

  if p_patch ? 'possible_duplicate_of'
     and p_patch -> 'possible_duplicate_of' <> 'null'::jsonb then
    raise exception 'possible_duplicate_of may only be cleared';
  end if;

  if p_patch ? 'confidence'
     and (p_patch ->> 'confidence')::numeric is not null
     and ((p_patch ->> 'confidence')::numeric < 0
          or (p_patch ->> 'confidence')::numeric > 1) then
    raise exception 'confidence must be between 0 and 1';
  end if;

  update public.transactions t
     set merchant = case when p_patch ? 'merchant'
                         then p_patch ->> 'merchant'
                         else t.merchant end,
         merchant_normalized = case when p_patch ? 'merchant_normalized'
                                    then p_patch ->> 'merchant_normalized'
                                    else t.merchant_normalized end,
         category_id = case when p_patch ? 'category_id'
                            then (p_patch ->> 'category_id')::uuid
                            else t.category_id end,
         amount = case when p_patch ? 'amount'
                       then (p_patch ->> 'amount')::numeric
                       else t.amount end,
         currency = case when p_patch ? 'currency'
                         then p_patch ->> 'currency'
                         else t.currency end,
         occurred_at = case when p_patch ? 'occurred_at'
                            then (p_patch ->> 'occurred_at')::timestamptz
                            else t.occurred_at end,
         card_last4 = case when p_patch ? 'card_last4'
                           then p_patch ->> 'card_last4'
                           else t.card_last4 end,
         notes = case when p_patch ? 'notes'
                      then p_patch ->> 'notes'
                      else t.notes end,
         bank = case when p_patch ? 'bank'
                     then (p_patch ->> 'bank')::public.bank_id
                     else t.bank end,
         parse_status = case when p_patch ? 'parse_status'
                             then (p_patch ->> 'parse_status')::public.parse_status
                             else t.parse_status end,
         confidence = case when p_patch ? 'confidence'
                           then (p_patch ->> 'confidence')::real
                           else t.confidence end,
         possible_duplicate_of = case when p_patch ? 'possible_duplicate_of'
                                      then null::uuid
                                      else t.possible_duplicate_of end,
         direction = case when p_patch ? 'direction'
                          then (p_patch ->> 'direction')::public.tx_direction
                          else t.direction end
   where t.id = p_id
     and t.user_id = auth.uid()
   returning * into v_row;

  if not found then
    raise exception 'transaction not found';
  end if;

  return v_row;
end;
$$;

revoke execute on function public.update_transaction(uuid, jsonb) from public, anon;
grant execute on function public.update_transaction(uuid, jsonb) to authenticated;
