import type { FailureLimiter, RateLimiter } from './handler.ts';

// Both limiters keep their state in instance memory. Neither is distributed;
// both reset when the edge instance recycles.

// Amortised sweep: every `SWEEP_EVERY` operations, drop every key whose window
// has fully expired. Without it, state keyed on attacker-chosen values grows
// unboundedly for the life of the instance (HANDOFF §18, SEC-2).
const SWEEP_EVERY = 1000;

function createWindowStore(windowMs: number, now: () => number) {
  const hits = new Map<string, number[]>();
  let opsSinceSweep = 0;

  return {
    /** Timestamps for `key` still inside the window, oldest first. */
    recent(key: string): number[] {
      const cutoff = now() - windowMs;

      if (++opsSinceSweep >= SWEEP_EVERY) {
        opsSinceSweep = 0;
        for (const [k, times] of hits) {
          if (times.length === 0 || times[times.length - 1]! <= cutoff) hits.delete(k);
        }
      }

      const kept = (hits.get(key) ?? []).filter((t) => t > cutoff);
      hits.set(key, kept);
      return kept;
    },
    push(key: string, times: number[]): void {
      times.push(now());
      hits.set(key, times);
    },
  };
}

/**
 * Cheap per-token sliding window. Tokens are long-lived secrets; this bounds
 * the damage if one leaks.
 */
export function createSlidingWindowLimiter(
  maxPerWindow = 60,
  windowMs = 60_000,
  now: () => number = Date.now,
): RateLimiter {
  const store = createWindowStore(windowMs, now);
  return {
    allow(key: string): boolean {
      const recent = store.recent(key);
      if (recent.length >= maxPerWindow) return false;
      store.push(key, recent);
      return true;
    },
  };
}

/**
 * Counts *failed* auth attempts per peer (client IP) so a flood of invented
 * tokens is cut off before it reaches the database. Deliberately keyed on
 * failures rather than on all requests: Brunei mobile networks NAT heavily, so
 * a blanket per-IP request cap would throttle unrelated legitimate users,
 * whereas a legitimate device with a valid token never records a failure.
 */
export function createFailureLimiter(
  maxPerWindow = 20,
  windowMs = 60_000,
  now: () => number = Date.now,
): FailureLimiter {
  const store = createWindowStore(windowMs, now);
  return {
    blocked(key: string): boolean {
      return store.recent(key).length >= maxPerWindow;
    },
    record(key: string): void {
      store.push(key, store.recent(key));
    },
  };
}
