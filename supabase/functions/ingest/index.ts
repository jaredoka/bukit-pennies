// Thin Deno wrapper: HTTP + Supabase service-role I/O. All ingest logic lives
// in ../_shared/handler.ts (pure, unit-tested with vitest).
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  handleIngest,
  MAX_TEXT_BYTES,
  type IngestStore,
  type TransactionInsert,
  type TransactionRow,
} from '../_shared/handler.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

/**
 * Client IP. Supabase fronts functions with Cloudflare, so cf-connecting-ip is
 * a single clean value; x-forwarded-for is the fallback and arrives as
 * "<client>,<client>, <proxy>", hence the first hop. Null when neither is
 * present, which disables the peer budget rather than lumping every
 * unknown-IP request into one shared bucket.
 */
function peerKeyOf(req: Request): string | null {
  const direct = req.headers.get('cf-connecting-ip')?.trim();
  if (direct) return direct;
  const first = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return first ? first : null;
}

const store: IngestStore = {
  async resolveDevice({ tokenHash, peerKey }) {
    const { data, error } = await supabase
      .rpc('resolve_ingest_device', { p_token_hash: tokenHash, p_peer: peerKey })
      .maybeSingle<{ device_id: string | null; device_user_id: string | null; blocked: boolean }>();
    if (error) throw error;
    if (!data) return { device: null, blocked: false };
    return {
      device: data.device_id && data.device_user_id
        ? { id: data.device_id, user_id: data.device_user_id }
        : null,
      blocked: data.blocked,
    };
  },

  touchLastSeen(deviceId) {
    // Fire-and-forget by design (HANDOFF §6 step 1).
    void supabase
      .from('ingest_devices')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', deviceId)
      .then(({ error }) => {
        if (error) console.error('touchLastSeen failed:', error.message);
      });
  },

  async insertTransaction(row: TransactionInsert) {
    const { data, error } = await supabase
      .from('transactions')
      .upsert(row, { onConflict: 'user_id,raw_hash', ignoreDuplicates: true })
      .select()
      .maybeSingle();
    if (error) throw error;
    if (data) return { inserted: normalizeRow(data), existingId: null };

    const { data: existing, error: lookupError } = await supabase
      .from('transactions')
      .select('id')
      .eq('user_id', row.user_id)
      .eq('raw_hash', row.raw_hash)
      .maybeSingle();
    if (lookupError) throw lookupError;
    return { inserted: null, existingId: existing?.id ?? null };
  },

  async findNearDuplicateId({ userId, amount, cardLast4, occurredAtIso, windowMs, excludeId }) {
    const t = new Date(occurredAtIso).getTime();
    let query = supabase
      .from('transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('amount', amount)
      .neq('id', excludeId)
      .gte('occurred_at', new Date(t - windowMs).toISOString())
      .lte('occurred_at', new Date(t + windowMs).toISOString())
      .limit(1);
    query = cardLast4 === null ? query.is('card_last4', null) : query.eq('card_last4', cardLast4);
    const { data, error } = await query;
    if (error) throw error;
    return data?.[0]?.id ?? null;
  },

  async setPossibleDuplicate(txId, duplicateOfId) {
    const { error } = await supabase
      .from('transactions')
      .update({ possible_duplicate_of: duplicateOfId })
      .eq('id', txId);
    if (error) throw error;
  },

  async findGlobalCategoryIdByName(name) {
    const cached = categoryIdCache.get(name);
    if (cached !== undefined) return cached;
    const { data, error } = await supabase
      .from('categories')
      .select('id')
      .is('user_id', null)
      .eq('name', name)
      .maybeSingle();
    if (error) throw error;
    const id = data?.id ?? null;
    categoryIdCache.set(name, id);
    return id;
  },
};

// Global default categories are seeded by migration and never change at
// runtime; cache per function instance.
const categoryIdCache = new Map<string, string | null>();

// Postgres numeric comes back as a string; the API contract promises a number.
function normalizeRow(data: Record<string, unknown>): TransactionRow {
  return {
    ...(data as unknown as TransactionRow),
    amount: data.amount === null ? null : Number(data.amount),
  };
}

/**
 * Largest request body we will read, in bytes.
 *
 * Twice `MAX_TEXT_BYTES` plus an envelope allowance, not `MAX_TEXT_BYTES + n`:
 * JSON escaping can double the text's byte count, since every `"`, `\` and
 * control character serialises to two bytes. A message at exactly the
 * documented 4 KB limit that happened to be quote-heavy would otherwise be
 * refused here with 413 instead of being processed — a limit that rejects
 * input the contract promises to accept is a bug, not a tighter bound. The
 * 1 KB tail covers `source`, `sender`, `received_at` and the punctuation.
 *
 * A real capture is a fraction of this; the point is only that it is
 * kilobytes rather than whatever the platform would otherwise allow.
 */
const MAX_BODY_BYTES = MAX_TEXT_BYTES * 2 + 1024;

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ status: 'error', error: 'method_not_allowed' }, { status: 405 });
  }

  // Ingress bound, BEFORE the body is read. `verify_jwt = false` on this
  // function, so everything below this line is reachable by anyone who can
  // resolve the hostname — and the rate limits cannot help, because both
  // budgets live in `resolveDevice`, which runs after the parse they would be
  // protecting. Without this, a peer with no token at all could make us
  // materialise a multi-megabyte body per request for free.
  //
  // A missing or unparseable Content-Length is refused rather than allowed
  // through: both `fetch` and the iOS Shortcut set it for a JSON body, and a
  // chunked request is the one shape that could stream past a length check.
  const declaredBytes = Number(req.headers.get('content-length'));
  if (!Number.isFinite(declaredBytes) || declaredBytes <= 0 || declaredBytes > MAX_BODY_BYTES) {
    // Cancel the stream before responding. Returning a response while an
    // unread body is still arriving makes the runtime log "user body write
    // aborted" and drop the connection, so the caller sees a hang or a 504
    // instead of this 413 — verified against the local edge runtime. Cancel
    // discards the remainder without materialising it, which is the whole
    // point of rejecting here.
    try {
      await req.body?.cancel();
    } catch {
      // Peer already gone; the response below is best-effort either way.
    }
    return Response.json({ status: 'error', error: 'payload_too_large' }, { status: 413 });
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    // handler responds 422 invalid_body
  }

  try {
    const result = await handleIngest(req.headers.get('authorization'), body, store, {
      peerKey: peerKeyOf(req),
    });
    if (result.body.status === 'created' && result.body.transaction?.parse_status === 'needs_review') {
      console.warn(JSON.stringify({
        level: 'warn',
        msg: 'low_confidence_parse',
        txn_id: result.body.transaction.id,
        confidence: result.body.transaction.confidence,
        bank: result.body.transaction.bank,
      }));
    }
    return Response.json(result.body, { status: result.status });
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      msg: 'ingest_failed',
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }));
    return Response.json({ status: 'error', error: 'internal_error' }, { status: 500 });
  }
});
