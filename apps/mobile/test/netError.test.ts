import { describe, expect, it, vi } from 'vitest';
import {
  describeRequestError,
  isNetworkFailure,
  NETWORK_ERROR_MESSAGE,
  withNetworkRetry,
} from '../src/lib/netError';

/** The message iOS produced when signing in reused a dead pooled connection. */
const CONNECTION_LOST =
  'fetch failed: UnexpectedException: The network connection was lost. (at ExpoModulesCore/Promise.swift:56)';

describe('isNetworkFailure', () => {
  it('recognises the transport failures each platform produces', () => {
    expect(isNetworkFailure('TypeError: Failed to fetch')).toBe(true);
    expect(isNetworkFailure('Network request failed')).toBe(true);
    expect(isNetworkFailure('TypeError: NetworkError when attempting to fetch resource.')).toBe(true);
    expect(isNetworkFailure('Load failed')).toBe(true);
    expect(isNetworkFailure('net::ERR_CONNECTION_REFUSED')).toBe(true);
    expect(isNetworkFailure(CONNECTION_LOST)).toBe(true);
    // The same iOS error without the Expo wrapper around it.
    expect(isNetworkFailure('The network connection was lost.')).toBe(true);
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

describe('withNetworkRetry', () => {
  const ok = { error: null };

  it('does not call twice when the first attempt succeeds', async () => {
    const call = vi.fn().mockResolvedValue(ok);
    await expect(withNetworkRetry(call)).resolves.toBe(ok);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('retries the dead-connection failure and returns the second result', async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: CONNECTION_LOST } })
      .mockResolvedValueOnce(ok);
    await expect(withNetworkRetry(call)).resolves.toBe(ok);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('does not retry a real server reply', async () => {
    // The whole point: a wrong password must not be tried a second time, both
    // because it will not start working and because it burns a rate limit.
    const refused = { error: { message: 'Invalid login credentials' } };
    const call = vi.fn().mockResolvedValue(refused);
    await expect(withNetworkRetry(call)).resolves.toBe(refused);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('gives up after one retry rather than looping while offline', async () => {
    const down = { error: { message: 'Network request failed' } };
    const call = vi.fn().mockResolvedValue(down);
    await expect(withNetworkRetry(call)).resolves.toBe(down);
    expect(call).toHaveBeenCalledTimes(2);
  });
});
