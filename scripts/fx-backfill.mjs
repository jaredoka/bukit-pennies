#!/usr/bin/env node
/**
 * Backfill `public.fx_rates` with monthly reference rates.
 *
 * The scheduled job in migration 30 only fills forward from the day it starts,
 * and `bp_fx_asof` refuses to price a currency from a rate more than twelve
 * months older. Without this, every month before the job existed would show its
 * foreign-currency rows as "could not be converted" — correct, but useless.
 *
 * This fetches the daily SGD series from Frankfurter (ECB reference rates),
 * averages it into months, and prints one paste-ready SQL statement. It is a
 * one-off: after it, `fx_rollup_months()` keeps the table current.
 *
 * Why SGD is the base: the ECB does not publish BND. Under the Currency
 * Interchangeability Agreement BND and SGD trade 1:1, so a rate expressed as
 * "1 SGD = N foreign" inverts straight into `rate_to_bnd` with BND standing in
 * for SGD. The same identity is why `bp_fx_asof` returns 1 for BND without a
 * stored row, and why this script stores SGD = 1 rather than fetching it.
 *
 * What is deliberately left out: the current month. Averages of a partial month
 * are not that month's average, and publishing one would make the dashboard's
 * converted total change every day for no user action. The RPCs fall back to
 * the previous month and report the result as approximate until the month is
 * complete and the scheduled rollup fills it in.
 *
 * Usage:
 *   node scripts/fx-backfill.mjs                 # 60 complete months to stdout
 *   node scripts/fx-backfill.mjs --months 24
 *   node scripts/fx-backfill.mjs --from 2020-01 --out fx-backfill.sql
 */

import { writeFile } from 'node:fs/promises';

const API = 'https://api.frankfurter.dev/v1';
const SOURCE = 'frankfurter monthly average (backfill)';

function parseArgs(argv) {
  const args = { months: 60, from: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--months') args.months = Number(argv[++i]);
    else if (arg === '--from') args.from = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/fx-backfill.mjs [--months N] [--from YYYY-MM] [--out FILE]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

/** 'YYYY-MM' for a date, in UTC (the API works in calendar dates). */
const monthKey = (date) => date.toISOString().slice(0, 7);

/** The first not-yet-complete month, i.e. the start of the current month. */
function currentMonthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function shiftMonths(date, months) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function lastDayOfPreviousMonth() {
  const start = currentMonthStart();
  return new Date(start.getTime() - 24 * 60 * 60 * 1000);
}

function parseMonth(value) {
  if (!/^\d{4}-\d{2}$/.test(value ?? '')) {
    throw new Error(`--from must look like YYYY-MM, got ${value}`);
  }
  const [year, month] = value.split('-').map(Number);
  if (month < 1 || month > 12) throw new Error(`--from month out of range: ${value}`);
  return new Date(Date.UTC(year, month - 1, 1));
}

const isoDay = (date) => date.toISOString().slice(0, 10);

async function fetchSeries(from, to) {
  const url = `${API}/${isoDay(from)}..${isoDay(to)}?base=SGD`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Frankfurter returned ${response.status} for ${url}`);
  }
  const body = await response.json();
  if (!body || typeof body.rates !== 'object') {
    throw new Error(`Unexpected Frankfurter payload: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body.rates;
}

/**
 * `{"YYYY-MM-01": {"USD": "0.7412", ...}}` of averages, each rounded to ten
 * decimals — the scale of `fx_rates.rate_to_bnd`.
 *
 * `firstDay`/`lastDay` are applied here, not just at the API: Frankfurter snaps
 * a requested start to the previous publication day, so a request beginning on
 * the 1st arrives with the last day of the *previous* month attached. Bucketing
 * that day would file one stray observation under a month the caller never asked
 * for and drag its average.
 */
function monthlyAverages(dailyRates, firstDay, lastDay) {
  const sums = new Map();
  for (const [day, rates] of Object.entries(dailyRates)) {
    if (day < firstDay || day > lastDay) continue;
    const month = `${day.slice(0, 7)}-01`;
    const bucket = sums.get(month) ?? new Map();
    for (const [currency, quoted] of Object.entries(rates)) {
      const value = Number(quoted);
      if (!Number.isFinite(value) || value <= 0) continue;
      // 1 SGD buys `value` of `currency`, so one unit of the currency is
      // 1/value BND.
      const rate = 1 / value;
      const entry = bucket.get(currency) ?? { sum: 0, count: 0 };
      entry.sum += rate;
      entry.count += 1;
      bucket.set(currency, entry);
    }
    sums.set(month, bucket);
  }

  const out = {};
  for (const [month, bucket] of [...sums.entries()].sort()) {
    const row = { SGD: 1 };
    for (const [currency, entry] of [...bucket.entries()].sort()) {
      row[currency] = Number((entry.sum / entry.count).toFixed(10));
    }
    out[month] = row;
  }
  return out;
}

function toSql(averages) {
  // JSON holds no single quotes, so the literal needs no escaping.
  const json = JSON.stringify(averages);
  return [
    '-- Generated by scripts/fx-backfill.mjs. Paste into the Supabase SQL editor.',
    '-- Idempotent: re-running it replaces the same months with the same values.',
    'insert into public.fx_rates (month, currency, rate_to_bnd, source)',
    "select m.key::date, r.key, r.value::numeric, '" + SOURCE + "'",
    `from jsonb_each('${json}'::jsonb) as m(key, value)`,
    'cross join lateral jsonb_each_text(m.value) as r(key, value)',
    'on conflict (month, currency) do update',
    '  set rate_to_bnd = excluded.rate_to_bnd,',
    '      source = excluded.source,',
    '      fetched_at = now();',
    '',
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!Number.isInteger(args.months) || args.months < 1) {
    throw new Error('--months must be a positive integer');
  }

  const lastComplete = lastDayOfPreviousMonth();
  const from = args.from
    ? parseMonth(args.from)
    : shiftMonths(currentMonthStart(), -args.months);

  if (from > lastComplete) {
    throw new Error(
      `${monthKey(from)} has not finished yet; there is no month average to backfill.`,
    );
  }

  const missing = (lastComplete.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (lastComplete.getUTCMonth() - from.getUTCMonth()) + 1;
  console.error(`Fetching ${isoDay(from)} to ${isoDay(lastComplete)} (${missing} months)...`);

  const averages = monthlyAverages(
    await fetchSeries(from, lastComplete),
    isoDay(from),
    isoDay(lastComplete),
  );
  const months = Object.keys(averages);
  const currencies = new Set(months.flatMap((month) => Object.keys(averages[month])));

  if (months.length === 0) throw new Error('The API returned no rates.');
  const have = new Set(months);
  const absent = [];
  for (let d = new Date(from); d <= lastComplete; d = shiftMonths(d, 1)) {
    if (!have.has(`${monthKey(d)}-01`)) absent.push(monthKey(d));
  }
  // A month with no ECB publication at all (or an API gap) is worth saying out
  // loud; those months will convert at an earlier month's rate, or not at all.
  if (absent.length > 0) {
    console.error(`Warning: no rates for ${absent.join(', ')}`);
  }

  const sql = toSql(averages);
  if (args.out) {
    await writeFile(args.out, sql, 'utf8');
    console.error(`Wrote ${args.out}`);
  } else {
    process.stdout.write(sql);
  }

  console.error(
    `${months.length} months x ${currencies.size} currencies ` +
      `(${monthKey(from)} to ${monthKey(lastComplete)}), ${(sql.length / 1024).toFixed(1)} KiB.`,
  );
}

main().catch((error) => {
  console.error(String(error?.message ?? error));
  process.exit(1);
});
