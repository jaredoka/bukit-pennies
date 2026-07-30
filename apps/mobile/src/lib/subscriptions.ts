// Pure subscription logic: cycle maths, due dates, and the merge between what
// the user declared (the `subscriptions` table) and what the app detected on
// its own (`detectRecurring`). Kept free of React and Supabase so it can be
// unit-tested — `test/subscriptions.test.ts` is the contract.
//
// Nothing here feeds budgets. The real charge lands as a transaction and is
// already counted against the monthly limit; the declared amount exists to be
// looked at, and to prove the charge was captured.

import { bruneiMonthKey } from './format';
import type { RecurringSpend } from './recurring';
import type { SubscriptionCycle, SubscriptionRow, SubscriptionStatus } from './types';

/** Mean days per month over a 4-year cycle — used only for custom cycles. */
const DAYS_PER_MONTH = 365.25 / 12;

export const CYCLE_OPTIONS: SubscriptionCycle[] = [
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
  'custom',
];

export function cycleLabel(cycle: SubscriptionCycle, cycleDays: number | null): string {
  switch (cycle) {
    case 'weekly':
      return 'Weekly';
    case 'monthly':
      return 'Monthly';
    case 'quarterly':
      return 'Every 3 months';
    case 'yearly':
      return 'Yearly';
    case 'custom':
      return cycleDays ? `Every ${cycleDays} days` : 'Custom';
  }
}

/** What one billing period costs per month, for a comparable total. */
export function monthlyEquivalent(
  amount: number,
  cycle: SubscriptionCycle,
  cycleDays: number | null,
): number {
  switch (cycle) {
    case 'weekly':
      return (amount * 52) / 12;
    case 'monthly':
      return amount;
    case 'quarterly':
      return amount / 3;
    case 'yearly':
      return amount / 12;
    case 'custom':
      return cycleDays && cycleDays > 0 ? (amount * DAYS_PER_MONTH) / cycleDays : amount;
  }
}

// ─── Date arithmetic on 'YYYY-MM-DD' keys ─────────────────────────────────────
// Date-only values, so there is no timezone to get wrong: parse the parts,
// compute in UTC, format back. Brunei never shifts anyway (+08:00, no DST).

interface Ymd {
  y: number;
  m: number; // 1–12
  d: number;
}

