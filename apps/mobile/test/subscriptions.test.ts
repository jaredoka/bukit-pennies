import { describe, expect, it } from 'vitest';
import type { RecurringSpend } from '../src/lib/recurring';
import {
  advanceDayKey,
  chargeInMonth,
  daysBetween,
  dueLabel,
  lastCharge,
  matchesMerchant,
  mergeSubscriptions,
  monthlyEquivalent,
  monthlyTotal,
  nextDueOn,
  parseDayKey,
} from '../src/lib/subscriptions';
import type { SubscriptionRow } from '../src/lib/types';

const sub = (patch: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  id: patch.id ?? 'sub-1',
  user_id: 'user-1',
  name: 'Netflix',
  amount: 18.9,
  currency: 'BND',
  cycle: 'monthly',
  cycle_days: null,
  next_due_on: null,
  category_id: null,
  card_last4: null,
  merchant_normalized: null,
  trial_ends_on: null,
  started_on: null,
  notes: null,
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...patch,
});

const detected = (patch: Partial<RecurringSpend> = {}): RecurringSpend => ({
  merchant: 'NETFLIX.COM SINGAPORE SG',
  amount: 18.9,
  total: 56.7,
  currency: 'BND',
  months: ['2026-05-01', '2026-06-01', '2026-07-01'],
  lastSeen: '2026-07-12T09:00:00+08:00',
  ...patch,
});

describe('monthlyEquivalent', () => {
  it('normalises every cycle to a per-month figure', () => {
    expect(monthlyEquivalent(12, 'monthly', null)).toBe(12);
    expect(monthlyEquivalent(120, 'yearly', null)).toBe(10);
    expect(monthlyEquivalent(30, 'quarterly', null)).toBe(10);
    expect(monthlyEquivalent(10, 'weekly', null)).toBeCloseTo(43.333, 3);
  });

  it('uses the custom length, and falls back to the raw amount without one', () => {
    // Every 45 days ≈ 0.676 of a month, so a 45-day BND 30 plan costs more
    // per month than a monthly one.
    expect(monthlyEquivalent(30, 'custom', 45)).toBeCloseTo(20.29, 2);
    expect(monthlyEquivalent(30, 'custom', null)).toBe(30);
    expect(monthlyEquivalent(30, 'custom', 0)).toBe(30);
  });
});

describe('parseDayKey', () => {
  it('rejects malformed and impossible dates', () => {
    expect(parseDayKey('2026-07-30')).toEqual({ y: 2026, m: 7, d: 30 });
    expect(parseDayKey('2026-2-01')).toBeNull();
    expect(parseDayKey('2026-13-01')).toBeNull();
    expect(parseDayKey('2026-02-30')).toBeNull();
    expect(parseDayKey('not a date')).toBeNull();
  });

  it('accepts a leap day only in a leap year', () => {
    expect(parseDayKey('2028-02-29')).toEqual({ y: 2028, m: 2, d: 29 });
    expect(parseDayKey('2026-02-29')).toBeNull();
  });
});

describe('advanceDayKey', () => {
  it('clamps to the end of a shorter month instead of spilling over', () => {
    // 31 Jan + 1 month is 28 Feb, not 3 March.
    expect(advanceDayKey('2026-01-31', 'monthly', null)).toBe('2026-02-28');
    expect(advanceDayKey('2028-01-31', 'monthly', null)).toBe('2028-02-29');
  });

  it('handles the other cycles', () => {
    expect(advanceDayKey('2026-07-30', 'weekly', null)).toBe('2026-08-06');
    expect(advanceDayKey('2026-11-30', 'quarterly', null)).toBe('2027-02-28');
    expect(advanceDayKey('2026-07-30', 'yearly', null)).toBe('2027-07-30');
    expect(advanceDayKey('2026-07-30', 'custom', 45)).toBe('2026-09-13');
  });

  it('leaves the date alone when it cannot advance', () => {
    expect(advanceDayKey('2026-07-30', 'custom', null)).toBe('2026-07-30');
    expect(advanceDayKey('rubbish', 'monthly', null)).toBe('rubbish');
  });
});

