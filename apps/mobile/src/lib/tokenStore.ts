import { Platform } from 'react-native';

// Stores this device's ingest token (plaintext exists only client-side; the
// server keeps sha256). SecureStore on native, localStorage on web dev.
const KEY = 'bukit.ingest_token';

export async function getStoredToken(): Promise<string | null> {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) ?? null;
  const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
  return SecureStore.getItemAsync(KEY);
}

export async function setStoredToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(KEY, token);
    return;
  }
  const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
  await SecureStore.setItemAsync(KEY, token);
}

export async function clearStoredToken(): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.removeItem(KEY);
    return;
  }
  const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
  await SecureStore.deleteItemAsync(KEY);
}
