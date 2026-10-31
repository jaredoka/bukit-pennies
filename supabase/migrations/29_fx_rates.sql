-- 29_fx_rates.sql — optional conversion of other currencies into the primary one.
--
-- Today the app is currency-pure: the dashboard, Insights and budget progress
-- each filter the summary on one currency and a USD or MYR purchase simply
-- does not appear. This adds the *option* to fold those currencies into the
-- user's primary currency.
--
-- Why monthly averages, and why that is not a shortcut: `transaction_month_summary`
-- is keyed by (user_id, month, currency) and a monthly rate is keyed by exactly
-- (month, currency), so conversion is a join against a handful of rate rows
-- rather than against transactions. The dashboard stays flat at any history
-- size. Per-transaction rates would force a row-level join and put back the
-- O(rows) cost migration 27 removed.
--
-- Why read-time conversion and not a stored `amount_bnd`: the primary currency
-- is a setting, and a user who changes it must not need a backfill. Storing the
-- original amount and currency untouched is also the only way the numbers stay
-- reconcilable with the bank statement.
--
-- Shape of the rate: `rate_to_bnd` is "1 unit of `currency` equals N BND", so
-- converting C into P is `amount * rate(C) / rate(P)` and no currency is
-- privileged in the schema.
--
-- BND is 1 by definition (Currency Interchangeability Agreement, 1:1 with SGD)
-- and is resolved in `bp_fx_asof` rather than stored. Seeding a BND row per
-- month would mean every new month is broken until someone inserts one.
--
-- Missing rates fail closed: the caller gets NULL, the RPCs exclude the row and
-- list it in their `fx.unconverted` block, and the client shows it. A currency
-- is never silently dropped and a total is never silently zero.

-- ── 1. The rate table ────────────────────────────────────────────────────────
create table public.fx_rates (
  month       date          not null,
  currency    text          not null check (currency = upper(currency) and length(currency) = 3),
  rate_to_bnd numeric(18,10) not null check (rate_to_bnd > 0),
  source      text          not null,
  fetched_at  timestamptz   not null default now(),
  primary key (month, currency)
);

comment on table public.fx_rates is
  'Monthly reference rates. rate_to_bnd = how many BND one unit of currency buys. '
  'Reference data only; user transactions are never rewritten from it.';

alter table public.fx_rates enable row level security;

-- Read-only to the app. Writes come from the backfill paste or the scheduled
-- job, both of which run as the table owner and bypass RLS.
create policy "fx rates are readable" on public.fx_rates
  for select to authenticated using (true);

revoke insert, update, delete on public.fx_rates from anon, authenticated;
grant select on public.fx_rates to authenticated;

-- ── 2. Resolving a rate ──────────────────────────────────────────────────────
-- Returns the rate for the month in question, or the nearest earlier month
-- within a year. Beyond a year the data is too stale to call a conversion, so
-- the caller gets no row and treats the currency as unconvertible.
--
-- The row also carries the month the rate actually came from, so the RPCs can
-- report "approximate" when it is not the transaction's own month.
create function public.bp_fx_asof(p_currency text, p_month date)
returns table (fx_month date, rate_to_bnd numeric)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_currency is null or p_month is null then
    return;
  end if;

  if upper(p_currency) = 'BND' then
    return query select p_month, 1::numeric;
    return;
  end if;

  return query
    select r.month, r.rate_to_bnd
    from public.fx_rates r
    where r.currency = upper(p_currency)
      and r.month <= p_month
      and r.month >= p_month - interval '12 months'
    order by r.month desc
    limit 1;
end;
$$;

comment on function public.bp_fx_asof(text, date) is
  'Rate to BND for a currency in a month, nearest earlier within 12 months. '
  'No row means unconvertible. BND resolves to 1 without a stored rate.';

