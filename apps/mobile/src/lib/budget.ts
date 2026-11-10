/**
 * Which figure the dashboard treats as "the budget" for a month.
 *
 * Two sources, in this order:
 *
 *   1. A budget set for that month (migration 33).
 *   2. The Settings monthly budget.
 *
 * Nothing else. Money recorded In used to stand in as the budget when there
 * was no figure for the month, which meant a salary silently became a spending
 * cap and the dashboard's "Budget" card showed a number the user never chose.
 * In is now only what it says: money that came in. It still feeds the year
 * view's In card and Insights, never this.
 *
 * Amounts are converted into the primary currency at that month's rate. The
 * stored figure never changes; only the display does. When no rate exists the
 * resolution is *unconverted*, not zero: the caller shows the figure in its own
 * currency rather than pretending the budget is gone.
 */
import { convertAmount, rateAt, type FxTable } from './fx';
import type { MonthBudgetRow } from './types';

export type { MonthBudgetRow };

export type BudgetSource = 'month' | 'default' | 'none';

/** A stored figure that no rate could translate, kept so the UI can show it. */
export interface UnconvertedBudget {
  amount: number;
  currency: string;
}

export interface BudgetResolution {
  source: BudgetSource;
  /** In `currency`; null when nothing is set or the figure could not be priced. */
  amount: number | null;
  /** The currency `amount` is expressed in. */
  currency: string;
  /** Set only when `source` has a figure that could not be converted. */
  unconverted: UnconvertedBudget | null;
  /** True when the rate came from an earlier month, so the figure is approximate. */
  approximate: boolean;
}

export interface ResolveBudgetInput {
  /** The month being viewed, 'YYYY-MM-01'. */
  month: string;
  /** A budget row for exactly that month, or null to inherit. */
  override: MonthBudgetRow | null;
  /** Settings monthly budget, or null when unset. */
  defaultAmount: number | null;
  /** Currency the default was entered in. */
  defaultCurrency: string;
  primaryCurrency: string;
  /** Rates for the pinned currencies. Empty is fine; conversion then fails closed. */
  fx: FxTable;
}

function price(
  amount: number,
  from: string,
  to: string,
  month: string,
  fx: FxTable,
): { amount: number | null; unconverted: UnconvertedBudget | null; approximate: boolean } {
  const converted = convertAmount(amount, from, to, month, fx);
  if (converted === null) {
    return { amount: null, unconverted: { amount, currency: from }, approximate: false };
  }
  const direct = from.toUpperCase() === to.toUpperCase();
  const resolved = direct ? null : rateAt(fx, from, month);
  return {
    amount: converted,
    unconverted: null,
    approximate: resolved !== null && resolved.month < month,
  };
}

export function resolveBudget(input: ResolveBudgetInput): BudgetResolution {
  const { month, override, defaultAmount, defaultCurrency, primaryCurrency, fx } = input;

  if (override !== null) {
    const amount = Number(override.amount);
    if (Number.isFinite(amount) && amount > 0) {
      const priced = price(amount, override.currency, primaryCurrency, month, fx);
      return { source: 'month', currency: priced.amount === null ? override.currency : primaryCurrency, ...priced };
    }
  }

  if (defaultAmount !== null && Number.isFinite(defaultAmount) && defaultAmount > 0) {
    const priced = price(defaultAmount, defaultCurrency, primaryCurrency, month, fx);
    return {
      source: 'default',
      currency: priced.amount === null ? defaultCurrency : primaryCurrency,
      ...priced,
    };
  }

  return { source: 'none', amount: null, currency: primaryCurrency, unconverted: null, approximate: false };
}

/** The month key the wheel is showing, in the schema's 'YYYY-MM-01' shape. */
export function monthKeyOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}
