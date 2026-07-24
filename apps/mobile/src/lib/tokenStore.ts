import { Platform } from 'react-native';

// Stores this device's ingest token (plaintext exists only client-side; the
// server keeps sha256). SecureStore on native, localStorage on web dev.
//
// The key is scoped per user id. A device-global key leaked transactions
// across accounts: the token outlived sign-out, so the next user to sign in on
// the same device posted their captures with the previous user's bearer token
// and the ingest function filed them under the previous user's account (see
// HANDOFF §18, SEC-1). Scoping by user id also lets two accounts share a
// device without either one re-running the Shortcut setup.

const LEGACY_KEY = 'bukit.ingest_token';

function keyFor(userId: string): string {
  return `bukit.ingest_token.${userId}`;
}

function secureStore() {
  return require('expo-secure-store') as typeof import('expo-secure-store');
}

async function readKey(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
  return secureStore().getItemAsync(key);
}

async function writeKey(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await secureStore().setItemAsync(key, value);
}

async function deleteKey(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.removeItem(key);
    return;
  }
  await secureStore().deleteItemAsync(key);
}

/**
 * This user's ingest token, or null. Adopts a pre-scoping token left in the
 * legacy device-global key on first call, then removes it — safe because the
 * upgrading user is the only account that has ever used this install's token.
 */
export async function getStoredToken(userId: string): Promise<string | null> {
  const scoped = await readKey(keyFor(userId));
  if (scoped) return scoped;

  const legacy = await readKey(LEGACY_KEY);
  if (!legacy) return null;
  await writeKey(keyFor(userId), legacy);
  await deleteKey(LEGACY_KEY);
  return legacy;
}

export async function setStoredToken(userId: string, token: string): Promise<void> {
  await writeKey(keyFor(userId), token);
}

/** Removes this user's token, and any legacy device-global leftover. */
export async function clearStoredToken(userId: string): Promise<void> {
  await deleteKey(keyFor(userId));
  await deleteKey(LEGACY_KEY);
}
