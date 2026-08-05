import { Platform } from 'react-native';

// Stores this device's ingest token (plaintext exists only client-side; the
// server keeps sha256). SecureStore on native, localStorage on web dev.
//
// The key is scoped per user id. A device-global key leaked transactions
// across accounts: the token outlived sign-out, so the next user to sign in on
// the same device posted their captures with the previous user's bearer token
// and the ingest function filed them under the previous user's account.
// Scoping by user id also lets two accounts share a
// device without either one re-running the Shortcut setup.

// Left behind by pre-scoping builds. Never adopted — only deleted. See
// getStoredToken.
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
 * This user's ingest token, or null.
 *
 * The legacy device-global token is discarded, not adopted. Adoption assumed
 * the upgrading user would be the first to call this after the update, and
 * nothing enforced that: if the previous account never reopened the app, the
 * *next* account to sign in inherited their token, and every capture from this
 * device would have been filed into the previous account (the SEC-1 leak the
 * scoping was introduced to close, surviving through its own migration path).
 * There is no way to check ownership from the client — token_hash is
 * server-side and the plaintext is shown once.
 *
 * The cost is that a device still holding a pre-scoping token has to create a
 * new one in Settings > Capture. That is a one-screen redo, and correctness
 * here is not worth trading for it.
 */
export async function getStoredToken(userId: string): Promise<string | null> {
  const legacy = await readKey(LEGACY_KEY);
  if (legacy) await deleteKey(LEGACY_KEY);
  return readKey(keyFor(userId));
}

export async function setStoredToken(userId: string, token: string): Promise<void> {
  await writeKey(keyFor(userId), token);
}

/** Removes this user's token, and any legacy device-global leftover. */
export async function clearStoredToken(userId: string): Promise<void> {
  await deleteKey(keyFor(userId));
  await deleteKey(LEGACY_KEY);
}
