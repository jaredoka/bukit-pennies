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
import { bruneiParts } from './format';

export interface CategoryTotal {
  category_id: string | null;
  total: number;
}
export interface PeriodSnapshot {
  total: number;
  tx_count: number;
  by_category: CategoryTotal[];
  /** Every currency present in the period, so the screen can explain omissions. */
  currencies: string[];
}

export interface MonthSnapshot {
  total: number;
  tx_count: number;
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

/** The five columns every period query selects. */
export interface AggregateRow {
  occurred_at: string | null;
  amount: number | string | null;
  currency: string;
  category_id: string | null;
  merchant_normalized: string | null;
}

export interface YearInsights {
  /** Always twelve, January first, even for months with no spending. */
  months: { total: number; byCategory: Map<string | null, number> }[];
  topCategoryIds: (string | null)[];
  categoryTotals: { id: string | null; total: number }[];
  merchantTotals: { name: string; total: number }[];
  fx: FxInfo;
}

export interface RawYearInsights {
  months: { month: number; total: number | string; by_category: CategoryTotal[] }[];
  category_totals: CategoryTotal[];
  merchant_totals: { merchant_normalized: string; total: number | string }[];
  tx_count: number | string;
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
  return Array.from({ length: 12 }, () => ({ total: 0, byCategory: new Map() }));
}

/** A year with no spending — the shape the screen renders while data loads. */
export function emptyYearInsights(): YearInsights {
  return {
    months: emptyMonths(),
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
      by_category: (period.by_category ?? []).map((c) => ({
        category_id: c.category_id ?? null,
        total: num(c.total),
      })),
      currencies: period.currencies ?? [],
    },
    this_month: {
      total: num(thisMonth.total),
      tx_count: num(thisMonth.tx_count),
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
  let total = 0;
  let txCount = 0;

  for (const row of rows) {
    if (row.amount === null) continue;
    // The RPC reads the summary table, which only holds dated rows; the row
    // query is date-bounded in SQL, so this guard only matters when these
    // helpers are called with unfiltered fixtures.
    if (!row.occurred_at) continue;
    currencies.add(row.currency);
    if (row.currency !== currency) continue;
    const amount = num(row.amount);
    total += amount;
    txCount += 1;
    byCategory.set(row.category_id, (byCategory.get(row.category_id) ?? 0) + amount);
  }

  return {
    total,
    tx_count: txCount,
    by_category: [...byCategory.entries()]
      .map(([category_id, sum]) => ({ category_id, total: sum }))
      .sort((a, b) => b.total - a.total),
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
    bucket.total = num(month.total);
    for (const category of month.by_category ?? []) {
      bucket.byCategory.set(
        category.category_id ?? null,
        num(category.total),
      );
    }
  }

  const categoryTotals = (value.category_totals ?? [])
    .map((c) => ({ id: c.category_id ?? null, total: num(c.total) }))
    .filter((c) => c.total > MATERIAL)
    .sort((a, b) => b.total - a.total);

  return {
    months,
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

  for (const row of rows) {
    if (row.currency !== currency) continue;
    if (!row.occurred_at || row.amount === null) continue;
    // Brunei time, matching the month buckets the summary table uses.
    const monthIndex = bruneiParts(row.occurred_at).month - 1;
    const bucket = months[monthIndex];
    if (!bucket) continue;

    const amount = num(row.amount);
    bucket.total += amount;
    bucket.byCategory.set(
      row.category_id,
      (bucket.byCategory.get(row.category_id) ?? 0) + amount,
    );
    categoryTotalsMap.set(
      row.category_id,
      (categoryTotalsMap.get(row.category_id) ?? 0) + amount,
    );
    if (row.merchant_normalized) {
      merchantTotalsMap.set(
        row.merchant_normalized,
        (merchantTotalsMap.get(row.merchant_normalized) ?? 0) + amount,
      );
    }
  }

  const categoryTotals = [...categoryTotalsMap.entries()]
    .map(([id, total]) => ({ id, total }))
    .filter((c) => c.total > MATERIAL)
    .sort((a, b) => b.total - a.total);

  return {
    months,
    topCategoryIds: categoryTotals.map((c) => c.id),
    categoryTotals,
    merchantTotals: [...merchantTotalsMap.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10),
    fx: emptyFxInfo(currency),
  };
}
