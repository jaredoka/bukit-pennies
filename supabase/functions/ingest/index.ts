// Thin Deno wrapper: HTTP + Supabase service-role I/O. All ingest logic lives
// in ../_shared/handler.ts (pure, unit-tested with vitest).
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  handleIngest,
  type IngestStore,
  type TransactionInsert,
  type TransactionRow,
} from '../_shared/handler.ts';
import { createSlidingWindowLimiter } from '../_shared/rate-limit.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

const rateLimiter = createSlidingWindowLimiter(60, 60_000);

const store: IngestStore = {
  async findActiveDeviceByTokenHash(tokenHash) {
    const { data, error } = await supabase
      .from('ingest_devices')
      .select('id, user_id')
      .eq('token_hash', tokenHash)
      .is('revoked_at', null)
      .maybeSingle();
    if (error) throw error;
    return data;
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
};

// Postgres numeric comes back as a string; the API contract promises a number.
function normalizeRow(data: Record<string, unknown>): TransactionRow {
  return {
    ...(data as unknown as TransactionRow),
    amount: data.amount === null ? null : Number(data.amount),
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ status: 'error', error: 'method_not_allowed' }, { status: 405 });
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    // handler responds 422 invalid_body
  }

  try {
    const result = await handleIngest(req.headers.get('authorization'), body, store, rateLimiter);
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
