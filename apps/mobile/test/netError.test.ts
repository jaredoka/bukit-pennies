import { describe, expect, it } from 'vitest';
import { describeRequestError, isNetworkFailure, NETWORK_ERROR_MESSAGE } from '../src/lib/netError';

describe('isNetworkFailure', () => {
  it('recognises the transport failures each platform produces', () => {
    expect(isNetworkFailure('TypeError: Failed to fetch')).toBe(true);
    expect(isNetworkFailure('Network request failed')).toBe(true);
    expect(isNetworkFailure('TypeError: NetworkError when attempting to fetch resource.')).toBe(true);
    expect(isNetworkFailure('Load failed')).toBe(true);
    expect(isNetworkFailure('net::ERR_CONNECTION_REFUSED')).toBe(true);
  });

  it('does not claim server replies are network problems', () => {
    expect(isNetworkFailure('permission denied for table subscriptions')).toBe(false);
    expect(isNetworkFailure('new row violates row-level security policy')).toBe(false);
    expect(
      isNetworkFailure('new row for relation "subscriptions" violates check constraint "subscriptions_amount_check"'),
    ).toBe(false);
  });
});

describe('describeRequestError', () => {
  it('replaces transport noise with something actionable', () => {
    expect(describeRequestError('TypeError: Failed to fetch')).toBe(NETWORK_ERROR_MESSAGE);
  });

  it('passes a real server error through untouched', () => {
    // These are the diagnostic ones — a constraint name or an RLS refusal is
    // exactly what we want to see on screen and in a bug report.
    const rls = 'new row violates row-level security policy for table "subscriptions"';
    expect(describeRequestError(rls)).toBe(rls);
  });
});
