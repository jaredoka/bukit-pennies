// Turns a transport failure into something a user can act on.
//
// When the app cannot reach Supabase at all — offline, wrong URL in
// EXPO_PUBLIC_SUPABASE_URL, a local stack that is not running — `fetch` fails
// before any HTTP status exists, and the message that reaches the screen is
// the raw "TypeError: Failed to fetch" (web) or "Network request failed"
// (React Native). Both read as a crash rather than as "you are offline", which
// is what sent a working feature back as a bug report.
//
// Deliberately no dependencies so it can be unit-tested on its own.

export const NETWORK_ERROR_MESSAGE =
  'Could not reach the server. Check your connection and try again.';

/** Whether a message describes a transport failure rather than a server reply. */
export function isNetworkFailure(message: string): boolean {
  return /failed to fetch|network request failed|networkerror|load failed|fetch failed|err_(?:internet_disconnected|connection_refused|network_changed)/i.test(
    message,
  );
}

/** The message to show for a failed request: readable for transport failures,
 *  otherwise whatever the server actually said (a constraint violation, an RLS
 *  refusal) — those are the useful ones and must survive untouched. */
export function describeRequestError(message: string): string {
  return isNetworkFailure(message) ? NETWORK_ERROR_MESSAGE : message;
}
