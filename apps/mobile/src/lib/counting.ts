/**
 * Where one transaction lands on the dashboard: the donut and the budget bars.
 *
 * These are the dashboard's own rules, restated for the detail screen so a row
 * says why it is missing instead of leaving the user to infer it. They mirror
 * `dashboard_snapshot` (migrations 32 and 33): only parsed rows with an amount
 * and a date count; transfers count nowhere; money in is In, not spending; a
 * foreign amount only counts when conversion is on. Budgets add one rule of
 * their own — no category means no category budget to count it against.
 *
 * This is display-only. The aggregates stay the source of truth; if a rule ever
 * changes there, it must change here too (the tests pin the shared cases).
 */
import { bruneiMonthKey, formatMonthName } from './format';
import type { TransactionRow } from './types';

export type CountingReason =
  | 'spending'
  | 'money_in'
  | 'transfer'
  | 'needs_review'
  | 'no_amount'
  | 'no_date'
  | 'other_currency'
  | 'no_category'
  | 'hidden';

export interface CountingStatus {
  /** True when this transaction contributes to that surface's figure. */
  counted: boolean;
  reason: CountingReason;
  /** Month the row lands in, e.g. "October 2026"; null when it has no date. */
  month: string | null;
  /** Category name, or null when the row has none. */
  category: string | null;
}

export type CountingTransaction = Pick<
  TransactionRow,
  'occurred_at' | 'amount' | 'currency' | 'category_id' | 'parse_status' | 'direction'
>;

export interface CountingInput {
  tx: CountingTransaction;
  categoryName: string | null;
  primaryCurrency: string;
  /** The same toggle the dashboard passes to `useDashboardSnapshot`. */
  convertOthers: boolean;
  /** Migration 34 flags. Absent before it ships, which reads as included. */
  includeInDashboard?: boolean;
  includeInBudgets?: boolean;
}

export interface CountingResult {
  dashboard: CountingStatus;
  budgets: CountingStatus;
}

function base(input: CountingInput): CountingStatus {
  const { tx } = input;
  const month =
    tx.occurred_at === null || Number.isNaN(new Date(tx.occurred_at).getTime())
      ? null
      : formatMonthName(bruneiMonthKey(tx.occurred_at));
  return { counted: false, reason: 'spending', month, category: input.categoryName };
}

/** Rules every aggregate applies, before the per-surface ones. */
function excludedEverywhere(input: CountingInput): CountingStatus | null {
  const { tx } = input;
  if (tx.parse_status !== 'parsed') return { ...base(input), reason: 'needs_review' };
  if (tx.amount === null) return { ...base(input), reason: 'no_amount' };
  if (tx.occurred_at === null) return { ...base(input), reason: 'no_date' };
  if (tx.direction === 'transfer') return { ...base(input), reason: 'transfer' };
  if (
    tx.currency.toUpperCase() !== input.primaryCurrency.toUpperCase() &&
    !input.convertOthers
  ) {
    return { ...base(input), reason: 'other_currency' };
  }
  return null;
}

export function countingStatus(input: CountingInput): CountingResult {
  const shared = excludedEverywhere(input);

  // Dashboard: hidden is checked after the universal rules so a transfer or an
  // unconfirmed row still explains the more fundamental reason.
  let dashboard: CountingStatus;
  if (shared) {
    dashboard = shared;
  } else if (input.includeInDashboard === false) {
    dashboard = { ...base(input), reason: 'hidden' };
  } else if (input.tx.direction === 'in') {
    dashboard = { ...base(input), reason: 'money_in' };
  } else {
    dashboard = { ...base(input), counted: true, reason: 'spending' };
  }

  let budgets: CountingStatus;
  if (shared) {
    budgets = shared;
  } else if (input.includeInBudgets === false) {
    budgets = { ...base(input), reason: 'hidden' };
  } else if (input.tx.direction === 'in') {
    budgets = { ...base(input), reason: 'money_in' };
  } else if (input.tx.category_id === null) {
    budgets = { ...base(input), reason: 'no_category' };
  } else {
    budgets = { ...base(input), counted: true, reason: 'spending' };
  }

  return { dashboard, budgets };
}

/** One sentence explaining a non-counted status, for the detail screen. */
export function countingExplanation(status: CountingStatus, rowCurrency: string): string | null {
  switch (status.reason) {
    case 'spending':
      return null;
    case 'money_in':
      return 'Money in is shown as In, not as spending.';
    case 'transfer':
      return 'Transfers stay out of every total.';
    case 'needs_review':
      return 'Confirm it in Review first.';
    case 'no_amount':
      return 'It has no amount.';
    case 'no_date':
      return 'It has no date.';
    case 'other_currency':
      return `It is in ${rowCurrency}, which is not converted to your primary currency.`;
    case 'no_category':
      return 'It has no category, so no category budget can count it.';
    case 'hidden':
      return 'You turned it off for this surface.';
  }
}
