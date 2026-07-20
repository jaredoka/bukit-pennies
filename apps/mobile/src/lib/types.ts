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
  saved_amount: number | string;
  currency: string;
  created_at: string;
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

export interface BugReportRow {
  id: string;
  user_id: string;
  short_id: string;
  app_version: string;
  description: string;
  created_at: string;
}

export interface MerchantTotalRow {
  user_id: string;
  merchant_normalized: string;
  currency: string;
  total: number;
  tx_count: number;
  last_seen: string;
}
