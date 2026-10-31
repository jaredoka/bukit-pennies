import { describe, expect, it } from 'vitest';
import {
  bruneiMonthKey,
  buildFxTable,
  convertAmount,
  rateAt,
  rowConversion,
  shiftMonth,
} from '@/lib/fx';

/**
 * These pin the same rules as `bp_fx_asof` / `bp_convert` in migration 29, and
 * the identical fixture is asserted against the SQL (HANDOFF Â§50.10). A change
 * here that is not mirrored there is a drift bug, not a refactor.
 */

const table = buildFxTable([
  { month: '2026-08-01', currency: 'USD', rate_to_bnd: '1.30' },
  { month: '2026-10-01', currency: 'USD', rate_to_bnd: '1.40' },
  { month: '2026-10-01', currency: 'MYR', rate_to_bnd: '0.32' },
]);

describe('rateAt', () => {
  it('uses the month it has', () => {
    expect(rateAt(table, 'USD', '2026-10-01')).toEqual({ month: '2026-10-01', rate: 1.4 });
  });

  it('falls back to the nearest earlier month and reports which one', () => {
    expect(rateAt(table, 'USD', '2026-11-01')).toEqual({ month: '2026-10-01', rate: 1.4 });
  });

  it('walks back over a gap in the data', () => {
    expect(rateAt(table, 'USD', '2026-09-01')).toEqual({ month: '2026-08-01', rate: 1.3 });
  });

  it('refuses a rate older than twelve months', () => {
    expect(rateAt(table, 'USD', '2027-11-01')).toBeNull();
    // Exactly twelve months earlier is still inside the SQL window.
    expect(rateAt(table, 'USD', '2026-10-01')).not.toBeNull();
  });

  it('treats BND as one without needing a stored row', () => {
    expect(rateAt(table, 'BND', '2026-10-01')).toEqual({ month: '2026-10-01', rate: 1 });
    expect(rateAt(table, 'BND', '1999-01-01')).toEqual({ month: '1999-01-01', rate: 1 });
  });

  it('has no rate for an unknown currency', () => {
    expect(rateAt(table, 'EUR', '2026-10-01')).toBeNull();
  });
});

describe('convertAmount', () => {
  it('multiplies by the source rate and divides by the target rate', () => {
    expect(convertAmount(100, 'USD', 'BND', '2026-10-01', table)).toBeCloseTo(140, 10);
    expect(convertAmount(100, 'USD', 'MYR', '2026-10-01', table)).toBeCloseTo(437.5, 10);
    expect(convertAmount(100, 'BND', 'MYR', '2026-10-01', table)).toBeCloseTo(312.5, 10);
  });

  it('leaves a same-currency amount exactly as it was', () => {
    expect(convertAmount(12.345, 'BND', 'BND', '2026-10-01', table)).toBe(12.345);
  });

  it('returns null when a side is unconvertible, never zero', () => {
    expect(convertAmount(100, 'EUR', 'BND', '2026-10-01', table)).toBeNull();
    expect(convertAmount(100, 'BND', 'EUR', '2026-10-01', table)).toBeNull();
  });
});

describe('month keys', () => {
  it('buckets by Brunei time, not UTC', () => {
    // 31 Oct 16:30 UTC is 1 Nov 00:30 in Brunei.
    expect(bruneiMonthKey('2026-10-31T16:30:00Z')).toBe('2026-11-01');
  });

  it('shifts across year boundaries', () => {
    expect(shiftMonth('2026-01-01', -12)).toBe('2025-01-01');
    expect(shiftMonth('2026-10-01', -12)).toBe('2025-10-01');
  });
});

describe('rowConversion', () => {
  it('prices a foreign row and flags a fallback rate', () => {
    const result = rowConversion(
      { amount: 100, currency: 'USD', occurred_at: '2026-11-02T10:00:00+08:00' },
      'BND',
      table,
    );
    expect(result?.amount).toBeCloseTo(140, 10);
    // October's rate used for a November row.
    expect(result?.approximate).toBe(true);
  });

  it('says nothing for a row already in the primary currency', () => {
    expect(
      rowConversion({ amount: 9, currency: 'BND', occurred_at: '2026-11-02T10:00:00+08:00' }, 'BND', table),
    ).toBeNull();
  });

  it('says nothing for an undated or unconvertible row', () => {
    expect(
      rowConversion({ amount: 9, currency: 'USD', occurred_at: null }, 'BND', table),
    ).toBeNull();
    expect(
      rowConversion({ amount: 9, currency: 'EUR', occurred_at: '2026-10-02T10:00:00+08:00' }, 'BND', table),
    ).toBeNull();
  });
});