describe('daysBetween', () => {
  it('counts forwards and backwards across a month boundary', () => {
    expect(daysBetween('2026-07-30', '2026-08-02')).toBe(3);
    expect(daysBetween('2026-08-02', '2026-07-30')).toBe(-3);
    expect(daysBetween('2026-07-30', '2026-07-30')).toBe(0);
    expect(daysBetween('2026-07-30', 'nope')).toBeNull();
  });
});

describe('nextDueOn', () => {
  it('rolls a stale date forward by whole cycles', () => {
    // Entered in January, opened in July: the date shown must be the next real
    // charge, not the one six months gone.
    expect(nextDueOn(sub({ next_due_on: '2026-01-12' }), '2026-07-30')).toBe('2026-08-12');
  });

  it('leaves a future date untouched, and today is not stale', () => {
    expect(nextDueOn(sub({ next_due_on: '2026-08-12' }), '2026-07-30')).toBe('2026-08-12');
    expect(nextDueOn(sub({ next_due_on: '2026-07-30' }), '2026-07-30')).toBe('2026-07-30');
  });

  it('rolls yearly and custom cycles too', () => {
    expect(nextDueOn(sub({ cycle: 'yearly', next_due_on: '2024-03-04' }), '2026-07-30')).toBe('2027-03-04');
    expect(nextDueOn(sub({ cycle: 'custom', cycle_days: 45, next_due_on: '2026-07-01' }), '2026-07-30')).toBe('2026-08-15');
  });

  it('returns null with no date, and does not loop on a lengthless custom cycle', () => {
    expect(nextDueOn(sub(), '2026-07-30')).toBeNull();
    expect(nextDueOn(sub({ next_due_on: 'garbage' }), '2026-07-30')).toBeNull();
    expect(nextDueOn(sub({ cycle: 'custom', cycle_days: null, next_due_on: '2026-01-01' }), '2026-07-30')).toBe('2026-01-01');
  });
});

describe('dueLabel', () => {
  it('reads naturally either side of today', () => {
    expect(dueLabel(0)).toBe('Today');
    expect(dueLabel(1)).toBe('Tomorrow');
    expect(dueLabel(12)).toBe('in 12 days');
    expect(dueLabel(-1)).toBe('Yesterday');
    expect(dueLabel(-3)).toBe('3 days ago');
    expect(dueLabel(null)).toBe('No date set');
  });
});

describe('matchesMerchant', () => {
  it('matches a bank merchant string against a short typed name', () => {
    expect(matchesMerchant(sub(), 'NETFLIX.COM SINGAPORE SG')).toBe(true);
    expect(matchesMerchant(sub(), 'SUPA SAVE BSB')).toBe(false);
    expect(matchesMerchant(sub(), null)).toBe(false);
  });

  it('prefers merchant_normalized exactly when it is set', () => {
    const linked = sub({ merchant_normalized: 'NETFLIX.COM SINGAPORE SG' });
    expect(matchesMerchant(linked, 'NETFLIX.COM SINGAPORE SG')).toBe(true);
    // The name would still match loosely; the explicit link must not.
    expect(matchesMerchant(linked, 'NETFLIX BILLING US')).toBe(false);
  });

  it('refuses names too short to be distinctive', () => {
    expect(matchesMerchant(sub({ name: 'AI' }), 'AIRTIME TOPUP')).toBe(false);
  });
});

