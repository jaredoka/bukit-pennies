import { Platform } from 'react-native';

// Small device-local key/value store (SecureStore on native, localStorage on
// web dev) for preferences that don't belong in the cloud: theme, privacy
// cloak, reminder options, digest opt-in, fired-alert markers.

/**
 * SecureStore accepts `/^[\w.-]+$/` and *throws* on anything else. The
 * onboarding keys were `onboarded:<uuid>` and `setup_dismissed:<uuid>`; every
 * read and write threw on the colon and was swallowed by the catch below, so
 * dismissing the dashboard setup card, ticking a setup step, and finishing the
 * guide all wrote nothing at all and came back on the next launch. Web dev
 * never saw it — localStorage takes any key.
 *
 * Keys are sanitised here rather than only at the call sites so that the next
 * `${something}:${id}` key is merely ugly instead of silently broken.
 */
function safeKey(key: string): string {
  return key.replace(/[^\w.-]/g, '_');
}

/**
 * Nothing here is worth crashing a screen over, but failing silently is what
 * hid the bug above for two phases. Surface it in dev.
 */
function warn(op: string, key: string, err: unknown): void {
  if (__DEV__) console.warn(`kvStore.${op}(${key}) failed:`, err);
}

export async function kvGet(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(safeKey(key)) ?? null;
    const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
    return await SecureStore.getItemAsync(safeKey(key));
  } catch (err) {
    warn('kvGet', key, err);
    return null;
  }
}

export async function kvSet(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(safeKey(key), value);
      return;
    }
    const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
    await SecureStore.setItemAsync(safeKey(key), value);
  } catch (err) {
    warn('kvSet', key, err);
  }
}

export async function kvGetJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await kvGet(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function kvSetJson(key: string, value: unknown): Promise<void> {
  await kvSet(key, JSON.stringify(value));
}
