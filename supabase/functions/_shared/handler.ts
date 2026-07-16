// Pure ingest handler (HANDOFF.md §6) — no Deno/Supabase imports so it unit
// tests under vitest and runs unchanged in the edge runtime. All I/O goes
// through the injected IngestStore.
import { isNonTransactional, normalizeText, parseBankMessage } from './parsers/index.ts';
import type { BankId } from './parsers/index.ts';
import { extractBearerToken, sha256Hex } from './auth.ts';

export const INGEST_SOURCES = ['android_listener', 'ios_shortcut', 'share', 'paste'] as const;
export type IngestSource = (typeof INGEST_SOURCES)[number];

export const MAX_TEXT_BYTES = 4096;
export const REVIEW_CONFIDENCE_THRESHOLD = 0.75;
export const NEAR_DUPE_WINDOW_MS = 3 * 60 * 1000;

export interface TransactionInsert {
  user_id: string;
  occurred_at: string | null;
  amount: number | null;
  currency: string;
  merchant: string | null;
  merchant_normalized: string | null;
  bank: BankId;
  card_last4: string | null;
  source: IngestSource;
  parse_status: 'parsed' | 'needs_review';
  confidence: number | null;
  raw_text: string;
  raw_hash: string;
}

export interface TransactionRow extends TransactionInsert {
  id: string;
  possible_duplicate_of: string | null;
}

export interface IngestStore {
  /** Active (non-revoked) device for this token hash, or null. */
  findActiveDeviceByTokenHash(tokenHash: string): Promise<{ id: string; user_id: string } | null>;
  /** Fire-and-forget; failures must not fail the request. */
  touchLastSeen(deviceId: string): void;
  /**
   * Insert honoring the (user_id, raw_hash) unique constraint:
   * conflict → { inserted: null, existingId } instead of throwing.
   */
  insertTransaction(row: TransactionInsert): Promise<{ inserted: TransactionRow | null; existingId: string | null }>;
  /** Same user + amount + card_last4 within ±3 min, excluding the new row. */
  findNearDuplicateId(args: {
    userId: string;
    amount: number;
    cardLast4: string | null;
    occurredAtIso: string;
    windowMs: number;
    excludeId: string;
  }): Promise<string | null>;
  setPossibleDuplicate(txId: string, duplicateOfId: string): Promise<void>;
}

export interface RateLimiter {
  allow(key: string): boolean;
}

export interface IngestResponse {
  status: number;
  body: Record<string, unknown>;
}

function error(status: number, code: string): IngestResponse {
  return { status, body: { status: 'error', error: code } };
}

interface ValidBody {
  text: string;
  source: IngestSource;
  sender?: string;
  received_at?: string;
}

function validateBody(raw: unknown): ValidBody | IngestResponse {
  if (typeof raw !== 'object' || raw === null) return error(422, 'invalid_body');
  const body = raw as Record<string, unknown>;

  const text = typeof body.text === 'string' ? body.text : '';
  if (!text.trim()) return error(422, 'empty_text');
  if (new TextEncoder().encode(text).length > MAX_TEXT_BYTES) return error(422, 'text_too_large');

  const source = body.source;
  if (typeof source !== 'string' || !(INGEST_SOURCES as readonly string[]).includes(source)) {
    return error(422, 'invalid_source');
  }

  const sender = typeof body.sender === 'string' ? body.sender : undefined;

  let receivedAt: string | undefined;
  if (typeof body.received_at === 'string' && !Number.isNaN(Date.parse(body.received_at))) {
    receivedAt = body.received_at;
  }

  return { text, source: source as IngestSource, sender, received_at: receivedAt };
}

export async function handleIngest(
  authorizationHeader: string | null | undefined,
  rawBody: unknown,
  store: IngestStore,
  rateLimiter: RateLimiter,
): Promise<IngestResponse> {
  const token = extractBearerToken(authorizationHeader);
  if (!token) return error(401, 'invalid_token');
  const tokenHash = await sha256Hex(token);

  // Limit keyed on the hash so invalid-token floods are bounded too.
  if (!rateLimiter.allow(tokenHash)) return error(429, 'rate_limited');

  const validated = validateBody(rawBody);
  if ('status' in validated && typeof validated.status === 'number') return validated as IngestResponse;
  const body = validated as ValidBody;

  const device = await store.findActiveDeviceByTokenHash(tokenHash);
  if (!device) return error(401, 'invalid_token');
  store.touchLastSeen(device.id);

  // OTPs/promos/balance alerts are never inserted.
  if (isNonTransactional(body.text)) {
    return { status: 200, body: { status: 'ignored', reason: 'non_transactional' } };
  }

  const rawHash = await sha256Hex(`${device.user_id}:${normalizeText(body.text)}`);
  const { tx } = parseBankMessage(body.text, { senderHint: body.sender, receivedAt: body.received_at });

  // tx === null here means "looked transactional but nothing extractable"
  // (e.g. pasted garbage) — keep the raw text as a needs_review row so the
  // review inbox can fix it and the text can become a parser fixture.
  const needsReview = !tx || tx.amount === null || tx.confidence < REVIEW_CONFIDENCE_THRESHOLD;

  const insert: TransactionInsert = {
    user_id: device.user_id,
    occurred_at: tx?.occurredAt ?? body.received_at ?? null,
    amount: tx?.amount ?? null,
    currency: tx?.currency ?? 'BND',
    merchant: tx?.merchant ?? null,
    merchant_normalized: tx?.merchantNormalized ?? null,
    bank: tx?.bank ?? 'unknown',
    card_last4: tx?.cardLast4 ?? null,
    source: body.source,
    parse_status: needsReview ? 'needs_review' : 'parsed',
    confidence: tx?.confidence ?? 0,
    raw_text: body.text,
    raw_hash: rawHash,
  };

  const { inserted, existingId } = await store.insertTransaction(insert);
  if (!inserted) {
    return { status: 200, body: { status: 'duplicate', transaction_id: existingId } };
  }

  // Near-dupe pass: listener + share can double-capture the same spend with
  // different wording. Flag, don't drop — the review inbox offers merge/dismiss.
  let possibleDuplicateOf: string | null = null;
  if (inserted.amount !== null && inserted.occurred_at !== null) {
    possibleDuplicateOf = await store.findNearDuplicateId({
      userId: device.user_id,
      amount: inserted.amount,
      cardLast4: inserted.card_last4,
      occurredAtIso: inserted.occurred_at,
      windowMs: NEAR_DUPE_WINDOW_MS,
      excludeId: inserted.id,
    });
    if (possibleDuplicateOf) {
      await store.setPossibleDuplicate(inserted.id, possibleDuplicateOf);
    }
  }

  return {
    status: 200,
    body: {
      status: 'created',
      transaction: { ...inserted, possible_duplicate_of: possibleDuplicateOf },
    },
  };
}
