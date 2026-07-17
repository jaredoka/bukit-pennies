import { Platform } from 'react-native';
import { kvGetJson, kvSetJson } from './kvStore';
import { bruneiMonthKey, bruneiParts, formatMoney } from './format';
import type { RecurringSpend } from './recurring';

// Local (on-device) notifications only — no push infrastructure. All
// schedules are recomputed on every dashboard mount, so content stays fresh
// without background tasks. No-ops on web.

const BRUNEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const REMINDERS_KEY = 'bukit.reminders';
const DIGEST_KEY = 'bukit.digest';
const ALERTED_KEY = 'bukit.alerted';

export type ReminderDays = 0 | 1 | 3;
export interface ReminderPrefs {
  [merchant: string]: { daysBefore: ReminderDays };
}

function notifications() {
  if (Platform.OS === 'web') return null;
  return require('expo-notifications') as typeof import('expo-notifications');
}

export async function ensureNotificationPermission(): Promise<boolean> {
  const N = notifications();
  if (!N) return false;
  const current = await N.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await N.requestPermissionsAsync();
  return asked.granted;
}

export async function getReminderPrefs(): Promise<ReminderPrefs> {
  return kvGetJson<ReminderPrefs>(REMINDERS_KEY, {});
}

export async function setReminderPref(merchant: string, daysBefore: ReminderDays | null): Promise<ReminderPrefs> {
  const prefs = await getReminderPrefs();
  if (daysBefore === null) delete prefs[merchant];
  else prefs[merchant] = { daysBefore };
  await kvSetJson(REMINDERS_KEY, prefs);
  return prefs;
}

export async function getDigestEnabled(): Promise<boolean> {
  return (await kvGetJson<{ on: boolean }>(DIGEST_KEY, { on: false })).on;
}

export async function setDigestEnabled(on: boolean): Promise<void> {
  await kvSetJson(DIGEST_KEY, { on });
}

/** Next occurrence of `day` (Brunei day-of-month) at 09:00 Brunei, minus
 *  `daysBefore` days; skips into the following month if already past. */
function nextBillTrigger(day: number, daysBefore: number): Date {
  const now = bruneiParts(Date.now());
  for (let addMonth = 0; addMonth <= 2; addMonth++) {
    const m = now.month - 1 + addMonth;
    const dueUtcMs = Date.UTC(now.year, m, Math.min(day, 28), 9, 0, 0) - BRUNEI_OFFSET_MS;
    const fireMs = dueUtcMs - daysBefore * 24 * 60 * 60 * 1000;
    if (fireMs > Date.now() + 60_000) return new Date(fireMs);
  }
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

/** Re-sync every scheduled local notification from current data. Called on
 *  dashboard mount. Cancels and re-schedules under stable identifiers. */
export async function syncScheduledNotifications(opts: {
  recurring: RecurringSpend[];
  spentThisMonth: number;
  income: number | null;
}): Promise<void> {
  const N = notifications();
  if (!N) return;
  const prefs = await getReminderPrefs();
  const digestOn = await getDigestEnabled();
  if (Object.keys(prefs).length === 0 && !digestOn) {
    await N.cancelAllScheduledNotificationsAsync();
    return;
  }
  if (!(await ensureNotificationPermission())) return;

  await N.cancelAllScheduledNotificationsAsync();

  // Bill reminders: one-shot at the next expected date; refreshed on every
  // app open, so the chain continues month after month.
  for (const r of opts.recurring) {
    const pref = prefs[r.merchant];
    if (!pref) continue;
    const expectedDay = bruneiParts(r.lastSeen).day;
    const fireAt = nextBillTrigger(expectedDay, pref.daysBefore);
    await N.scheduleNotificationAsync({
      content: {
        title: 'Upcoming bill',
        body: `${r.merchant} — about ${formatMoney(r.amount, r.currency)} expected around day ${expectedDay}.`,
      },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: fireAt },
    });
  }

  // Weekly digest: next Monday 09:00 Brunei, body computed from current data
  // (refreshed on every app open, so it stays roughly current).
  if (digestOn) {
    const now = new Date(Date.now() + BRUNEI_OFFSET_MS);
    const daysToMonday = ((8 - now.getUTCDay()) % 7) || 7;
    const fire = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysToMonday, 9, 0, 0) -
        BRUNEI_OFFSET_MS,
    );
    const pct =
      opts.income && opts.income > 0 ? Math.round((opts.spentThisMonth / opts.income) * 100) : null;
    await N.scheduleNotificationAsync({
      content: {
        title: 'Bukit Pennies — weekly summary',
        body:
          pct !== null
            ? `You've spent ${formatMoney(opts.spentThisMonth)} this month — ${pct}% of your income.`
            : `You've spent ${formatMoney(opts.spentThisMonth)} this month. Set your income in Settings to see the percentage.`,
      },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: fire },
    });
  }
}

/** Fire an immediate overspend alert once per budget per threshold per month. */
export async function maybeOverspendAlert(budgets: Array<{ id: string; name: string; spent: number; limit: number }>): Promise<void> {
  const N = notifications();
  if (!N) return;
  const monthKey = bruneiMonthKey(Date.now());
  const alerted = await kvGetJson<Record<string, number>>(ALERTED_KEY, {});
  let changed = false;
  for (const b of budgets) {
    if (b.limit <= 0) continue;
    const ratio = b.spent / b.limit;
    const level = ratio >= 1 ? 2 : ratio >= 0.85 ? 1 : 0;
    const key = `${b.id}:${monthKey}`;
    if (level > (alerted[key] ?? 0)) {
      if (!(await ensureNotificationPermission())) return;
      await N.scheduleNotificationAsync({
        content: {
          title: level === 2 ? 'Budget exceeded' : 'Budget almost used up',
          body:
            level === 2
              ? `${b.name}: ${formatMoney(b.spent)} spent of ${formatMoney(b.limit)} — over budget.`
              : `${b.name}: ${Math.round(ratio * 100)}% of the ${formatMoney(b.limit)} budget used.`,
        },
        trigger: null,
      });
      alerted[key] = level;
      changed = true;
    }
  }
  if (changed) await kvSetJson(ALERTED_KEY, alerted);
}
