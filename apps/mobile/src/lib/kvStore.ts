import { Platform } from 'react-native';

// Small device-local key/value store (SecureStore on native, localStorage on
// web dev) for preferences that don't belong in the cloud: theme, privacy
// cloak, reminder options, digest opt-in, fired-alert markers.

export async function kvGet(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
    const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(key, value);
      return;
    }
    const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
    await SecureStore.setItemAsync(key, value);
  } catch {
    // best-effort
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
