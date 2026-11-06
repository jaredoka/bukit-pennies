-- 30_fx_refresh.sql — keep `fx_rates` current without anyone pasting SQL monthly.
--
-- Migration 29 gave the app a rate table and the functions that read it, but a
-- table with no writer is a table that goes stale: every month would need a new
-- row by hand, and the dashboard would quietly fall back to the previous
-- month's rate (or stop converting) until someone noticed.
--
-- The pipeline is three small steps, each its own function so it can be run and
-- inspected on its own:
--
--   fx_fetch_daily()   queues one HTTP request for the daily SGD series.
--   fx_ingest_daily()  parses whatever responses have arrived into `fx_daily`.
--   fx_rollup_months() averages complete months of `fx_daily` into `fx_rates`,
--                      which is the only table the app reads.
--
-- Why the split, when one function would be shorter: `net.http_get` is
-- asynchronous. The response is written by a pg_net worker after the calling
-- transaction commits, so a fetch-and-parse function would always parse nothing.
-- Staging daily observations also means the monthly average can be recomputed —
-- a corrected or late publication self-heals on the next rollup instead of
-- needing a manual edit.
--
-- Why the current month is not rolled up: an average of the month so far is not
-- that month's average, and publishing it would make the converted total change
-- every day for no user action. Until the month closes, `bp_fx_asof` uses the
-- previous month and the RPCs report the result as approximate. Same rule as
-- scripts/fx-backfill.mjs, so the two agree on where a month's rate comes from.
--
-- Failure is quiet and bounded, on purpose. A missing rate costs one currency
-- one month of conversion: the RPCs list it in `fx.unconverted` and the app says
-- so. Nothing here can break a dashboard query — the app degrades to its
-- pre-conversion behaviour, which is exactly what it did before 29.

-- ── 1. Extensions ────────────────────────────────────────────────────────────
-- Both are present on hosted Supabase. Locally pg_net is installed but pg_cron
-- is not preloaded, and a bare `create extension pg_cron` would fail `db reset`
-- on every developer machine. Extension load order is infrastructure, not this
-- app's business, so a refusal is logged and the rest of the migration still
-- applies; only the schedules are skipped.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron not enabled (%); FX refresh will need to be scheduled by hand', sqlerrm;
  end;
  begin
    create extension if not exists pg_net;
  exception when others then
    raise notice 'pg_net not enabled (%); FX refresh cannot fetch rates', sqlerrm;
  end;
end $$;

-- ── 2. Staging ───────────────────────────────────────────────────────────────
-- One row per (publication day, currency), straight from the source, in BND per
-- unit. The app never reads this table; it exists so the monthly average can be
-- recomputed rather than overwritten blindly.
create table public.fx_daily (
  day         date          not null,
  currency    text          not null check (currency = upper(currency) and length(currency) = 3),
  rate_to_bnd numeric(18,10) not null check (rate_to_bnd > 0),
  source      text          not null,
  fetched_at  timestamptz   not null default now(),
  primary key (day, currency)
);

comment on table public.fx_daily is
  'Daily reference rates, staging for monthly averages. Internal: the app reads '
  'public.fx_rates only. BND/SGD are not requested (the API is SGD-based and the '
  'two currencies are 1:1) and are synthesised during rollup.';

-- Which pg_net request ids belong to us. Without this, ingest would have to
-- guess from `net._http_response` content, and would happily parse a response
-- left by an unrelated feature.
create table public.fx_fetch_log (
  id           bigint primary key,
  requested_at timestamptz not null default now(),
  ingested_at  timestamptz
);

comment on table public.fx_fetch_log is
  'pg_net request ids for FX fetches, so ingest only reads its own responses. '
  'Rows are pruned after seven days.';

alter table public.fx_daily enable row level security;
alter table public.fx_fetch_log enable row level security;

-- No policies: these are not part of the client API. RLS alone would deny the
-- app, and the revokes make that explicit rather than incidental.
revoke all on public.fx_daily from anon, authenticated;
revoke all on public.fx_fetch_log from anon, authenticated;

