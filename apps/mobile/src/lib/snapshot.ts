/**
 * Shapes and pure helpers for the two aggregate RPCs added in migration 27.
 *
 * Before migration 27 the dashboard downloaded five columns of every row in the
 * selected period and summed them in JS, then did it again for the current
 * month, while `monthly_totals` grouped over the account's whole history on the
 * server. Migration 27 keeps a small maintained summary table and answers both
 * screens from it.
 *
 * This module holds the client's half: the payload shape, and the row-shaped
 * equivalents used when the migration has not been applied yet. That fallback
 * is deliberate — the app ships and the SQL is pasted by hand, and a build that
 * renders an error state until someone runs a migration is worse than one that
 * is merely slow for a few days. Both paths are tested against each other so
 * they cannot quietly disagree: a monthly total that differs between them is a
 * bug, not a rounding difference.
 */
import { effectiveDirection } from './direction';
import { bruneiParts } from './format';
import type { TxDirection } from './types';

export interface CategoryTotal {
  category_id: string | null;
  total: number;
}
export interface PeriodSnapshot {
  /** Net spending: money out minus refunds, floored per category. */
  total: number;
  tx_count: number;
  /** Plain money in. Refunds are not included — they already reduce spending. */
  money_in: number;
  money_in_tx_count: number;
  by_category: CategoryTotal[];
  /** Every currency present in the period, so the screen can explain omissions. */
  currencies: string[];
}

export interface MonthSnapshot {
  total: number;
  tx_count: number;
  money_in: number;
  money_in_tx_count: number;
  by_category: CategoryTotal[];
}

/**
 * The `fx` block both RPCs return (migration 29). `unconverted` is the honest
 * half: currencies that were present but could not be priced, so the screen can
 * name them instead of quietly shrinking the total.
 */
export interface FxInfo {
  enabled: boolean;
  primary_currency: string;
  converted_currencies: string[];
  /** A fallback month had to be used for at least one row. */
  approximate: boolean;
  unconverted: { currency: string; total: number; tx_count: number }[];
  /** Set client-side when conversion was asked for but the SQL is absent. */
  unavailable?: boolean;
}

export interface DashboardSnapshot {
  period: PeriodSnapshot;
  this_month: MonthSnapshot;
  fx: FxInfo;
}

/** The six columns every period query selects. */
export interface AggregateRow {
  occurred_at: string | null;
  amount: number | string | null;
  currency: string;
  category_id: string | null;
  merchant_normalized: string | null;
  /** NULL = not set, which the helpers treat as money out. */
  direction: TxDirection | null;
}

export interface YearInsights {
  /** Always twelve, January first, even for months with no spending. */
  months: { total: number; moneyIn: number; byCategory: Map<string | null, number> }[];
  moneyInTotal: number;
  topCategoryIds: (string | null)[];
  categoryTotals: { id: string | null; total: number }[];
  merchantTotals: { name: string; total: number }[];
  fx: FxInfo;
}

export interface RawYearInsights {
  months: {
    month: number;
    total: number | string;
    money_in?: number | string;
    by_category: CategoryTotal[];
  }[];
  category_totals: CategoryTotal[];
  merchant_totals: { merchant_normalized: string; total: number | string }[];
  tx_count: number | string;
  money_in?: number | string;
  fx?: unknown;
}

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Totals below half a cent are noise from summing floats; the UI hides them. */
const MATERIAL = 0.005;

/** Twelve zeroed month buckets. */
function emptyMonths(): YearInsights['months'] {
  return Array.from({ length: 12 }, () => ({
    total: 0,
    moneyIn: 0,
    byCategory: new Map(),
  }));
}

/** A year with no spending — the shape the screen renders while data loads. */
export function emptyYearInsights(): YearInsights {
  return {
    months: emptyMonths(),
    moneyInTotal: 0,
    topCategoryIds: [],
    categoryTotals: [],
    merchantTotals: [],
    fx: emptyFxInfo(''),
  };
}

/**
 * The "conversion is off" block, used for the default state, for payloads that
 * predate migration 29, and for the row fallback (which cannot convert: the
 * same migration provides the RPCs and the rate table, so if one is missing the
 * other is too).
 */
export function emptyFxInfo(currency: string, unavailable = false): FxInfo {
  return {
    enabled: false,
    primary_currency: currency,
    converted_currencies: [],
    approximate: false,
    unconverted: [],
    ...(unavailable ? { unavailable: true } : {}),
  };
}

