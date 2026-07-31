import { describe, expect, it } from 'vitest';
import {
  reconcileDismissal,
  reviewDismissedKey,
  shouldShowReviewBanner,
} from '../src/lib/reviewBanner';

describe('shouldShowReviewBanner', () => {
  it('stays hidden when the queue is empty', () => {
    expect(shouldShowReviewBanner(0, 0)).toBe(false);
  });

  it('shows when something is waiting and nothing has been dismissed', () => {
    expect(shouldShowReviewBanner(3, 0)).toBe(true);
  });

  it('stays hidden at the count it was dismissed at', () => {
    expect(shouldShowReviewBanner(3, 3)).toBe(false);
  });

  it('returns when something new arrives above the watermark', () => {
    expect(shouldShowReviewBanner(4, 3)).toBe(true);
  });

  it('stays hidden while the queue only shrinks', () => {
    expect(shouldShowReviewBanner(2, 3)).toBe(false);
  });
});

describe('reconcileDismissal', () => {
  it('follows the count down so a cleared inbox re-arms the banner', () => {
    // The case that is easy to miss: dismissed at 3, then all 3 are cleared.
    // Without this the watermark stays at 3 and the next two arrivals are
    // silent.
    expect(reconcileDismissal(0, 3)).toBe(0);
    expect(shouldShowReviewBanner(1, reconcileDismissal(0, 3))).toBe(true);
  });

  it('leaves the watermark alone while the queue is still above it', () => {
    expect(reconcileDismissal(5, 3)).toBe(3);
  });

  it('is a no-op at rest', () => {
    expect(reconcileDismissal(3, 3)).toBe(3);
  });
});

describe('the full dismiss cycle', () => {
  it('interrupts once per genuinely new batch', () => {
    let watermark = 0;
    const seen = (count: number) => {
      watermark = reconcileDismissal(count, watermark);
      return shouldShowReviewBanner(count, watermark);
    };
    const dismiss = (count: number) => {
      watermark = count;
    };

    expect(seen(3)).toBe(true); // three arrive
    dismiss(3);
    expect(seen(3)).toBe(false); // waved off
    expect(seen(5)).toBe(true); // two more arrive
    dismiss(5);
    expect(seen(5)).toBe(false);
    expect(seen(0)).toBe(false); // inbox worked to zero
    expect(seen(1)).toBe(true); // and one new one shows again
  });
});

describe('reviewDismissedKey', () => {
  it('is scoped per user and legal for SecureStore', () => {
    const key = reviewDismissedKey('3f8b1c2e-0a4d-4b6f-9c1e-5d7a8b9c0d1e');
    expect(key).toMatch(/^[\w.-]+$/);
    expect(reviewDismissedKey('a')).not.toBe(reviewDismissedKey('b'));
  });
});
