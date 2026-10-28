import type { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
  invalidateTransactionQueries,
  invalidationForPatch,
  type TxInvalidation,
} from '@/lib/txInvalidation';

/**
 * These pin the *scope* rule: which caches a given edit is allowed to refresh.
 * The expensive bug this guards against is a note edit re-downloading a year of
 * rows, so the negative assertions matter as much as the positive ones.
 */

function recorder() {
  const keys: string[][] = [];
  const qc = {
    invalidateQueries: vi.fn((arg: { queryKey: string[] }) => {
      keys.push(arg.queryKey);
    }),
  } as unknown as QueryClient;
  return { qc, keys };
}

/** The query keys `invalidateTransactionQueries` touches, as `a/b` strings. */
function keysFor(scope: TxInvalidation): string[] {
  const { qc, keys } = recorder();
  invalidateTransactionQueries(qc, scope);
  return keys.map((key) => key.join('/'));
}

const ROWS = ['transactions/list', 'transactions/detail'];
const AGGREGATES = [
  'transactions/recent-months',
  'monthly_totals',
  'dashboard_snapshot',
  'insights_year',
];
const COUNTS = ['transaction_counters'];

describe('invalidationForPatch', () => {
  it('refreshes only the rows when nothing aggregated changed', () => {
    const scope = invalidationForPatch(['notes']);
    expect(scope).toEqual({
      rows: true,
      aggregates: false,
      counts: false,
      review: false,
      facets: false,
      earliestYear: false,
    });
    expect(keysFor(scope)).toEqual(ROWS);
  });

  it('refreshes the rollups for a category change but not the filter pickers', () => {
    expect(keysFor(invalidationForPatch(['category_id']))).toEqual([...ROWS, ...AGGREGATES]);
  });

  it('refreshes the rollups for an amount change', () => {
    expect(keysFor(invalidationForPatch(['amount']))).toEqual([...ROWS, ...AGGREGATES]);
  });

  it('keeps recurring detection current when the merchant changes', () => {
    expect(keysFor(invalidationForPatch(['merchant_normalized']))).toEqual([...ROWS, ...AGGREGATES]);
  });

  it('refreshes the filter pickers when a card changes', () => {
    expect(keysFor(invalidationForPatch(['card_last4']))).toEqual([...ROWS, 'transaction_facets']);
  });

  it('treats a currency change as both a rollup and a facet change', () => {
    expect(keysFor(invalidationForPatch(['currency']))).toEqual([
      ...ROWS,
      ...AGGREGATES,
      'transaction_facets',
    ]);
  });

  it('moves the counts and the review queue on a status change', () => {
    expect(keysFor(invalidationForPatch(['parse_status']))).toEqual([
      ...ROWS,
      ...AGGREGATES,
      ...COUNTS,
      'transactions/review',
      'transactions/review-count',
    ]);
  });

  it('re-bounds the Insights year picker when the date changes', () => {
    expect(keysFor(invalidationForPatch(['occurred_at']))).toEqual([
      ...ROWS,
      ...AGGREGATES,
      'transactions/earliest-year',
    ]);
  });

  it('refreshes the review queue for a confidence-only change', () => {
    expect(keysFor(invalidationForPatch(['confidence']))).toEqual([
      ...ROWS,
      'transactions/review',
      'transactions/review-count',
    ]);
  });

  it('falls back to the rows for a field it does not recognise', () => {
    expect(keysFor(invalidationForPatch(['something_new']))).toEqual(ROWS);
  });
});

describe('invalidateTransactionQueries', () => {
  it('uses the coarse scope only when asked, and then covers everything', () => {
    expect(keysFor({ all: true })).toEqual([
      'transactions',
      'monthly_totals',
      'transaction_facets',
      'dashboard_snapshot',
      'insights_year',
      'transaction_counters',
    ]);
  });

  it('does nothing for an empty scope', () => {
    expect(keysFor({})).toEqual([]);
  });
});