export function parseDayKey(dayKey: string): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, m: mo, d };
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function toDayKey({ y, m, d }: Ymd): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function addDays(parts: Ymd, days: number): Ymd {
  const t = Date.UTC(parts.y, parts.m - 1, parts.d) + days * 86_400_000;
  const d = new Date(t);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

/** Adds whole months, clamping the day to the target month's length so
 *  31 Jan + 1 month is 28 Feb rather than spilling into March. */
function addMonths(parts: Ymd, months: number): Ymd {
  const zero = parts.m - 1 + months;
  const y = parts.y + Math.floor(zero / 12);
  const m = ((zero % 12) + 12) % 12 + 1;
  return { y, m, d: Math.min(parts.d, daysInMonth(y, m)) };
}

/** The billing date one cycle after `dayKey`. */
export function advanceDayKey(
  dayKey: string,
  cycle: SubscriptionCycle,
  cycleDays: number | null,
): string {
  const parts = parseDayKey(dayKey);
  if (!parts) return dayKey;
  switch (cycle) {
    case 'weekly':
      return toDayKey(addDays(parts, 7));
    case 'monthly':
      return toDayKey(addMonths(parts, 1));
    case 'quarterly':
      return toDayKey(addMonths(parts, 3));
    case 'yearly':
      return toDayKey(addMonths(parts, 12));
    case 'custom':
      return cycleDays && cycleDays > 0 ? toDayKey(addDays(parts, cycleDays)) : dayKey;
  }
}

/** Whole days from `fromKey` to `toKey`; negative when `toKey` is in the past. */
export function daysBetween(fromKey: string, toKey: string): number | null {
  const a = parseDayKey(fromKey);
  const b = parseDayKey(toKey);
  if (!a || !b) return null;
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

/**
 * The next billing date at or after `todayKey`, rolling a stale stored date
 * forward by whole cycles. A subscription entered in January still shows a
 * useful date in July without the user re-editing it.
 *
 * Returns the stored date unchanged when it is already in the future, and null
 * when there is nothing to roll (no date, or a custom cycle with no length —
 * the roll would not terminate).
 */
export function nextDueOn(
  sub: Pick<SubscriptionRow, 'next_due_on' | 'cycle' | 'cycle_days'>,
  todayKey: string,
): string | null {
  if (!sub.next_due_on) return null;
  let due = sub.next_due_on;
  if (!parseDayKey(due)) return null;
  if (sub.cycle === 'custom' && !(sub.cycle_days && sub.cycle_days > 0)) return due;
  // Bounded: even a weekly cycle covers 4 years in ~208 steps.
  for (let i = 0; i < 600; i += 1) {
    const gap = daysBetween(todayKey, due);
    if (gap === null || gap >= 0) return due;
    const advanced = advanceDayKey(due, sub.cycle, sub.cycle_days);
    if (advanced === due) return due;
    due = advanced;
  }
  return due;
}

/** 'Today', 'Tomorrow', 'in 12 days', '3 days ago'. */
export function dueLabel(days: number | null): string {
  if (days === null) return 'No date set';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

// ─── Matching declared subscriptions to captured transactions ─────────────────

/** Uppercased, punctuation-free form for loose merchant comparison. */
function loose(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

/**
 * Whether a captured merchant belongs to this subscription.
 *
 * `merchant_normalized` is the reliable link and wins when set. Otherwise the
 * name is matched loosely against the merchant string, because a bank writes
 * "NETFLIX.COM SINGAPORE SG" for what the user typed as "Netflix". Names under
 * three characters are refused — "AI" would match half the merchant list.
 */
export function matchesMerchant(
  sub: Pick<SubscriptionRow, 'name' | 'merchant_normalized'>,
  merchantNormalized: string | null,
): boolean {
  if (!merchantNormalized) return false;
  const merchant = loose(merchantNormalized);
  if (sub.merchant_normalized) return loose(sub.merchant_normalized) === merchant;
  const name = loose(sub.name);
  if (name.length < 3) return false;
  return merchant === name || merchant.includes(name);
}

export interface ChargeCandidate {
  occurred_at: string | null;
  amount: number | null;
  currency: string;
  merchant_normalized: string | null;
}

export interface SubscriptionCharge {
  occurredAt: string;
  amount: number;
  currency: string;
}

/** The most recent captured charge for a subscription, if any. */
export function lastCharge(
  sub: Pick<SubscriptionRow, 'name' | 'merchant_normalized'>,
  txs: ChargeCandidate[],
): SubscriptionCharge | null {
  let best: SubscriptionCharge | null = null;
  for (const tx of txs) {
    if (!tx.occurred_at || tx.amount === null) continue;
    if (!matchesMerchant(sub, tx.merchant_normalized)) continue;
    if (best && tx.occurred_at <= best.occurredAt) continue;
    best = { occurredAt: tx.occurred_at, amount: Number(tx.amount), currency: tx.currency };
  }
  return best;
}

/** The charge captured in the given Brunei month ('YYYY-MM-01'), if any. */
export function chargeInMonth(
  sub: Pick<SubscriptionRow, 'name' | 'merchant_normalized'>,
  txs: ChargeCandidate[],
  monthKey: string,
): SubscriptionCharge | null {
  const inMonth = txs.filter((t) => t.occurred_at && bruneiMonthKey(t.occurred_at) === monthKey);
  return lastCharge(sub, inMonth);
}

// ─── The merged list ──────────────────────────────────────────────────────────

export interface SubscriptionListItem {
  key: string;
  /** 'declared' = a row the user saved. 'suggestion' = detected, unconfirmed. */
  kind: 'declared' | 'suggestion';
  name: string;
  amount: number;
  currency: string;
  cycle: SubscriptionCycle;
  cycleDays: number | null;
  /** `amount` expressed per month, so unlike cycles can be totalled. */
  monthly: number;
  status: SubscriptionStatus;
  subscription: SubscriptionRow | null;
  detected: RecurringSpend | null;
  nextDueOn: string | null;
  daysUntilDue: number | null;
  /** Days until a free trial converts; negative once it has passed. */
  trialDaysLeft: number | null;
}

function declaredItem(sub: SubscriptionRow, detected: RecurringSpend | null, todayKey: string): SubscriptionListItem {
  const amount = Number(sub.amount);
  const due = nextDueOn(sub, todayKey);
  return {
    key: sub.id,
    kind: 'declared',
    name: sub.name,
    amount,
    currency: sub.currency,
    cycle: sub.cycle,
    cycleDays: sub.cycle_days,
    monthly: monthlyEquivalent(amount, sub.cycle, sub.cycle_days),
    status: sub.status,
    subscription: sub,
    detected,
    nextDueOn: due,
    daysUntilDue: due ? daysBetween(todayKey, due) : null,
    trialDaysLeft: sub.trial_ends_on ? daysBetween(todayKey, sub.trial_ends_on) : null,
  };
}

function suggestionItem(rec: RecurringSpend): SubscriptionListItem {
  return {
    key: `detected:${rec.merchant}:${rec.amount}`,
    kind: 'suggestion',
    name: rec.merchant,
    amount: rec.amount,
    currency: rec.currency,
    cycle: 'monthly',
    cycleDays: null,
    monthly: rec.amount,
    status: 'active',
    subscription: null,
    detected: rec,
    nextDueOn: null,
    daysUntilDue: null,
    trialDaysLeft: null,
  };
}

/**
 * One list from both halves: every declared subscription, each carrying the
 * detected cluster it matches, followed by the detected clusters nobody has
 * claimed yet as suggestions to confirm. A cancelled subscription still claims
 * its cluster — it stops the thing the user just cancelled reappearing as a
 * suggestion the moment it is dismissed.
 *
 * Ordering: active declared first, soonest due date leading and undated last;
 * then suggestions by size; then cancelled.
 */
export function mergeSubscriptions(
  subs: SubscriptionRow[],
  detected: RecurringSpend[],
  todayKey: string,
): SubscriptionListItem[] {
  const claimed = new Set<RecurringSpend>();
  const declared = subs.map((sub) => {
    const match = detected.find((rec) => !claimed.has(rec) && matchesMerchant(sub, rec.merchant));
    if (match) claimed.add(match);
    return declaredItem(sub, match ?? null, todayKey);
  });

  const suggestions = detected.filter((rec) => !claimed.has(rec)).map(suggestionItem);

  const rank = (item: SubscriptionListItem) =>
    item.status === 'cancelled' ? 2 : item.kind === 'suggestion' ? 1 : 0;

  return [...declared, ...suggestions].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    if (rank(a) === 0) {
      // Undated rows sort after dated ones rather than pretending to be due now.
      const ad = a.daysUntilDue ?? Number.POSITIVE_INFINITY;
      const bd = b.daysUntilDue ?? Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
    }
    return b.monthly - a.monthly;
  });
}

/** Monthly cost of the active declared subscriptions in one currency. */
export function monthlyTotal(items: SubscriptionListItem[], currency: string): number {
  return items
    .filter((i) => i.kind === 'declared' && i.status === 'active' && i.currency === currency)
    .reduce((sum, i) => sum + i.monthly, 0);
}
