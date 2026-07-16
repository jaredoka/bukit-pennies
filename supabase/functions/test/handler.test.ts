import { describe, expect, it } from 'vitest';
import {
  handleIngest,
  NEAR_DUPE_WINDOW_MS,
  type IngestStore,
  type RateLimiter,
  type TransactionInsert,
  type TransactionRow,
} from '../_shared/handler.ts';
import { sha256Hex } from '../_shared/auth.ts';
import { createSlidingWindowLimiter } from '../_shared/rate-limit.ts';

const BAIDURI_SAMPLE =
  'Card No.: 4x0213 Amount: BND 21.00 Merchant: GALORIES SMOOTHIES BSB BN Date: 10-07-2026 17:37:59 If suspicious, please call 2449666.';
const TOKEN = 'bp_testtoken';
const USER_ID = 'user-a';

function makeFakeStore(): IngestStore & { rows: TransactionRow[]; lastSeenTouches: string[] } {
  const rows: TransactionRow[] = [];
  const lastSeenTouches: string[] = [];
  let nextId = 1;
  let tokenHashForDevice: string | null = null;
  // Resolve lazily so the fixture doesn't need top-level await.
  void sha256Hex(TOKEN).then((h) => (tokenHashForDevice = h));

  return {
    rows,
    lastSeenTouches,
    async findActiveDeviceByTokenHash(tokenHash: string) {
      tokenHashForDevice ??= await sha256Hex(TOKEN);
      return tokenHash === tokenHashForDevice ? { id: 'device-1', user_id: USER_ID } : null;
    },
    touchLastSeen(deviceId: string) {
      lastSeenTouches.push(deviceId);
    },
    async insertTransaction(row: TransactionInsert) {
      const existing = rows.find((r) => r.user_id === row.user_id && r.raw_hash === row.raw_hash);
      if (existing) return { inserted: null, existingId: existing.id };
      const inserted: TransactionRow = { ...row, id: `tx-${nextId++}`, possible_duplicate_of: null };
      rows.push(inserted);
      return { inserted, existingId: null };
    },
    async findNearDuplicateId({ userId, amount, cardLast4, occurredAtIso, windowMs, excludeId }) {
      const t = new Date(occurredAtIso).getTime();
      const hit = rows.find(
        (r) =>
          r.id !== excludeId &&
          r.user_id === userId &&
          r.amount === amount &&
          r.card_last4 === cardLast4 &&
          r.occurred_at !== null &&
          Math.abs(new Date(r.occurred_at).getTime() - t) <= windowMs,
      );
      return hit?.id ?? null;
    },
    async setPossibleDuplicate(txId: string, duplicateOfId: string) {
      const row = rows.find((r) => r.id === txId);
      if (row) row.possible_duplicate_of = duplicateOfId;
    },
  };
}

const allowAll: RateLimiter = { allow: () => true };
const auth = `Bearer ${TOKEN}`;
const body = (text: string, extra: Record<string, unknown> = {}) => ({ text, source: 'paste', ...extra });

