import { describe, expect, it } from 'vitest';
import {
  countingExplanation,
  countingStatus,
  type CountingInput,
  type CountingTransaction,
} from '../src/lib/counting';

const BASE: CountingTransaction = {
  occurred_at: '2026-10-14T03:00:00+00:00',
  amount: 21,
  currency: 'BND',
  category_id: 'cat-entertainment',
  parse_status: 'parsed',
  direction: 'out',
};

function input(overrides: Partial<CountingTransaction> = {}, rest: Partial<CountingInput> = {}): CountingInput {
  return {
    tx: { ...BASE, ...overrides },
    categoryName: 'Entertainment',
    primaryCurrency: 'BND',
    convertOthers: false,
    ...rest,
  };
}

describe('countingStatus', () => {
  it('counts a normal spend in both surfaces', () => {
    const { dashboard, budgets } = countingStatus(input());
    expect(dashboard).toMatchObject({ counted: true, reason: 'spending', month: 'Oct 2026', category: 'Entertainment' });
    expect(budgets).toMatchObject({ counted: true, reason: 'spending' });
  });

  it('treats an unset direction as money out', () => {
    const { dashboard, budgets } = countingStatus(input({ direction: null }));
    expect(dashboard.counted).toBe(true);
    expect(budgets.counted).toBe(true);
  });

  it.each([
    ['needs_review', { parse_status: 'needs_review' as const }],
    ['no_amount', { amount: null }],
    ['no_date', { occurred_at: null }],
    ['transfer', { direction: 'transfer' as const }],
  ])('excludes %s from both surfaces', (reason, patch) => {
    const { dashboard, budgets } = countingStatus(input(patch));
    expect(dashboard).toMatchObject({ counted: false, reason });
    expect(budgets).toMatchObject({ counted: false, reason });
  });

  it('reports money in as In, not as spending', () => {
    const { dashboard, budgets } = countingStatus(input({ direction: 'in' }));
    expect(dashboard).toMatchObject({ counted: false, reason: 'money_in' });
    expect(budgets).toMatchObject({ counted: false, reason: 'money_in' });
  });

  it('counts a refund in both surfaces when it has a category', () => {
    const { dashboard, budgets } = countingStatus(input({ direction: 'refund' }));
    expect(dashboard.counted).toBe(true);
    expect(budgets.counted).toBe(true);
  });

  it('counts an uncategorized spend in the donut but not against a budget', () => {
    const { dashboard, budgets } = countingStatus(
      input({ category_id: null }, { categoryName: null }),
    );
    expect(dashboard).toMatchObject({ counted: true, category: null });
    expect(budgets).toMatchObject({ counted: false, reason: 'no_category' });
  });

  it('excludes a foreign currency when conversion is off', () => {
    const { dashboard, budgets } = countingStatus(input({ currency: 'USD' }));
    expect(dashboard).toMatchObject({ counted: false, reason: 'other_currency' });
    expect(budgets).toMatchObject({ counted: false, reason: 'other_currency' });
  });

  it('counts a foreign currency when conversion is on', () => {
    const { dashboard, budgets } = countingStatus(input({ currency: 'USD' }, { convertOthers: true }));
    expect(dashboard.counted).toBe(true);
    expect(budgets.counted).toBe(true);
  });

  it('honours the per-surface switches independently', () => {
    const noDashboard = countingStatus(input({}, { includeInDashboard: false }));
    expect(noDashboard.dashboard.reason).toBe('hidden');
    expect(noDashboard.budgets.counted).toBe(true);

    const noBudgets = countingStatus(input({}, { includeInBudgets: false }));
    expect(noBudgets.dashboard.counted).toBe(true);
    expect(noBudgets.budgets.reason).toBe('hidden');
  });

  it('lets a fundamental reason win over a switch', () => {
    const { dashboard } = countingStatus(input({ direction: 'transfer' }, { includeInDashboard: false }));
    expect(dashboard.reason).toBe('transfer');
  });
});

describe('countingExplanation', () => {
  it('is silent for a counted row', () => {
    expect(countingExplanation(countingStatus(input()).dashboard, 'BND')).toBeNull();
  });

  it('names the currency for an unconverted row', () => {
    const { dashboard } = countingStatus(input({ currency: 'USD' }));
    expect(countingExplanation(dashboard, 'USD')).toBe(
      'It is in USD, which is not converted to your primary currency.',
    );
  });

  it('explains unset category and switches', () => {
    const { budgets } = countingStatus(input({ category_id: null }));
    expect(countingExplanation(budgets, 'BND')).toContain('no category');
    const hidden = countingStatus(input({}, { includeInDashboard: false })).dashboard;
    expect(countingExplanation(hidden, 'BND')).toContain('turned it off');
  });
});
