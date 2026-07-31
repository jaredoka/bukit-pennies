import type { BankId } from '@bukit/parsers';

export type TxSource = 'android_listener' | 'ios_shortcut' | 'share' | 'paste' | 'manual';
export type ParseStatus = 'parsed' | 'needs_review';

export interface ProfileRow {
  id: string;
  display_name: string | null;
  default_currency: string;
  monthly_income: number | string | null;
}

export interface SavingsGoalRow {
  id: string;
  user_id: string;
  name: string;
  target_amount: number | string;
  currency: string;
  created_at: string;
}

/** A goal joined to its derived progress — what every screen actually renders.
 *  `saved` comes from the savings_goal_progress view, not from a column. */
export interface SavingsGoalWithProgress extends SavingsGoalRow {
  saved: number;
  entry_count: number;
  last_entry_on: string | null;
}

/** One deposit or withdrawal against a goal. Negative `amount` takes money
 *  out; correcting a mistake means deleting the offending row (migration 19). */
export interface SavingsGoalEntryRow {
  id: string;
  user_id: string;
  goal_id: string;
  amount: number | string;
  /** 'YYYY-MM-DD' in Brunei time. */
  occurred_on: string;
  note: string | null;
  created_at: string;
}

export type SubscriptionCycle = 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
export type SubscriptionStatus = 'active' | 'cancelled';

/** One declared subscription (migration 18). Display-only: never a budget input. */
export interface SubscriptionRow {
  id: string;
  user_id: string;
  name: string;
  amount: number | string;
  currency: string;
  cycle: SubscriptionCycle;
  cycle_days: number | null;
  next_due_on: string | null; // 'YYYY-MM-DD'
  category_id: string | null;
  card_last4: string | null;
  merchant_normalized: string | null;
  trial_ends_on: string | null; // 'YYYY-MM-DD'
  started_on: string | null; // 'YYYY-MM-DD'
  notes: string | null;
  status: SubscriptionStatus;
  created_at: string;
  updated_at: string;
}

export interface TransactionRow {
  id: string;
  user_id: string;
  occurred_at: string | null;
  amount: number | null;
  currency: string;
  merchant: string | null;
  merchant_normalized: string | null;
  bank: BankId;
  card_last4: string | null;
  category_id: string | null;
  notes: string | null;
  source: TxSource;
  parse_status: ParseStatus;
  confidence: number | null;
  raw_text: string;
  possible_duplicate_of: string | null;
  created_at: string;
  updated_at: string;
}

/** One distinct combination from the `transaction_facets` view (migration 17). */
export interface TransactionFacetRow {
  user_id: string;
  bank: BankId;
  card_last4: string | null;
  currency: string;
}

export interface CategoryRow {
  id: string;
  user_id: string | null; // null = global default
  name: string;
  color: string | null;
}

export interface IngestDeviceRow {
  id: string;
  user_id: string;
  name: string;
  kind: TxSource;
  created_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
}

export interface BudgetRow {
  id: string;
  user_id: string;
  category_id: string;
  amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface MonthlyTotalRow {
  user_id: string;
  month: string; // 'YYYY-MM-01'
  currency: string;
  total: number;
  tx_count: number;
}