describe('handleIngest', () => {
  it('rejects missing/malformed authorization with 401', async () => {
    const store = makeFakeStore();
    expect((await handleIngest(null, body(BAIDURI_SAMPLE), store, allowAll)).status).toBe(401);
    expect((await handleIngest('Token abc', body(BAIDURI_SAMPLE), store, allowAll)).status).toBe(401);
  });

  it('rejects unknown tokens with 401 and inserts nothing', async () => {
    const store = makeFakeStore();
    const res = await handleIngest('Bearer bp_wrong', body(BAIDURI_SAMPLE), store, allowAll);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_token');
    expect(store.rows).toHaveLength(0);
  });

  it('returns 429 when the rate limiter denies', async () => {
    const store = makeFakeStore();
    const res = await handleIngest(auth, body(BAIDURI_SAMPLE), store, { allow: () => false });
    expect(res.status).toBe(429);
  });

  it('enforces the sliding window at 60 requests/minute per token', async () => {
    const store = makeFakeStore();
    let clock = 0;
    const limiter = createSlidingWindowLimiter(60, 60_000, () => clock);
    for (let i = 0; i < 60; i++) {
      clock += 10;
      expect(limiter.allow('k')).toBe(true);
    }
    expect(limiter.allow('k')).toBe(false);
    clock += 61_000; // window rolls over
    expect(limiter.allow('k')).toBe(true);
    void store;
  });

  it('rejects empty text with 422 empty_text', async () => {
    const store = makeFakeStore();
    const res = await handleIngest(auth, body('   '), store, allowAll);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('empty_text');
  });

  it('rejects oversized text and invalid source with 422', async () => {
    const store = makeFakeStore();
    const big = await handleIngest(auth, body('x'.repeat(5000)), store, allowAll);
    expect(big.status).toBe(422);
    const badSource = await handleIngest(auth, { text: 'BND 5.00 at X', source: 'email' }, store, allowAll);
    expect(badSource.status).toBe(422);
  });

  it('ignores OTPs without inserting', async () => {
    const store = makeFakeStore();
    const res = await handleIngest(
      auth,
      body('Your Baiduri OTP is 123456. Do not share this code.'),
      store,
      allowAll,
    );
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ignored');
    expect(store.rows).toHaveLength(0);
  });

  it('creates a parsed transaction from the real Baiduri sample', async () => {
    const store = makeFakeStore();
    const res = await handleIngest(auth, body(BAIDURI_SAMPLE, { sender: 'Baiduri' }), store, allowAll);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('created');
    const tx = res.body.transaction as TransactionRow;
    expect(tx.amount).toBe(21);
    expect(tx.currency).toBe('BND');
    expect(tx.merchant).toBe('GALORIES SMOOTHIES BSB BN');
    expect(tx.occurred_at).toBe('2026-07-10T17:37:59+08:00');
    expect(tx.bank).toBe('baiduri');
    expect(tx.card_last4).toBe('0213');
    expect(tx.parse_status).toBe('parsed');
    expect(store.lastSeenTouches).toEqual(['device-1']);
  });

  it('returns duplicate on exact re-ingest (same normalized text)', async () => {
    const store = makeFakeStore();
    const first = await handleIngest(auth, body(BAIDURI_SAMPLE), store, allowAll);
    const firstId = (first.body.transaction as TransactionRow).id;
    // Same message with different whitespace normalizes to the same hash.
    const again = await handleIngest(auth, body(BAIDURI_SAMPLE.replace(' Amount', '   Amount')), store, allowAll);
    expect(again.body.status).toBe('duplicate');
    expect(again.body.transaction_id).toBe(firstId);
    expect(store.rows).toHaveLength(1);
  });

  it('stores unparseable-but-plausible text as needs_review', async () => {
    const store = makeFakeStore();
    const res = await handleIngest(auth, body('asdf qwerty zxcv payment thing'), store, allowAll);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('created');
    const tx = res.body.transaction as TransactionRow;
    expect(tx.parse_status).toBe('needs_review');
    expect(tx.amount).toBeNull();
    expect(tx.raw_text).toBe('asdf qwerty zxcv payment thing');
  });

  it('marks generic low-confidence parses as needs_review', async () => {
    const store = makeFakeStore();
    const res = await handleIngest(
      auth,
      body('You spent BND 12.30 at THE COFFEE BEAN on 12/07/26 using card ending 4321.'),
      store,
      allowAll,
    );
    const tx = res.body.transaction as TransactionRow;
    expect(tx.bank).toBe('unknown');
    expect(tx.amount).toBe(12.3);
    expect(tx.parse_status).toBe('needs_review');
  });

  it('flags near-duplicates (same amount/card within ±3 min, different text)', async () => {
    const store = makeFakeStore();
    await handleIngest(auth, body(BAIDURI_SAMPLE), store, allowAll);
    // Different wording, same spend, 2 minutes later — inside the window.
    const echo = await handleIngest(
      auth,
      body('BND 21.00 spent at GALORIES card ending 0213', { received_at: '2026-07-10T17:39:59+08:00' }),
      store,
      allowAll,
    );
    expect(echo.body.status).toBe('created');
    const tx = echo.body.transaction as TransactionRow;
    expect(tx.possible_duplicate_of).toBe(store.rows[0]!.id);
    expect(NEAR_DUPE_WINDOW_MS).toBe(180_000);
  });
});
