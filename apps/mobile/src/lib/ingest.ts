import { INGEST_URL } from './env';
import { supabase } from './supabase';
import { getStoredToken, setStoredToken } from './tokenStore';
import type { TransactionRow, TxSource } from './types';

export interface IngestResponse {
  status: 'created' | 'duplicate' | 'ignored' | 'error';
  transaction?: TransactionRow;
  transaction_id?: string;
  reason?: string;
  error?: string;
}

/**
 * Returns this device's ingest token, provisioning one through the
 * create_ingest_token RPC on first use (plaintext is returned exactly once).
 */
export async function ensureIngestToken(kind: TxSource = 'paste'): Promise<string> {
  const stored = await getStoredToken();
  if (stored) return stored;
  const { data, error } = await supabase.rpc('create_ingest_token', {
    p_name: 'This device (paste)',
    p_kind: kind,
  });
  if (error) throw new Error(`could not create ingest token: ${error.message}`);
  const token = data as string;
  await setStoredToken(token);
  return token;
}

export async function postIngest(
  text: string,
  source: TxSource = 'paste',
  sender?: string,
): Promise<IngestResponse> {
  const token = await ensureIngestToken(source);
  const res = await fetch(INGEST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      source,
      ...(sender ? { sender } : {}),
      received_at: new Date().toISOString(),
    }),
  });
  const body = (await res.json()) as IngestResponse;
  if (!res.ok && res.status !== 401) {
    return { status: 'error', error: body.error ?? `HTTP ${res.status}` };
  }
  if (res.status === 401) return { status: 'error', error: 'invalid_token' };
  return body;
}
