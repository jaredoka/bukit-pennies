export type BankId = 'baiduri' | 'bibd' | 'scb' | 'unknown';

export type FieldName = 'amount' | 'date' | 'merchant' | 'card';

/** How each field was obtained. Drives the confidence score. */
export type FieldStatus = 'exact' | 'heuristic' | 'missing';

export interface ParsedTransaction {
  bank: BankId;
  /** Positive decimal amount; null when unparseable (forces needs_review server-side). */
  amount: number | null;
  /** ISO 4217 code, e.g. "BND". */
  currency: string;
  merchant: string | null;
  /** Uppercased, whitespace-collapsed merchant — the dashboard grouping key. */
  merchantNormalized: string | null;
  /** ISO 8601 with explicit +08:00 (Asia/Brunei, no DST); null when no date found. */
  occurredAt: string | null;
  cardLast4: string | null;
  /** 0..1 — weighted field score; generic/unverified parses are capped at 0.70. */
  confidence: number;
  fields: Record<FieldName, FieldStatus>;
}

export interface ParseOptions {
  /** SMS sender ID (e.g. "Baiduri") or Android package name — bank detection hint. */
  senderHint?: string;
  /** ISO timestamp the message was received — occurredAt fallback (heuristic). */
  receivedAt?: string;
}

export interface ParseResult {
  tx: ParsedTransaction | null;
  /** false for OTPs, promos, balance alerts, or text with no recognizable transaction. */
  isTransactional: boolean;
}

export interface BankParser {
  id: BankId;
  /** Body-fingerprint test used by detectBank (sender hints are checked first). */
  matches(text: string): boolean;
  parse(text: string, opts?: ParseOptions): ParsedTransaction | null;
}
