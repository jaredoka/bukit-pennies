import { describe, expect, it } from 'vitest';
import {
  insightsFromRows,
  insightsFromSnapshot,
  monthSnapshotFromRows,
  normalizeDashboardSnapshot,
  periodSnapshotFromRows,
  type AggregateRow,
  type RawYearInsights,
} from '@/lib/snapshot';

/**
 * Migration 27 answers the dashboard and Insights from a summary table, and the
 * app keeps a row-shaped fallback for the window between installing the build
 * and pasting the SQL. The two paths must produce *identical* numbers — that is
 * the whole point of these tests, especially `insightsFromSnapshot` vs
 * `insightsFromRows` below, which is the client-side statement of what
 * `insights_year` has to compute.
 */

const rows: AggregateRow[] = [
  { occurred_at: '2026-10-05T04:00:00+08:00', amount: 10, currency: 'BND', category_id: 'A', merchant_normalized: 'KOPI' },
  { occurred_at: '2026-10-06T04:00:00+08:00', amount: '5.50', currency: 'BND', category_id: 'A', merchant_normalized: 'KOPI' },
  { occurred_at: '2026-10-07T04:00:00+08:00', amount: 7, currency: 'BND', category_id: null, merchant_normalized: 'SHELL' },
  { occurred_at: '2026-10-08T04:00:00+08:00', amount: 3, currency: 'USD', category_id: 'A', merchant_normalized: 'SHOP' },
  // 2026-10-31T16:30Z is 1 Nov 00:30 in Brunei.
  { occurred_at: '2026-10-31T16:30:00Z', amount: 2, currency: 'BND', category_id: 'B', merchant_normalized: 'LATE' },
  // 2026-09-30T15:59Z is 30 Sep 23:59 in Brunei — still September.
  { occurred_at: '2026-09-30T15:59:00Z', amount: 1, currency: 'BND', category_id: 'A', merchant_normalized: 'EARLY' },
  { occurred_at: null, amount: 4, currency: 'BND', category_id: 'A', merchant_normalized: 'NODATE' },
  { occurred_at: '2026-10-09T04:00:00+08:00', amount: null, currency: 'BND', category_id: 'A', merchant_normalized: 'FREE' },
];

/** What `insights_year(2026, 'BND')` returns for the same rows. */
const rawYear: RawYearInsights = {
  months: [
    { month: 9, total: 1, by_category: [{ category_id: 'A', total: 1 }] },
    {
      month: 10,
      total: 22.5,
      by_category: [
        { category_id: 'A', total: 15.5 },
        { category_id: null, total: 7 },
      ],
    },
    { month: 11, total: 2, by_category: [{ category_id: 'B', total: 2 }] },
  ],
  category_totals: [
    { category_id: 'A', total: 16.5 },
    { category_id: null, total: 7 },
    { category_id: 'B', total: 2 },
  ],
  merchant_totals: [
    { merchant_normalized: 'KOPI', total: 15.5 },
    { merchant_normalized: 'SHELL', total: 7 },
    { merchant_normalized: 'LATE', total: 2 },
    { merchant_normalized: 'EARLY', total: 1 },
  ],
  tx_count: 6,
};

describe('insightsFromRows', () => {
  it('buckets months in Brunei time, not UTC', () => {
    const insights = insightsFromRows(rows, 'BND');
    expect(insights.months[8]!.total).toBe(1); // Sep
    expect(insights.months[9]!.total).toBe(22.5); // Oct
    expect(insights.months[10]!.total).toBe(2); // Nov
  });

  it('leaves other currencies out of a BND series entirely', () => {
    const insights = insightsFromRows(rows, 'BND');
    expect(insights.merchantTotals.map((m) => m.name)).not.toContain('SHOP');
  });

  it('skips undated and unpriced rows instead of inventing a bucket', () => {
    const insights = insightsFromRows(rows, 'BND');
    const total = insights.months.reduce((sum, m) => sum + m.total, 0);
    expect(total).toBe(25.5); // 22.5 + 2 + 1, no NODATE, no FREE
  });

  it('ranks categories across the year so stack colours stay stable', () => {
    const insights = insightsFromRows(rows, 'BND');
    expect(insights.topCategoryIds).toEqual(['A', null, 'B']);
    expect(insights.categoryTotals).toEqual([
      { id: 'A', total: 16.5 },
      { id: null, total: 7 },
      { id: 'B', total: 2 },
    ]);
  });
});

