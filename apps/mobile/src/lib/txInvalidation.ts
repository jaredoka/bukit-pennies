/**
 * Which caches a transaction change actually invalidates.
 *
 * Every write used to invalidate the whole `transactions` key plus
 * `monthly_totals` and `transaction_facets`. That is correct but expensive: a
 * note edit re-downloaded the selected year of rows, and a change that could
 * not add a card still refreshed the filter pickers. This module keeps the
 * decision pure and testable — fields changed in, query keys out.
 *
 * The cache layout lives in `queries.ts`. The key names are repeated here on
 * purpose: importing that module would pull in the Supabase client, and this
 * logic is worth testing without a network stack or a React runtime.
 */
import type { QueryClient } from '@tanstack/react-query';

export interface TxInvalidation {
  /** List pages and the one-row detail cache. */
  rows?: boolean;
  /** Period, recent-months, month and monthly_totals rollups. */
  aggregates?: boolean;
  /** Parsed transaction count (the rate-me gate). */
  counts?: boolean;
  /** Review inbox and its counter. */
  review?: boolean;
  /** Bank / card / currency picker data. */
  facets?: boolean;
  /** Insights year picker bounds. */
  earliestYear?: boolean;
  /** Everything, for changes whose effect cannot be narrowed. */
  all?: boolean;
}

/**
 * The columns an edit can carry that change each surface. Derived from
 * `TRANSACTION_EDIT_COLUMNS` in `queries.ts` and the projections the queries
 * actually read — see `TX_AGGREGATE_COLUMNS` and `transaction_facets`.
 */
const AGGREGATE_FIELDS = new Set([
  'amount',
  'currency',
  'category_id',
  'occurred_at',
  'parse_status',
  'merchant',
  'merchant_normalized',
]);

const FACET_FIELDS = new Set(['bank', 'card_last4', 'currency']);

const REVIEW_FIELDS = new Set(['parse_status', 'possible_duplicate_of', 'confidence']);

/** Only a status change moves the parsed count. */
const COUNT_FIELDS = new Set(['parse_status']);

const DATE_FIELDS = new Set(['occurred_at']);

/**
 * The scope for an edit, from the fields the caller actually patched.
 *
 * A notes-only edit invalidates the visible rows and nothing else; changing a
 * category also refreshes the rollups; changing a card also refreshes the
 * filter pickers. Unknown fields fall through to "rows only", which is the
 * safe minimum because every visible list row is repainted.
 */
export function invalidationForPatch(changedFields: readonly string[]): TxInvalidation {
  const touches = (fields: Set<string>) => changedFields.some((field) => fields.has(field));
  return {
    rows: true,
    aggregates: touches(AGGREGATE_FIELDS),
    counts: touches(COUNT_FIELDS),
    review: touches(REVIEW_FIELDS),
    facets: touches(FACET_FIELDS),
    earliestYear: touches(DATE_FIELDS),
  };
}

/**
 * Invalidates exactly the surfaces in `scope`.
 *
 * `scope.all` is deliberately the old, coarse behaviour: it exists for changes
 * whose effect cannot be narrowed (a new capture, a reset, a realtime event
 * from another device), not as a default. Callers must state what changed.
 */
export function invalidateTransactionQueries(
  qc: QueryClient,
  scope: TxInvalidation,
): void {
  if (scope.all) {
    for (const key of ['transactions', 'monthly_totals', 'transaction_facets']) {
      qc.invalidateQueries({ queryKey: [key] });
    }
    return;
  }

  if (scope.rows) {
    qc.invalidateQueries({ queryKey: ['transactions', 'list'] });
    qc.invalidateQueries({ queryKey: ['transactions', 'detail'] });
  }
  if (scope.aggregates) {
    qc.invalidateQueries({ queryKey: ['transactions', 'period'] });
    qc.invalidateQueries({ queryKey: ['transactions', 'recent-months'] });
    qc.invalidateQueries({ queryKey: ['transactions', 'month'] });
    qc.invalidateQueries({ queryKey: ['monthly_totals'] });
  }
  if (scope.counts) {
    qc.invalidateQueries({ queryKey: ['transactions', 'parsed-count'] });
  }
  if (scope.review) {
    qc.invalidateQueries({ queryKey: ['transactions', 'review'] });
    qc.invalidateQueries({ queryKey: ['transactions', 'review-count'] });
  }
  if (scope.facets) {
    qc.invalidateQueries({ queryKey: ['transaction_facets'] });
  }
  if (scope.earliestYear) {
    qc.invalidateQueries({ queryKey: ['transactions', 'earliest-year'] });
  }
}