-- `amount` in `p_from` expressed in `p_to`, both at `p_month`. NULL when either
-- side has no usable rate; the same currency returns the amount unchanged so a
-- conversion pass cannot introduce rounding on rows that need none.
create function public.bp_convert(
  p_amount numeric,
  p_from text,
  p_to text,
  p_month date
)
returns numeric
language sql
stable
set search_path = ''
as $$
  select case
    when p_amount is null then null
    when upper(coalesce(p_from, '')) = upper(coalesce(p_to, '')) then p_amount
    else (
      select p_amount * f.rate_to_bnd / t.rate_to_bnd
      from public.bp_fx_asof(p_from, p_month) f,
           public.bp_fx_asof(p_to, p_month) t
      limit 1
    )
  end
$$;

comment on function public.bp_convert(numeric, text, text, date) is
  'The one conversion formula. Both RPCs and the client mirror it so the '
  'dashboard, Insights and per-row approximations cannot disagree.';

-- ── 3. The dashboard, with an optional conversion ────────────────────────────
-- A new overload rather than a changed signature: the installed build calls
-- three arguments and must keep working while the SQL lands, and PostgREST
-- resolves overloads by the arguments actually sent. `p_convert` has no default
-- precisely so the two arms stay unambiguous.
--
-- `p_month = 0` still means "the whole year".

create function public.dashboard_snapshot(
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
    src.fx_month   as src_fx_month,
    src.rate_to_bnd as src_rate,
    pri.fx_month   as pri_fx_month,
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
this_month as (
  select v.* from valued v
  where v.month = date_trunc('month', now() at time zone 'Asia/Brunei')::date
),
period_category as (
  select category_id, sum(value) as total
  from valued where value is not null group by category_id
),
month_category as (
  select category_id, sum(value) as total
  from this_month where value is not null group by category_id
),
unconverted as (
  select currency, sum(total) as total, sum(tx_count) as tx_count
  from valued
  where p_convert and value is null
  group by currency
)
select jsonb_build_object(
  'period', jsonb_build_object(
    'total', coalesce((select sum(value) from valued), 0),
    'tx_count', coalesce((select sum(counted_tx) from valued), 0),
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
    'total', coalesce((select sum(value) from this_month), 0),
    'tx_count', coalesce((select sum(counted_tx) from this_month), 0),
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

-- ── 4. Insights, with the same option ────────────────────────────────────────

-- Both RPCs below are new overloads and order `merchant_totals` by total then
-- name. The 3-arg twins keep the old "order by total desc" alone until they are
-- retired, so equally-sized merchants can come back in a different order there;
-- that only affects the ordering of ties, and the old functions exist solely for
-- builds that predate this migration.
create function public.insights_year(
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
    src.fx_month   as src_fx_month,
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
per_month as (
  select month, sum(value) as total
  from valued
  where value is not null
  group by month
),
per_month_category as (
  select month, jsonb_agg(jsonb_build_object('category_id', category_id, 'total', total) order by total desc) as by_category
  from (
    select month, category_id, sum(value) as total
    from valued
    where value is not null
    group by month, category_id
  ) g
  group by month
),
category_totals as (
  select category_id, sum(value) as total
  from valued
  where value is not null
  group by category_id
),
merchant_totals as (
  select merchant_normalized, sum(value) as total
  from valued
  where value is not null and merchant_normalized is not null
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
    (select jsonb_agg(jsonb_build_object('merchant_normalized', merchant_normalized, 'total', total)
                      order by total desc, merchant_normalized)
     from merchant_totals),
    '[]'::jsonb
  ),
  'tx_count', coalesce((select sum(counted_tx) from valued), 0),
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

-- ── 5. Grants ────────────────────────────────────────────────────────────────
-- Same hygiene as 27: no function is reachable by anon, and the resolver is
-- callable by the roles that need it rather than by PUBLIC.
revoke execute on function public.bp_fx_asof(text, date) from public, anon;
revoke execute on function public.bp_convert(numeric, text, text, date) from public, anon;
revoke execute on function public.dashboard_snapshot(integer, integer, text, boolean) from public, anon;
revoke execute on function public.insights_year(integer, text, boolean) from public, anon;

grant execute on function public.bp_fx_asof(text, date) to authenticated;
grant execute on function public.bp_convert(numeric, text, text, date) to authenticated;
grant execute on function public.dashboard_snapshot(integer, integer, text, boolean) to authenticated;
grant execute on function public.insights_year(integer, text, boolean) to authenticated;
