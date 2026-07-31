import { describe, expect, it } from 'vitest';
import { buildReparsePatch, canReparse, type ReparseInput } from '../src/lib/reparse';

// The two real fixtures the parser package is built on, so a change to either
// parser shows up here too.
const BAIDURI =
  'Card No.: 4x0213 Amount: BND 21.00 Merchant: GALORIES SMOOTHIES BSB BN ' +
  'Date: 10-07-2026 17:37:59 If suspicious, please call 2449666.';
const BIBD =
  'Dear Customer, Purchase of BND5.10 at HUA HO DEPARTME, has successfully ' +
  'been made on your card ending with 0298. Thank you for banking with BIBD.';

const row = (patch: Partial<ReparseInput> = {}): ReparseInput => ({
  source: 'paste',
  raw_text: BAIDURI,
  occurred_at: '2026-07-10T17:37:59+08:00',
  created_at: '2026-07-10T17:38:04+08:00',
  ...patch,
});

describe('canReparse', () => {
  it('refuses manual entries', () => {
    expect(canReparse({ source: 'manual' })).toBe(false);
  });

  it('allows every captured source', () => {
    for (const source of ['paste', 'ios_shortcut', 'android_listener', 'share'] as const) {
      expect(canReparse({ source })).toBe(true);
    }
  });
});

describe('buildReparsePatch', () => {
  it('re-extracts a Baiduri message exactly', () => {
    expect(buildReparsePatch(row())).toEqual({
      amount: 21,
      currency: 'BND',
      merchant: 'GALORIES SMOOTHIES BSB BN',
      merchant_normalized: 'GALORIES SMOOTHIES BSB BN',
      occurred_at: '2026-07-10T17:37:59+08:00',
      card_last4: '0213',
      bank: 'baiduri',
      confidence: 1,
      parse_status: 'parsed',
    });
  });

  // The bug this module exists for. BIBD messages carry no timestamp, so
  // without a receivedAt the parser returns occurredAt: null — which used to be
  // written straight over a date the row already had, dropping the transaction
  // out of every dashboard query (they all filter occurred_at is not null).
  it('keeps a BIBD row’s date, which its text does not contain', () => {
    const patch = buildReparsePatch(row({ raw_text: BIBD, occurred_at: '2026-07-17T12:00:00+08:00' }));
    expect(patch?.occurred_at).toBe('2026-07-17T12:00:00+08:00');
    expect(patch?.merchant).toBe('HUA HO DEPARTME');
    expect(patch?.bank).toBe('bibd');
  });

  it('falls back to created_at when the row has no date at all', () => {
    const patch = buildReparsePatch(
      row({ raw_text: BIBD, occurred_at: null, created_at: '2026-07-17T09:15:00+08:00' }),
    );
    expect(patch?.occurred_at).toBe('2026-07-17T09:15:00+08:00');
  });

  it('returns null for a manual entry instead of mangling it', () => {
    // Exactly the string useCreateManualTransaction writes. The generic
    // extractor would find the amount, miss the lower-case merchant, and come
    // back capped — blanking a merchant the user typed by hand.
    const manual = row({
      source: 'manual',
      raw_text: 'Manual entry: BND 12.00 at Pasar Gadong on 2026-07-31T10:00:00+08:00',
    });
    expect(buildReparsePatch(manual)).toBeNull();
  });

  it('returns null rather than a patch of nulls when nothing parses', () => {
    expect(buildReparsePatch(row({ raw_text: 'ran out of milk' }))).toBeNull();
  });

  it('sends a low-confidence re-parse back to review', () => {
    // Unknown format → the generic parser, whose confidence is capped below the
    // review threshold by design.
    const patch = buildReparsePatch(row({ raw_text: 'Spent BND 9.90 at KIANGGEH MARKET' }));
    expect(patch?.parse_status).toBe('needs_review');
    expect(patch?.confidence).toBeLessThan(0.75);
  });
});
