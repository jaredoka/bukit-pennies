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
  // "network connection was lost" is iOS NSURLErrorNetworkConnectionLost,
  // which arrives wrapped: "fetch failed: UnexpectedException: The network
  // connection was lost. (at ExpoModulesCore/Promise.swift:56)". The leading
  // "fetch failed" already matches, but the wrapper is not ours and the inner
  // sentence is the part that is actually stable.
  return /failed to fetch|network request failed|networkerror|load failed|fetch failed|network connection was lost|err_(?:internet_disconnected|connection_refused|network_changed)/i.test(
    message,
  );
}

/** The message to show for a failed request: readable for transport failures,
 *  otherwise whatever the server actually said (a constraint violation, an RLS
 *  refusal) — those are the useful ones and must survive untouched. */
export function describeRequestError(message: string): string {
  return isNetworkFailure(message) ? NETWORK_ERROR_MESSAGE : message;
}

/**
 * Runs a supabase-js call, and if it fails *in transport*, runs it once more.
 *
 * iOS keeps HTTP connections pooled between requests. When the far end has
 * already closed one, the OS does not find out until it writes to the socket,
 * so the request fails instantly with "The network connection was lost"
 * (NSURLErrorNetworkConnectionLost). URLSession will not retry that itself for
 * a POST, and it is right not to — it cannot know whether the request was
 * processed. The second attempt gets a fresh connection and simply works,
 * which is why signing in failed once and then succeeded untouched.
 *
 * Only transport failures are retried. A real reply — wrong password, user
 * already registered — is returned as-is on the first attempt.
 *
 * Retrying a POST is safe here specifically because the alternative is not "no
 * retry", it is the user tapping the button again: the request is going to be
 * repeated either way, and the only question is whether they have to do it by
 * hand. That reasoning covers the awkward case too — a sign-up whose request
 * did land before the connection dropped is reported as an existing account
 * whether this retries it or the user does.
 *
 * Errors are returned rather than thrown by supabase-js, so this inspects the
 * result instead of catching.
 */
export async function withNetworkRetry<T extends { error: { message: string } | null }>(
  call: () => Promise<T>,
): Promise<T> {
  const first = await call();
  if (!first.error || !isNetworkFailure(first.error.message)) return first;
  return call();
}