describe('insightsFromSnapshot', () => {
  it('produces exactly what the row path produces for the same data', () => {
    expect(insightsFromSnapshot(rawYear)).toEqual(insightsFromRows(rows, 'BND'));
  });

  it('fills the months the RPC omits, so the chart always has twelve bars', () => {
    const insights = insightsFromSnapshot(rawYear);
    expect(insights.months).toHaveLength(12);
    expect(insights.months[0]).toEqual({ total: 0, byCategory: new Map() });
    expect(insights.months[11]!.total).toBe(0);
  });

  it('treats an empty or absent payload as no spending, not as an error', () => {
    for (const empty of [null, undefined, {}, { months: [] }]) {
      const insights = insightsFromSnapshot(empty);
      expect(insights.months).toHaveLength(12);
      expect(insights.categoryTotals).toEqual([]);
      expect(insights.merchantTotals).toEqual([]);
    }
  });

  it('coerces numeric strings, which a numeric column may serialise to', () => {
    const insights = insightsFromSnapshot({
      months: [{ month: 3, total: '12.50', by_category: [{ category_id: 'A', total: '12.50' }] }],
      category_totals: [{ category_id: 'A', total: '12.50' }],
      merchant_totals: [],
    });
    expect(insights.months[2]!.total).toBe(12.5);
    expect(insights.categoryTotals).toEqual([{ id: 'A', total: 12.5 }]);
  });
});

describe('periodSnapshotFromRows', () => {
  it('totals one currency and still reports the others as present', () => {
    const period = periodSnapshotFromRows(rows, 'BND');
    expect(period.total).toBe(25.5);
    expect(period.tx_count).toBe(5);
    expect(period.currencies).toEqual(['BND', 'USD']);
  });

  it('groups by category, uncategorised included, largest first', () => {
    const period = periodSnapshotFromRows(rows, 'BND');
    expect(period.by_category).toEqual([
      { category_id: 'A', total: 16.5 },
      { category_id: null, total: 7 },
      { category_id: 'B', total: 2 },
    ]);
  });

  it('sums to zero rather than returning null for a currency with no rows', () => {
    const period = periodSnapshotFromRows(rows, 'EUR');
    expect(period.total).toBe(0);
    expect(period.by_category).toEqual([]);
    expect(period.currencies).toEqual(['BND', 'USD']);
  });

  it('drops undated rows, matching the summary table', () => {
    const period = periodSnapshotFromRows(rows, 'BND');
    expect(period.total).not.toBe(29.5); // would include NODATE's 4.00
  });
});

describe('monthSnapshotFromRows', () => {
  it('is the period shape without a currencies list', () => {
    const month = monthSnapshotFromRows(rows, 'BND');
    expect(month).toEqual({
      total: 25.5,
      tx_count: 5,
      by_category: periodSnapshotFromRows(rows, 'BND').by_category,
    });
    expect('currencies' in month).toBe(false);
  });
});

describe('normalizeDashboardSnapshot', () => {
  it('survives a payload with missing keys', () => {
    expect(normalizeDashboardSnapshot({})).toEqual({
      period: { total: 0, tx_count: 0, by_category: [], currencies: [] },
      this_month: { total: 0, tx_count: 0, by_category: [] },
    });
  });

  it('coerces strings and keeps an explicit null category', () => {
    const snapshot = normalizeDashboardSnapshot({
      period: {
        total: '10.00',
        tx_count: '2',
        by_category: [{ category_id: null, total: '10.00' }],
        currencies: ['BND'],
      },
      this_month: { total: '4.00', tx_count: 1, by_category: [{ category_id: 'A', total: '4.00' }] },
    });
    expect(snapshot.period.total).toBe(10);
    expect(snapshot.period.tx_count).toBe(2);
    expect(snapshot.period.by_category).toEqual([{ category_id: null, total: 10 }]);
    expect(snapshot.this_month.by_category).toEqual([{ category_id: 'A', total: 4 }]);
  });
});