/** Tolerant parser for the `fx` block; every field has a safe default. */
export function normalizeFxInfo(raw: unknown, currency: string): FxInfo {
  const value = (raw ?? {}) as Partial<FxInfo>;
  if (typeof value !== 'object' || value === null) return emptyFxInfo(currency);
  return {
    enabled: value.enabled === true,
    primary_currency: value.primary_currency ?? currency,
    converted_currencies: Array.isArray(value.converted_currencies)
      ? value.converted_currencies
      : [],
    approximate: value.approximate === true,
    unconverted: Array.isArray(value.unconverted)
      ? value.unconverted.map((u) => ({
          currency: u.currency,
          total: num(u.total),
          tx_count: num(u.tx_count),
        }))
      : [],
  };
}

/**
 * Normalises the RPC payload. Numbers arrive as JSON numbers, but `numeric`
 * columns can also come back as strings depending on the serialiser, and a
 * screen that renders "undefined" is a worse failure than a `Number()` call.
 */
export function normalizeDashboardSnapshot(
  raw: unknown,
  currency = '',
): DashboardSnapshot {
  const value = (raw ?? {}) as Partial<DashboardSnapshot>;
  const period = value.period ?? ({} as PeriodSnapshot);
  const thisMonth = value.this_month ?? ({} as MonthSnapshot);
  return {
    period: {
      total: num(period.total),
      tx_count: num(period.tx_count),
      money_in: num(period.money_in),
      money_in_tx_count: num(period.money_in_tx_count),
      by_category: (period.by_category ?? []).map((c) => ({
        category_id: c.category_id ?? null,
        total: num(c.total),
      })),
      currencies: period.currencies ?? [],
    },
    this_month: {
      total: num(thisMonth.total),
      tx_count: num(thisMonth.tx_count),
      money_in: num(thisMonth.money_in),
      money_in_tx_count: num(thisMonth.money_in_tx_count),
      by_category: (thisMonth.by_category ?? []).map((c) => ({
        category_id: c.category_id ?? null,
        total: num(c.total),
      })),
    },
    fx: normalizeFxInfo(value.fx, currency),
  };
}

/**
 * The pre-migration path: fold already-fetched period rows into the same shape
 * the RPC returns. `currency` filters here rather than at the query so the
 * totals mean exactly what the RPC's `p_currency` means.
 */
