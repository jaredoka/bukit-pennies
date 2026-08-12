import * as StoreReview from 'expo-store-review';
import { useSession } from './session';
import { kvGet, kvSet } from './kvStore';
import { useParsedTransactionCount } from './queries';

/**
 * Rate-me prompt, gated hard.
 *
 * iOS's own StoreKit already throttles the system sheet to a handful of
 * prompts per year; the gate here is on top of that and serves the product,
 * not the store: the ask only happens after a user has saved ten real
 * transactions (proven value), and only once per account on this device. A
 * prompt before value would annoy; a prompt after every capture would be
 * noise. Both are avoided.
 *
 * The flag lives in device-local storage (kvStore), scoped per user id like
 * every account-derived marker. Web is skipped entirely — `isAvailableAsync`
 * resolves false there, and nothing about the web demo should nag.
 */

/** Transactions a user must have saved before the prompt is allowed. */
export const REVIEW_PROMPT_THRESHOLD = 10;

/** kvStore key for "we already asked this account on this device". */
export function reviewPromptedKey(userId: string): string {
  return `bukit.rate_prompted.${userId}`;
}

/**
 * Try to show the App Store review sheet, if and only if the gate is open:
 * not already asked, at least `threshold` transactions saved, and the
 * platform can actually present a review UI.
 *
 * `countParsed` is injected so the pure decision stays testable without a
 * database; the caller wires it to `useParsedTransactionCount`'s source.
 * Returns true when the prompt was shown, false when the gate closed it.
 */
export async function maybeRequestReview(
  userId: string,
  countParsed: () => Promise<number>,
  threshold: number = REVIEW_PROMPT_THRESHOLD,
): Promise<boolean> {
  if (await kvGet(reviewPromptedKey(userId))) return false;
  if ((await countParsed()) < threshold) return false;
  if (!(await StoreReview.isAvailableAsync())) return false;

  await StoreReview.requestReview();
  await kvSet(reviewPromptedKey(userId), '1');
  return true;
}

/**
 * Hook form for screens: gives a save-success handler the prompt without the
 * screen knowing the threshold, the flag key, or that a count is involved.
 * The count is refetched at call time so the ten-transaction gate is judged
 * against the freshest number, not the query's last known value.
 */
export function useReviewPrompt() {
  const { session } = useSession();
  const parsedCount = useParsedTransactionCount();

  return async () => {
    const userId = session?.user.id;
    if (!userId) return false;
    const { data } = await parsedCount.refetch();
    return maybeRequestReview(userId, async () => data ?? 0);
  };
}