-- ── 3. Fetch ─────────────────────────────────────────────────────────────────
-- Frankfurter is the ECB's daily reference set, free and keyless. Its base is a
-- currency, so asking for SGD gives "1 SGD = N of each currency", which inverts
-- to `rate_to_bnd` because BND is 1:1 with SGD. Omitting `symbols` returns the
-- whole published set (~30), so a trip to Japan does not need a code change.
create function public.fx_fetch_daily()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today  date := (pg_catalog.now() at time zone 'Asia/Brunei')::date;
  -- The start of last month: the newest month the rollup can publish. Every run
  -- re-requests from here, so the month being averaged is always covered from
  -- its first day and a single lost response heals on the next run.
  v_recent date := (
    pg_catalog.date_trunc('month', pg_catalog.now() at time zone 'Asia/Brunei')::date
    - interval '1 month'
  )::date;
  v_start  date;
  v_url    text;
  v_id     bigint;
begin
  -- Resume from the last day we have, so a week of downtime is caught up in one
  -- request, but never start later than last month: a cold start or a lost
  -- response must not leave the month being rolled up short of days.
  select least(v_recent, coalesce(max(d.day) + 1, v_recent))
  into v_start
  from public.fx_daily d;

  if v_start > v_today then
    return null;
  end if;

  v_url := pg_catalog.format(
    'https://api.frankfurter.dev/v1/%s..%s?base=SGD',
    pg_catalog.to_char(v_start, 'YYYY-MM-DD'),
    pg_catalog.to_char(v_today, 'YYYY-MM-DD')
  );

  select net.http_get(url := v_url, timeout_milliseconds := 15000) into v_id;

  insert into public.fx_fetch_log (id) values (v_id);
  return v_id;
end;
$$;

comment on function public.fx_fetch_daily() is
  'Queues one pg_net request for the daily SGD series and records its id. '
  'Returns the request id, or null when there is nothing new to fetch. '
  'Maintenance only; not executable by the app.';

-- ── 4. Ingest ────────────────────────────────────────────────────────────────
create function public.fx_ingest_daily()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r       record;
  v_rows  integer := 0;
  v_batch integer;
begin
  for r in
    select f.id, h.status_code, h.content
    from public.fx_fetch_log f
    left join net._http_response h on h.id = f.id
    where f.ingested_at is null
      and f.requested_at > pg_catalog.now() - interval '2 days'
    order by f.id
  loop
    -- Not delivered yet: pg_net writes the response after the request body
    -- commits, so an empty slot is normal, not an error.
    if r.status_code is null then
      continue;
    end if;

    if r.status_code = 200 and r.content is not null then
      begin
        with payload as (
          select (r.content::jsonb) -> 'rates' as rates
        ),
        days as (
          select d.key as day, d.value as quotes
          from payload, pg_catalog.jsonb_each(payload.rates) as d(key, value)
          where d.key ~ '^\d{4}-\d{2}-\d{2}$'
        ),
        quotes as (
          select days.day::date as day, q.key as currency, q.value::numeric as quoted
          from days, pg_catalog.jsonb_each_text(days.quotes) as q(key, value)
        )
        insert into public.fx_daily (day, currency, rate_to_bnd, source)
        select q.day, pg_catalog.upper(q.currency), 1 / q.quoted, 'frankfurter daily'
        from quotes q
        where q.quoted > 0
        on conflict (day, currency) do update
          set rate_to_bnd = excluded.rate_to_bnd,
              fetched_at = pg_catalog.now();

        get diagnostics v_batch = row_count;
        v_rows := v_rows + v_batch;
      exception when others then
        -- A malformed payload costs one day's rates, not the whole run. The
        -- next fetch re-requests the gap.
        raise warning 'fx_ingest_daily: request % could not be parsed: %', r.id, sqlerrm;
      end;
    else
      raise warning 'fx_ingest_daily: request % returned %', r.id, r.status_code;
    end if;

    update public.fx_fetch_log set ingested_at = pg_catalog.now() where id = r.id;
  end loop;

  -- pg_net keeps responses for six hours by default; a log row older than that
  -- can never be ingested, and keeping it would retry forever.
  delete from public.fx_fetch_log
  where requested_at < pg_catalog.now() - interval '7 days';

  return v_rows;
end;
$$;

