import { describe, expect, it, vi } from 'vitest';
import { createFreshInstallGate } from '../src/lib/installMarker';

/**
 * Detecting a fresh install *creates* the marker, so the underlying check
 * answers `true` exactly once per install and `false` forever after. Two
 * callers hitting it directly is therefore first-caller-wins, and the loser
 * learns nothing — it just sees an ordinary update. The gate exists to make
 * that impossible; these cases are the guard on it.
 */
describe('createFreshInstallGate', () => {
  it('gives every caller the same answer on a fresh install', async () => {
    const detect = vi.fn(async () => true);
    const gate = createFreshInstallGate(detect);

    expect(await gate()).toBe(true);
    expect(await gate()).toBe(true);
    expect(await gate()).toBe(true);
  });

  it('runs the one-shot detection exactly once', async () => {
    const detect = vi.fn(async () => true);
    const gate = createFreshInstallGate(detect);

    await gate();
    await gate();

    expect(detect).toHaveBeenCalledTimes(1);
  });

  it('does not race when callers overlap', async () => {
    // The real callers are a storage read during createClient and an effect in
    // ThemeProvider; neither waits for the other, so they can be in flight at
    // the same time. Caching the promise rather than the resolved value is what
    // makes that safe.
    let resolve!: (v: boolean) => void;
    const detect = vi.fn(() => new Promise<boolean>((r) => (resolve = r)));
    const gate = createFreshInstallGate(detect);

    const both = Promise.all([gate(), gate()]);
    resolve(true);

    expect(await both).toEqual([true, true]);
    expect(detect).toHaveBeenCalledTimes(1);
  });

  it('reports an update as an update', async () => {
    const detect = vi.fn(async () => false);
    const gate = createFreshInstallGate(detect);

    expect(await gate()).toBe(false);
    expect(await gate()).toBe(false);
    expect(detect).toHaveBeenCalledTimes(1);
  });

  it('keeps separate gates independent', async () => {
    // Guards against the memo being hoisted to module scope in a later edit.
    const gateA = createFreshInstallGate(async () => true);
    const gateB = createFreshInstallGate(async () => false);

    expect(await gateA()).toBe(true);
    expect(await gateB()).toBe(false);
  });
});
