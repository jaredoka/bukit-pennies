import type { RateLimiter } from './handler.ts';

/**
 * Cheap per-token sliding window kept in instance memory. Tokens are
 * long-lived secrets; this only bounds abuse if one leaks — it is not a
 * distributed limiter and resets when the edge instance recycles.
 */
export function createSlidingWindowLimiter(
  maxPerWindow = 60,
  windowMs = 60_000,
  now: () => number = Date.now,
): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    allow(key: string): boolean {
      const cutoff = now() - windowMs;
      const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
      if (recent.length >= maxPerWindow) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now());
      hits.set(key, recent);
      return true;
    },
  };
}