comment on function public.fx_ingest_daily() is
  'Parses delivered pg_net responses into public.fx_daily. Idempotent: the same '
  'response can be ingested twice and the upsert lands on the same values. '
  'Maintenance only; not executable by the app.';

-- ── 5. Roll up complete months ───────────────────────────────────────────────
create function public.fx_rollup_months()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff date := pg_catalog.date_trunc(
    'month',
    (pg_catalog.now() at time zone 'Asia/Brunei')
  )::date;
  v_rows integer;
begin
  with observations as (
    select d.day, d.currency, d.rate_to_bnd
    from public.fx_daily d
    where d.day < v_cutoff
    union all
    -- The API is SGD-based and BND is 1:1 with SGD, so one SGD is one BND by
    -- definition. Storing it here (rather than special-casing SGD alongside BND
    -- in bp_fx_asof) keeps the identity in one place: BND in the resolver, SGD
    -- in the writer that produces SGD-denominated rates.
    select distinct d.day, 'SGD', 1::numeric
    from public.fx_daily d
    where d.day < v_cutoff
  )
  insert into public.fx_rates (month, currency, rate_to_bnd, source, fetched_at)
  select
    pg_catalog.date_trunc('month', o.day)::date,
    o.currency,
    pg_catalog.round(pg_catalog.avg(o.rate_to_bnd), 10),
    'frankfurter monthly average',
    pg_catalog.now()
  from observations o
  group by 1, 2
  on conflict (month, currency) do update
    set rate_to_bnd = excluded.rate_to_bnd,
        source = excluded.source,
        fetched_at = excluded.fetched_at
    -- Only touch rows whose average actually moved. Without this the hourly job
    -- would rewrite every historical month on every run, which is churn the
    -- table does not need.
    where public.fx_rates.rate_to_bnd is distinct from excluded.rate_to_bnd;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

comment on function public.fx_rollup_months() is
  'Averages complete months of public.fx_daily into public.fx_rates, plus SGD '
  'at 1. Months already current are left untouched. Maintenance only; not '
  'executable by the app.';

-- ── 6. Grants ────────────────────────────────────────────────────────────────
-- SECURITY DEFINER plus owner-only: these write reference data for every user,
-- so the app must not be able to call them. The default PUBLIC grant is removed
-- explicitly; `revoke ... from public` is not implied by revoking the app roles.
revoke execute on function public.fx_fetch_daily() from public, anon, authenticated;
revoke execute on function public.fx_ingest_daily() from public, anon, authenticated;
revoke execute on function public.fx_rollup_months() from public, anon, authenticated;

-- ── 7. Schedules ─────────────────────────────────────────────────────────────
-- Times are UTC (pg_cron's own default). The ECB publishes around 16:00 CET —
-- 15:00 UTC in winter, 14:00 in summer — so a fetch at 19:15 UTC is safely after
-- the close and 03:15 in Brunei, when nobody is looking at the dashboard.
--
-- Ingest and rollup run hourly rather than once behind the fetch: pg_net writes
-- responses asynchronously, and an hourly retry absorbs a slow or dropped
-- response (responses live six hours) without a second schedule per step. Both
-- are idempotent and cost a scan of a few thousand staging rows.
--
-- If pg_cron is not installed the block is skipped with a notice. Scheduling is
-- deliberately not allowed to fail the migration: the tables and functions are
-- still correct and useful, and the owner can schedule them from the dashboard.
do $$
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed; skipping FX refresh schedules';
    return;
  end if;

  begin
    perform cron.schedule(
      'bp_fx_fetch',
      '15 19 * * *',
      'select public.fx_fetch_daily()'
    );
    perform cron.schedule(
      'bp_fx_ingest',
      '7 * * * *',
      'select public.fx_ingest_daily()'
    );
    perform cron.schedule(
      'bp_fx_rollup',
      '37 * * * *',
      'select public.fx_rollup_months()'
    );
    raise notice 'FX refresh scheduled: fetch 19:15 UTC daily, ingest hourly at :07, rollup hourly at :37';
  exception when others then
    raise notice 'FX refresh schedules were not created (%); schedule them by hand', sqlerrm;
  end;
end $$;
