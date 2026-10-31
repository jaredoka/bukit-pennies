/**
 * Currency conversion, mirroring `bp_fx_asof` / `bp_convert` in migration 29.
 *
 * Two things use this: the row-shaped fallback for screens (so the client can
 * price a transaction the dashboard has already totalled) and the per-row
 * "≈ BND 12.34" label plus the CSV columns. The SQL and this module must agree
 * to the cent, so the same fixture table is asserted against both — see
 * `test/fx.test.ts` and the psql checks recorded in HANDOFF §50.
 *
 * The rules, and why each exists:
 *
 *   * Rates are monthly and stored as "1 unit of currency = N BND". Converting
 *     C into P is `amount * rate(C) / rate(P)`, so no currency is privileged.
 *   * BND is 1 by definition (1:1 with SGD under the Currency Interchangeability
 *     Agreement) and is never stored. A missing BND row cannot break conversion.
 *   * A month with no stored rate falls back to the nearest earlier month
 *     within twelve months. Older than that is treated as unknown rather than
 *     guessed, so the caller can show "could not convert" instead of a number
 *     that is quietly wrong.
 *   * Same currency returns the amount untouched, so a conversion pass cannot
 *     introduce rounding on rows that need none.
 *   * Nothing here rounds. Totals round once at presentation; rounding each row
 *     would make the parts disagree with the sum the server returned.
 */
import { bruneiParts } from './format';

/** One row of `public.fx_rates`; `rate_to_bnd` arrives as a string in JSON. */
export interface FxRateRow {
  month: string;
  currency: string;
  rate_to_bnd: number | string;
}

/** currency → rates sorted oldest-first. */
export type FxTable = Map<string, { month: string; rate: number }[]>;

/** Matches the SQL window: a year of staleness, then give up. */
export const FX_FALLBACK_MONTHS = 12;

export function emptyFxTable(): FxTable {
  return new Map();
}

/** Builds the lookup from whichever rows the client managed to load. */
export function buildFxTable(rows: FxRateRow[]): FxTable {
  const table: FxTable = new Map();
  for (const row of rows) {
    const rate = Number(row.rate_to_bnd);
    if (!Number.isFinite(rate) || rate <= 0) continue;
    const currency = row.currency.toUpperCase();
    const list = table.get(currency) ?? [];
    list.push({ month: monthKeyOf(row.month), rate });
    table.set(currency, list);
  }
  for (const list of table.values()) list.sort((a, b) => (a.month < b.month ? -1 : 1));
  return table;
}

/**
 * `'YYYY-MM-01'` for a timestamp, in Brunei time — the same month bucket the
 * summary table uses, so a transaction at 00:30 on the 1st does not land in the
 * previous month's rate.
 */
export function bruneiMonthKey(iso: string): string {
  const parts = bruneiParts(iso);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-01`;
}

/** Normalises a date or timestamp to the first of its month. */
export function monthKeyOf(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

/** Shifts a `'YYYY-MM-01'` key by whole months. */
export function shiftMonth(key: string, months: number): string {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const total = year * 12 + (month - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

export interface ResolvedRate {
  /** The month the rate actually came from, which may predate `month`. */
  month: string;
  rate: number;
}

/**
 * The rate to BND for `currency` in `month`, nearest earlier within a year.
 * `null` means unconvertible — callers must treat that as "not counted", never
 * as 1.
 */
export function rateAt(
  table: FxTable,
  currency: string,
  month: string,
): ResolvedRate | null {
  const code = currency.toUpperCase();
  if (code === 'BND') return { month, rate: 1 };

  const rates = table.get(code);
  if (!rates?.length) return null;

  const earliest = shiftMonth(month, -FX_FALLBACK_MONTHS);
  let best: ResolvedRate | null = null;
  for (const entry of rates) {
    if (entry.month > month) break;
    if (entry.month < earliest) continue;
    best = { month: entry.month, rate: entry.rate };
  }
  return best;
}

/**
 * `amount` in `from` expressed in `to`, both priced in `month`.
 * `null` when either side has no usable rate — the same "excluded, not zero"
 * contract the RPCs use.
 */
export function convertAmount(
  amount: number,
  from: string,
  to: string,
  month: string,
  table: FxTable,
): number | null {
  if (!Number.isFinite(amount)) return null;
  if (from.toUpperCase() === to.toUpperCase()) return amount;

  const source = rateAt(table, from, month);
  const target = rateAt(table, to, month);
  if (!source || !target) return null;

  return (amount * source.rate) / target.rate;
}

/**
 * What the row-level UI needs for one transaction: the converted amount and
 * whether the rate came from an earlier month. `null` for a primary-currency
 * row, so callers can skip rendering the "≈" line entirely.
 */
export function rowConversion(
  tx: { amount: number | null; currency: string; occurred_at: string | null },
  primaryCurrency: string,
  table: FxTable,
): { amount: number; approximate: boolean } | null {
  if (tx.amount === null || !tx.occurred_at) return null;
  if (tx.currency.toUpperCase() === primaryCurrency.toUpperCase()) return null;

  const month = bruneiMonthKey(tx.occurred_at);
  const converted = convertAmount(tx.amount, tx.currency, primaryCurrency, month, table);
  if (converted === null) return null;

  const resolved = rateAt(table, tx.currency, month);
  return {
    amount: converted,
    approximate: resolved !== null && resolved.month < month,
  };
}
