import { describe, expect, it } from 'vitest';
import { resolveBudget, monthKeyOf } from '../src/lib/budget';
import { buildFxTable, emptyFxTable } from '../src/lib/fx';

const MONTH = '2026-11-01';

// 1 USD = 1.3 BND, 1 SGD = 1 BND (the CIA rate), both for November.
const fx = buildFxTable([
  { month: '2026-11-01', currency: 'USD', rate_to_bnd: 1.3 },
  { month: '2026-11-01', currency: 'SGD', rate_to_bnd: 1 },
]);

const base = {
  month: MONTH,
  override: null,
  recordedIn: 0,
  defaultAmount: null,
  defaultCurrency: 'BND',
  primaryCurrency: 'BND',
  fx: emptyFxTable(),
};

describe('resolveBudget', () => {
  it('prefers a budget set for the month over recorded In', () => {
    const r = resolveBudget({
      ...base,
      override: { month: MONTH, amount: 500, currency: 'BND' },
      recordedIn: 2000,
      defaultAmount: 300,
    });
    expect(r.source).toBe('month');
    expect(r.amount).toBe(500);
  });

  it('falls back to recorded In when the month has no budget', () => {
    const r = resolveBudget({ ...base, recordedIn: 2000, defaultAmount: 300 });
    expect(r.source).toBe('income');
    expect(r.amount).toBe(2000);
  });

  it('falls back to the Settings default when nothing was recorded', () => {
    const r = resolveBudget({ ...base, defaultAmount: 300 });
    expect(r.source).toBe('default');
    expect(r.amount).toBe(300);
  });

  it('reports nothing when nothing is set', () => {
    const r = resolveBudget(base);
    expect(r.source).toBe('none');
    expect(r.amount).toBeNull();
    expect(r.unconverted).toBeNull();
  });

  it('ignores a zero recorded In rather than treating it as a budget', () => {
    const r = resolveBudget({ ...base, recordedIn: 0, defaultAmount: 300 });
    expect(r.source).toBe('default');
  });

  it('leaves a same-currency override untouched', () => {
    const r = resolveBudget({
      ...base,
      override: { month: MONTH, amount: '425.50', currency: 'BND' },
      primaryCurrency: 'BND',
    });
    expect(r.amount).toBe(425.5);
    expect(r.approximate).toBe(false);
  });

  it('converts an override pinned to another currency', () => {
    const r = resolveBudget({
      ...base,
      override: { month: MONTH, amount: 500, currency: 'SGD' },
      primaryCurrency: 'USD',
      fx,
    });
    // 500 SGD -> 500 BND -> / 1.3 USD
    expect(r.amount).toBeCloseTo(384.615, 3);
    expect(r.currency).toBe('USD');
  });

  it('reports an override it cannot price instead of dropping it', () => {
    const r = resolveBudget({
      ...base,
      override: { month: MONTH, amount: 500, currency: 'MYR' },
      primaryCurrency: 'BND',
      fx,
    });
    expect(r.source).toBe('month');
    expect(r.amount).toBeNull();
    expect(r.unconverted).toEqual({ amount: 500, currency: 'MYR' });
  });

  it('converts the default with its own currency', () => {
    const r = resolveBudget({ ...base, defaultAmount: 1000, defaultCurrency: 'USD', fx });
    expect(r.amount).toBe(1300);
  });

  it('marks a fallback rate as approximate', () => {
    const stale = buildFxTable([{ month: '2026-09-01', currency: 'USD', rate_to_bnd: 1.3 }]);
    const r = resolveBudget({ ...base, defaultAmount: 100, defaultCurrency: 'USD', fx: stale });
    expect(r.amount).toBe(130);
    expect(r.approximate).toBe(true);
  });
});

describe('monthKeyOf', () => {
  it('pads single-digit months', () => {
    expect(monthKeyOf(2026, 1)).toBe('2026-01-01');
    expect(monthKeyOf(2026, 12)).toBe('2026-12-01');
  });
});