export function periodSnapshotFromRows(
  rows: AggregateRow[],
  currency: string,
): PeriodSnapshot {
  const byCategory = new Map<string | null, number>();
  const currencies = new Set<string>();
  let moneyIn = 0;
  let moneyInTxCount = 0;
  let txCount = 0;

  for (const row of rows) {
    if (row.amount === null) continue;
    // The RPC reads the summary table, which only holds dated rows; the row
    // query is date-bounded in SQL, so this guard only matters when these
    // helpers are called with unfiltered fixtures.
    if (!row.occurred_at) continue;
    const direction = effectiveDirection(row.direction);
    // A transfer changes no total, but it is still a currency the user has
    // used, so it belongs in the note below the donut.
    currencies.add(row.currency);
    if (row.currency !== currency) continue;
    if (direction === 'transfer') continue;

    const amount = num(row.amount);
    if (direction === 'in') {
      moneyIn += amount;
      moneyInTxCount += 1;
      continue;
    }

    // Refunds are negative spending in their category, never income.
    const signed = direction === 'refund' ? -amount : amount;
    txCount += 1;
    byCategory.set(row.category_id, (byCategory.get(row.category_id) ?? 0) + signed);
  }

  // Match `dashboard_snapshot`'s `having > 0`: a category whose refunds exceed
  // its spending in this period disappears instead of drawing a negative slice.
  const by_category = [...byCategory.entries()]
    .map(([category_id, sum]) => ({ category_id, total: sum }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  return {
    total: by_category.reduce((sum, c) => sum + c.total, 0),
    tx_count: txCount,
    money_in: moneyIn,
    money_in_tx_count: moneyInTxCount,
    by_category,
    currencies: [...currencies].sort(),
  };
}

export function monthSnapshotFromRows(
  rows: AggregateRow[],
  currency: string,
): MonthSnapshot {
  const snapshot = periodSnapshotFromRows(rows, currency);
  return {
    total: snapshot.total,
    tx_count: snapshot.tx_count,
    money_in: snapshot.money_in,
    money_in_tx_count: snapshot.money_in_tx_count,
    by_category: snapshot.by_category,
  };
}

/**
 * Expands the `insights_year` payload into the twelve buckets the chart draws.
 * The RPC returns only months with data; filling here keeps the SQL free of a
 * `generate_series` that would emit eleven empty objects per user.
 */
export function insightsFromSnapshot(raw: unknown, currency = ''): YearInsights {
  const value = (raw ?? {}) as Partial<RawYearInsights>;
  const months = emptyMonths();

  for (const month of value.months ?? []) {
    const index = month.month - 1;
    const bucket = months[index];
    if (!bucket) continue;
    bucket.total = Math.max(0, num(month.total));
    bucket.moneyIn = num(month.money_in);
    for (const category of month.by_category ?? []) {
      const total = num(category.total);
      if (total <= 0) continue;
      bucket.byCategory.set(category.category_id ?? null, total);
    }
  }

  const categoryTotals = (value.category_totals ?? [])
    .map((c) => ({ id: c.category_id ?? null, total: num(c.total) }))
    .filter((c) => c.total > MATERIAL)
    .sort((a, b) => b.total - a.total);

  return {
    months,
    moneyInTotal: num(value.money_in),
    // Ranked across the whole year so a category keeps its stack colour from
    // month to month.
    topCategoryIds: categoryTotals.map((c) => c.id),
    categoryTotals,
    merchantTotals: (value.merchant_totals ?? []).map((m) => ({
      name: m.merchant_normalized,
      total: num(m.total),
    })),
    fx: normalizeFxInfo(value.fx, currency),
  };
}

/**
 * The pre-migration path for Insights, and the definition the RPC's SQL has to
 * match (see `insights_year` in migration 27). Kept identical to the version
 * that lived in the screen, including the `> MATERIAL` filter and the
 * year-wide category ranking.
 */
export function insightsFromRows(rows: AggregateRow[], currency: string): YearInsights {
  const months = emptyMonths();
  const categoryTotalsMap = new Map<string | null, number>();
  const merchantTotalsMap = new Map<string, number>();
  let moneyInTotal = 0;

  for (const row of rows) {
    if (row.currency !== currency) continue;
    if (!row.occurred_at || row.amount === null) continue;
    // Brunei time, matching the month buckets the summary table uses.
    const monthIndex = bruneiParts(row.occurred_at).month - 1;
    const bucket = months[monthIndex];
    if (!bucket) continue;

    const direction = effectiveDirection(row.direction);
    // Transfers move the user's own money; they never reach any total.
    if (direction === 'transfer') continue;
    const amount = num(row.amount);

    if (direction === 'in') {
      bucket.moneyIn += amount;
      moneyInTotal += amount;
      continue;
    }

    // Refunds are negative spending in their category, never income.
    const signed = direction === 'refund' ? -amount : amount;
    bucket.total += signed;
    bucket.byCategory.set(
      row.category_id,
      (bucket.byCategory.get(row.category_id) ?? 0) + signed,
    );
    categoryTotalsMap.set(
      row.category_id,
      (categoryTotalsMap.get(row.category_id) ?? 0) + signed,
    );
    // The merchant ranking is about where money went; a refund would drag a
    // merchant down without being spending, matching the RPC's `out` filter.
    if (direction === 'out' && row.merchant_normalized) {
      merchantTotalsMap.set(
        row.merchant_normalized,
        (merchantTotalsMap.get(row.merchant_normalized) ?? 0) + amount,
      );
    }
  }

  // Match the RPC: a month or category whose refunds exceed its spending is
  // floored at zero rather than drawn as a negative bar or slice.
  for (const bucket of months) {
    bucket.total = Math.max(0, bucket.total);
    for (const [id, total] of bucket.byCategory) {
      if (total <= 0) bucket.byCategory.delete(id);
    }
  }

  const categoryTotals = [...categoryTotalsMap.entries()]
    .map(([id, total]) => ({ id, total }))
    .filter((c) => c.total > MATERIAL)
    .sort((a, b) => b.total - a.total);

  return {
    months,
    moneyInTotal,
    topCategoryIds: categoryTotals.map((c) => c.id),
    categoryTotals,
    merchantTotals: [...merchantTotalsMap.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10),
    fx: emptyFxInfo(currency),
  };
}
