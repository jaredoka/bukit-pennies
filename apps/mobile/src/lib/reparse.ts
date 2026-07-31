/**
 * "Re-parse from original text" — the pure half, so the rules below are pinned
 * by `test/reparse.test.ts` rather than by reading a screen (the same shape as
 * `txFilters.ts`, `csv.ts` and `subscriptions.ts`).
 *
 * Re-parse is the only button in the app that overwrites a transaction's own
 * fields from something other than the user's typing, and it has no undo. Two
 * rules follow from that, both of them fixes:
 *
 *   1. **It never removes a date it cannot replace.** BIBD messages carry no
 *      timestamp at all, so on the way in `occurredAt` comes from the ingest
 *      function's `received_at`. Re-parsing without one made the parser return
 *      `occurredAt: null`, which was written straight over `occurred_at` — and
 *      every dashboard and insights query filters on `occurred_at is not null`,
 *      so the transaction disappeared from every total while still sitting in
 *      the list looking fine. The row's own timestamp goes back in as
 *      `receivedAt`, and a null result falls back to what was already stored.
 *
 *   2. **It is not offered for manual entries.** A manual row's `raw_text` is a
 *      sentence this app wrote ("Manual entry: BND 12.00 at Pasar Gadong on
 *      …"), not a bank message. Feeding it back through the parsers is
 *      guaranteed to make the row worse: no bank fingerprint matches, so the
 *      generic extractor runs, finds the amount, fails on a merchant that is
 *      not upper-case, and returns a capped confidence — blanking a merchant
 *      the user typed and demoting the row to `needs_review`.
 */
import { parseBankMessage, REVIEW_CONFIDENCE_THRESHOLD } from '@bukit/parsers';
import type { TransactionRow } from './types';

/** The fields a re-parse may rewrite. Notes and category are the user's, and
 *  are deliberately not among them. */
export type ReparsePatch = Pick<
  TransactionRow,
  | 'amount'
  | 'currency'
  | 'merchant'
  | 'merchant_normalized'
  | 'occurred_at'
  | 'card_last4'
  | 'bank'
  | 'confidence'
  | 'parse_status'
>;

/** Everything `buildReparsePatch` reads. A subset so the tests can state a row
 *  in four fields instead of eighteen. */
export type ReparseInput = Pick<
  TransactionRow,
  'source' | 'raw_text' | 'occurred_at' | 'created_at'
>;

/** Whether to offer the button at all — see rule 2 above. */
export function canReparse(tx: Pick<TransactionRow, 'source'>): boolean {
  return tx.source !== 'manual';
}

/**
 * The patch a re-parse would apply, or `null` when there is nothing to apply.
 *
 * Null means "leave the row exactly as it is", which is why an unparseable
 * `raw_text` returns null rather than a patch full of nulls: a button that
 * cannot improve a row must not be allowed to damage it either.
 */
export function buildReparsePatch(tx: ReparseInput): ReparsePatch | null {
  if (!canReparse(tx)) return null;

  // The row's own timestamp is the best "when did this arrive" available now —
  // it is what the ingest function was given the first time round.
  const { tx: parsed } = parseBankMessage(tx.raw_text, {
    receivedAt: tx.occurred_at ?? tx.created_at,
  });
  if (!parsed) return null;

  return {
    amount: parsed.amount,
    currency: parsed.currency,
    merchant: parsed.merchant,
    merchant_normalized: parsed.merchantNormalized,
    occurred_at: parsed.occurredAt ?? tx.occurred_at,
    card_last4: parsed.cardLast4,
    bank: parsed.bank,
    confidence: parsed.confidence,
    // Same gate the server applies on ingest: a low score *or* a missing
    // amount sends the row to review.
    parse_status:
      parsed.confidence >= REVIEW_CONFIDENCE_THRESHOLD && parsed.amount !== null
        ? 'parsed'
        : 'needs_review',
  };
}
