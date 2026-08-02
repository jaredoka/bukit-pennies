import { bruneiDayKey } from './format';

/**
 * Transaction list filters, and their translation into PostgREST operations.
 *
 * Filtering used to happen in the client over whatever the list had loaded,
 * which was capped at the 500 most recent rows. That is fine until a user has
 * more than 500 transactions, at which point a filter is silently answering
 * "matches, among the newest 500" while presenting itself as "matches". A date
 * range into last year returned an empty list with no explanation.
 *
 * So the filters go to the database and the list pages. This module is the
 * pure half: filters in, a declarative list of operations out, no Supabase
 * import — `queries.ts` applies them to a query builder. Keeping the mapping
 * pure is what makes it testable, and the semantics below are worth pinning
 * down in tests.
 */

export interface TxFilters {
  currencies: string[];
  /** 'YYYY-MM-DD' in Brunei time, or '' for unset. */
  dateFrom: string;
  dateTo: string;
  recipient: string;
  banks: string[];
  categoryIds: (string | null)[];
  cards: string[];
}

export const DEFAULT_FILTERS: TxFilters = {
  currencies: [],
  dateFrom: '',
  dateTo: '',
  recipient: '',
  banks: [],
  categoryIds: [],
  cards: [],
};

/**
 * The list opens on the last `RECENT_WINDOW_DAYS` calendar days (Brunei time,
 * today inclusive) rather than all time. A count-based "first page" means
 * different things for different users — a heavy spender burns through it in a
 * week, a light one never sees the bottom — where a time window is predictable
 * and matches the monthly mental model. Computed fresh each call so a session
 * spanning a month boundary still opens on "the last 30 days".
 */
export const RECENT_WINDOW_DAYS = 30;

/** The 'YYYY-MM-DD' (Brunei) start of the recent window. */
export function recentWindowStartKey(): string {
  return bruneiDayKey(Date.now() - (RECENT_WINDOW_DAYS - 1) * 86_400_000);
}

/**
 * The filters the list opens with — the recent window, nothing else. Kept
 * separate from `DEFAULT_FILTERS` so "all time" stays expressible (clearing
 * the date sheet) and so other consumers of `DEFAULT_FILTERS` are unaffected.
 */
export function defaultListFilters(): TxFilters {
  return { ...DEFAULT_FILTERS, dateFrom: recentWindowStartKey() };
}

/**
 * True when the date window is exactly the untouched default. The window is a
 * true default, not a filter: `hasAnyFilter` must not light up "Reset all" or
 * change the empty state just because the screen opened on it.
 */
export function isRecentWindow(f: TxFilters): boolean {
  return f.dateFrom === recentWindowStartKey() && !f.dateTo;
}

/** One PostgREST operation. `or` carries a raw, already-escaped expression. */
export type TxQueryOp =
  | { op: 'gt' | 'lt' | 'gte' | 'lte'; column: string; value: string | number }
  | { op: 'in'; column: string; values: string[] }
  | { op: 'isNull'; column: string }
  | { op: 'or'; expr: string };

export function hasAnyFilter(f: TxFilters): boolean {
  return (
    f.currencies.length > 0 ||
    !!f.dateFrom ||
    !!f.dateTo ||
    !!f.recipient.trim() ||
    f.banks.length > 0 ||
    f.categoryIds.length > 0 ||
    f.cards.length > 0
  );
}

/**
 * PostgREST reserves `,` `.` `(` `)` inside filter expressions; double quotes
 * protect them, with `\` and `"` escaped in turn. Without this a merchant
 * containing a comma — "SYARIKAT ABC, BHD" — silently truncates the expression
 * and the query means something other than what was asked.
 */
function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** `%` and `_` are wildcards in LIKE; a user typing them means the literal. */
function escapeLike(term: string): string {
  return term.replace(/([\\%_])/g, '\\$1');
}

function ilikeAny(columns: string[], term: string): string {
  const pattern = quote(`%${escapeLike(term)}%`);
  return columns.map((c) => `${c}.ilike.${pattern}`).join(',');
}

/** Start of `day` in Brunei (+08, no DST), as a UTC instant. */
export function bruneiDayStartIso(day: string): string {
  return new Date(`${day}T00:00:00+08:00`).toISOString();
}

/** End of `day` in Brunei, inclusive to the last millisecond. */
export function bruneiDayEndIso(day: string): string {
  return new Date(`${day}T23:59:59.999+08:00`).toISOString();
}

/**
 * Filters + free-text search → PostgREST operations, ANDed together.
 *
 * **An undated row cannot satisfy a date range.** The old client-side check was
 * `if (dateFrom && tx.occurred_at)`, so a row with no date skipped the
 * comparison and passed *every* range — the same transaction appearing under
 * "January 2025" and "last week". SQL comparisons against NULL are false, which
 * is the behaviour we want and now get for free. Undated rows remain fully
 * visible with no date filter set, and Review is where they belong.
 *
 * There is no direction filter. `parseAmount` refuses anything at or below
 * zero, manual entry requires a positive amount and so does confirming a row in
 * Review, so no write path in this app can produce a negative — an "incoming"
 * option could only ever return an empty list. Refunds and credits are a real
 * gap; when they are built, the filter comes back with them (and with a golden
 * fixture for whatever a refund message looks like).
 */
export function buildTransactionOps(filters: TxFilters, search: string): TxQueryOp[] {
  const ops: TxQueryOp[] = [];

  if (filters.currencies.length > 0) {
    ops.push({ op: 'in', column: 'currency', values: filters.currencies });
  }
  if (filters.banks.length > 0) {
    ops.push({ op: 'in', column: 'bank', values: filters.banks });
  }
  if (filters.cards.length > 0) {
    ops.push({ op: 'in', column: 'card_last4', values: filters.cards });
  }

  if (filters.dateFrom) {
    ops.push({ op: 'gte', column: 'occurred_at', value: bruneiDayStartIso(filters.dateFrom) });
  }
  if (filters.dateTo) {
    ops.push({ op: 'lte', column: 'occurred_at', value: bruneiDayEndIso(filters.dateTo) });
  }

  // "Uncategorised" is a real choice in the picker and arrives as null, which
  // `in` cannot express — NULL is not equal to anything, itself included.
  if (filters.categoryIds.length > 0) {
    const ids = filters.categoryIds.filter((id): id is string => id !== null);
    const wantsNull = filters.categoryIds.some((id) => id === null);
    if (wantsNull && ids.length > 0) {
      ops.push({ op: 'or', expr: `category_id.is.null,category_id.in.(${ids.join(',')})` });
    } else if (wantsNull) {
      ops.push({ op: 'isNull', column: 'category_id' });
    } else {
      ops.push({ op: 'in', column: 'category_id', values: ids });
    }
  }

  const recipient = filters.recipient.trim();
  if (recipient) {
    ops.push({ op: 'or', expr: ilikeAny(['merchant_normalized', 'merchant'], recipient) });
  }

  const term = search.trim();
  if (term) {
    ops.push({ op: 'or', expr: ilikeAny(['merchant_normalized', 'raw_text', 'notes'], term) });
  }

  return ops;
}
