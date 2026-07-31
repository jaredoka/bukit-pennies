import { beforeEach, describe, expect, it } from 'vitest';
import { kvGet, kvGetJson, kvSet, kvSetJson } from '../src/lib/kvStore';
import { onboardedKey } from '../src/lib/onboarding';
import { reviewDismissedKey } from '../src/lib/reviewBanner';

/**
 * The rule expo-secure-store enforces on keys. Anything outside this set makes
 * `setItemAsync` *throw*, and kvStore's catch swallowed it — so dismissing the
 * dashboard setup card, ticking a setup step and completing the guide all
 * wrote nothing at all, and the prompt came back on every launch. It shipped
 * because web dev uses localStorage, which accepts any key.
 */
const SECURE_STORE_KEY = /^[\w.-]+$/;

const USER_ID = '3f8b1c2e-0a4d-4b6f-9c1e-5d7a8b9c0d1e';

beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});

describe('key sanitising', () => {
  it('accepts a colon-bearing key and stores it under a legal one', async () => {
    await kvSet('setup_dismissed:abc', '1');
    expect(await kvGet('setup_dismissed:abc')).toBe('1');
    // Same slot: the colon is mapped, not merely tolerated on the way in.
    expect(await kvGet('setup_dismissed_abc')).toBe('1');
  });

  it('leaves already-legal keys untouched', async () => {
    await kvSet('bukit.theme', 'dark');
    expect(await kvGet('bukit.theme')).toBe('dark');
  });

  it('does not collapse two distinct keys into one', async () => {
    await kvSet('bukit.a.1', 'first');
    await kvSet('bukit.a.2', 'second');
    expect(await kvGet('bukit.a.1')).toBe('first');
    expect(await kvGet('bukit.a.2')).toBe('second');
  });

  it('round-trips JSON', async () => {
    await kvSetJson('bukit.setup_steps.x', [1, 2, 3]);
    expect(await kvGetJson('bukit.setup_steps.x', [])).toEqual([1, 2, 3]);
  });

  it('falls back when the stored value is not JSON', async () => {
    await kvSet('bukit.broken', 'not json');
    expect(await kvGetJson('bukit.broken', { ok: true })).toEqual({ ok: true });
  });
});

describe('keys the app actually builds', () => {
  it('are all legal for SecureStore', () => {
    // The guard that would have caught the original bug. Add any new key
    // builder here.
    const keys = [
      onboardedKey(USER_ID),
      `bukit.setup_dismissed.${USER_ID}`,
      `bukit.setup_steps.${USER_ID}`,
      `bukit.reminders.${USER_ID}`,
      `bukit.digest.${USER_ID}`,
      `bukit.alerted.${USER_ID}`,
      `bukit.ingest_token.${USER_ID}`,
      reviewDismissedKey(USER_ID),
      'bukit.theme',
      'bukit.privacy',
      'bukit.primary_currency',
    ];
    for (const key of keys) {
      expect(key, `${key} is not a legal SecureStore key`).toMatch(SECURE_STORE_KEY);
    }
  });

  it('scopes onboarding state per user', () => {
    expect(onboardedKey('a')).not.toBe(onboardedKey('b'));
  });
});
