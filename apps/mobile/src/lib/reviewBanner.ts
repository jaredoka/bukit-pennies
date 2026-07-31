/**
 * Whether the dashboard nags about the review inbox.
 *
 * The banner is dismissible, but "dismissed" cannot simply mean "hidden
 * forever" — the queue is the only place a mis-parsed amount gets corrected, so
 * a permanent hide would quietly turn off the one signal that anything is
 * wrong. It cannot mean "hidden until the count changes" either: clear two of
 * three and the banner would pop back for the one you already knew about.
 *
 * So dismissal stores a **watermark** — the count at the moment you dismissed —
 * and the banner returns only when something genuinely new arrives above it.
 * The watermark also follows the count *down*, which is the case that is easy
 * to miss: dismiss at 3, clear all 3, and without that step the watermark would
 * still read 3 and the next two arrivals would be silent.
 *
 * The permanent badge on the Transactions header is the other half of this. It
 * is never dismissible, so the state is always visible somewhere — the banner
 * is only the part that interrupts.
 */
import { kvGetJson, kvSetJson } from './kvStore';

export const reviewDismissedKey = (userId: string): string => `bukit.review_dismissed.${userId}`;

/** Show when there is anything waiting that the user has not already waved off. */
export function shouldShowReviewBanner(count: number, dismissedAtCount: number): boolean {
  return count > 0 && count > dismissedAtCount;
}

/**
 * The watermark to keep, given what the queue holds now. Never above the
 * current count — see the note above about clearing the inbox.
 */
export function reconcileDismissal(count: number, dismissedAtCount: number): number {
  return Math.min(count, dismissedAtCount);
}

export async function getReviewDismissal(userId: string): Promise<number> {
  const stored = await kvGetJson<number>(reviewDismissedKey(userId), 0);
  return typeof stored === 'number' && Number.isFinite(stored) && stored >= 0 ? stored : 0;
}

export async function setReviewDismissal(userId: string, count: number): Promise<void> {
  await kvSetJson(reviewDismissedKey(userId), count);
}