describe('lastCharge / chargeInMonth', () => {
  const txs = [
    { occurred_at: '2026-06-12T09:00:00+08:00', amount: 18.9, currency: 'BND', merchant_normalized: 'NETFLIX.COM SINGAPORE SG' },
    { occurred_at: '2026-07-12T09:00:00+08:00', amount: 18.9, currency: 'BND', merchant_normalized: 'NETFLIX.COM SINGAPORE SG' },
    { occurred_at: '2026-07-20T09:00:00+08:00', amount: 6.5, currency: 'BND', merchant_normalized: 'SUPA SAVE BSB' },
    { occurred_at: null, amount: 18.9, currency: 'BND', merchant_normalized: 'NETFLIX.COM SINGAPORE SG' },
  ];

  it('returns the most recent matching charge', () => {
    expect(lastCharge(sub(), txs)?.occurredAt).toBe('2026-07-12T09:00:00+08:00');
    expect(lastCharge(sub({ name: 'Spotify' }), txs)).toBeNull();
  });

  it('scopes to one Brunei month', () => {
    expect(chargeInMonth(sub(), txs, '2026-06-01')?.amount).toBe(18.9);
    expect(chargeInMonth(sub(), txs, '2026-05-01')).toBeNull();
  });

  it('buckets a late-night charge into the Brunei month, not the UTC one', () => {
    // 23:30 on 31 July in Brunei is still 15:30 UTC the same day, but a naive
    // UTC read of 1 Aug 00:30 +08:00 would land in July.
    const lateNight = [
      { occurred_at: '2026-08-01T00:30:00+08:00', amount: 18.9, currency: 'BND', merchant_normalized: 'NETFLIX.COM SINGAPORE SG' },
    ];
    expect(chargeInMonth(sub(), lateNight, '2026-08-01')?.amount).toBe(18.9);
    expect(chargeInMonth(sub(), lateNight, '2026-07-01')).toBeNull();
  });
});

describe('mergeSubscriptions', () => {
  it('attaches a detected cluster to the subscription that claims it', () => {
    const items = mergeSubscriptions([sub()], [detected()], '2026-07-30');
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe('declared');
    expect(items[0]!.detected?.merchant).toBe('NETFLIX.COM SINGAPORE SG');
  });

  it('offers unclaimed detections as suggestions', () => {
    const items = mergeSubscriptions([], [detected()], '2026-07-30');
    expect(items.map((i) => i.kind)).toEqual(['suggestion']);
    expect(items[0]!.name).toBe('NETFLIX.COM SINGAPORE SG');
  });

  it('does not show the same spend twice', () => {
    const items = mergeSubscriptions(
      [sub(), sub({ id: 'sub-2', name: 'Spotify', amount: 9 })],
      [detected(), detected({ merchant: 'SPOTIFY AB', amount: 9 })],
      '2026-07-30',
    );
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.kind === 'declared')).toBe(true);
  });

  it('lets a cancelled subscription keep claiming its cluster', () => {
    // Otherwise cancelling Netflix immediately re-offers it as a suggestion.
    const items = mergeSubscriptions([sub({ status: 'cancelled' })], [detected()], '2026-07-30');
    expect(items).toHaveLength(1);
    expect(items[0]!.status).toBe('cancelled');
  });

  it('orders active by soonest due, then suggestions, then cancelled', () => {
    const items = mergeSubscriptions(
      [
        sub({ id: 'later', name: 'iCloud', amount: 2, next_due_on: '2026-08-20' }),
        sub({ id: 'undated', name: 'Adobe', amount: 30 }),
        sub({ id: 'soon', name: 'Spotify', amount: 9, next_due_on: '2026-08-02' }),
        sub({ id: 'gone', name: 'Disney', amount: 12, status: 'cancelled' }),
      ],
      [detected()],
      '2026-07-30',
    );
    expect(items.map((i) => i.name)).toEqual(['Spotify', 'iCloud', 'Adobe', 'NETFLIX.COM SINGAPORE SG', 'Disney']);
  });

  it('exposes the trial countdown', () => {
    const items = mergeSubscriptions([sub({ trial_ends_on: '2026-08-04' })], [], '2026-07-30');
    expect(items[0]!.trialDaysLeft).toBe(5);
  });
});

describe('monthlyTotal', () => {
  it('totals active declared rows in one currency only', () => {
    const items = mergeSubscriptions(
      [
        sub({ id: 'a', amount: 18.9 }),
        sub({ id: 'b', name: 'Adobe', amount: 120, cycle: 'yearly' }),
        sub({ id: 'c', name: 'Disney', amount: 12, status: 'cancelled' }),
        sub({ id: 'd', name: 'Figma', amount: 15, currency: 'USD' }),
      ],
      [detected()],
      '2026-07-30',
    );
    // 18.90 + (120 / 12); cancelled, USD, and the suggestion all stay out.
    expect(monthlyTotal(items, 'BND')).toBeCloseTo(28.9, 2);
    expect(monthlyTotal(items, 'USD')).toBeCloseTo(15, 2);
  });
});
