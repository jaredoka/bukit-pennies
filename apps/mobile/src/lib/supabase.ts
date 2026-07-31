import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env';
import { isFreshInstall } from './installMarker';

// Keys this process has already considered for the fresh-install purge below.
// Without it the purge would fire on *every* read, and the read that follows
// sign-in would delete the session that was just written.
const purgedKeys = new Set<string>();

/**
 * Reads a persisted auth value, dropping whatever an earlier install left
 * behind.
 *
 * iOS wipes an app's container on delete but not its Keychain entries, so the
 * refresh token supabase-js persists here outlives the app itself: delete,
 * reinstall, and the first launch lands on the dashboard as the previous
 * account. That is standard iOS behaviour rather than a bug, but deleting the
 * app is how most people expect to get their spending history off a phone, and
 * for a finance app the wrong side of that expectation is the one that has to
 * be argued for. A fresh install starts signed out.
 *
 * It lives in the storage adapter rather than in `SessionProvider` for two
 * reasons, both of which rule out the more obvious `supabase.auth.signOut()`:
 *
 *  - **Ordering.** The GoTrue client reads storage while `createClient` is
 *    still running, so an effect that signs out later is racing a session that
 *    is already in memory and will simply be re-persisted on the next refresh.
 *    Everything supabase-js reads comes through here, so there is no race.
 *  - **The network.** `signOut` calls the logout endpoint even at
 *    `scope: 'local'`, and on anything that is not a 401/403/404 it returns
 *    early *without* clearing local state. A fresh install with no signal
 *    would have stayed signed in — permanently, because the marker is consumed
 *    on that same launch and never reports `true` again. Deleting the value is
 *    offline-safe and needs no round trip.
 *
 * The refresh token stays valid server-side until it expires; what this
 * guarantees is that the credential is gone from the handset, which is the
 * property the user is asking for when they delete the app. Revoking it would
 * need the network call this deliberately avoids.
 */
async function readAuthKey(
  SecureStore: typeof import('expo-secure-store'),
  key: string,
): Promise<string | null> {
  if (!purgedKeys.has(key)) {
    purgedKeys.add(key);
    if (await isFreshInstall()) {
      await SecureStore.deleteItemAsync(key);
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

// expo-secure-store has no web implementation; on web supabase-js falls back
// to its default localStorage adapter.
const nativeStorage =
  Platform.OS === 'web'
    ? undefined
    : (() => {
        const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
        return {
          getItem: (key: string) => readAuthKey(SecureStore, key),
          setItem: (key: string, value: string) => {
            // A value written this session is this session's, never a leftover.
            purgedKeys.add(key);
            return SecureStore.setItemAsync(key, value);
          },
          removeItem: (key: string) => SecureStore.deleteItemAsync(key),
        };
      })();

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: nativeStorage,
    autoRefreshToken: true,
    persistSession: true,
    // PKCE so password-recovery links carry a ?code= that native deep links
    // can exchange; on web the client picks the code up from the URL itself.
    flowType: 'pkce',
    detectSessionInUrl: Platform.OS === 'web',
  },
});
