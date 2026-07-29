import { Platform } from 'react-native';
import { kvGetJson, kvSetJson } from './kvStore';
import { bruneiMonthKey, bruneiParts, formatMoney } from './format';
import type { RecurringSpend } from './recurring';

// Local (on-device) notifications only — no push infrastructure. All
// schedules are recomputed on every dashboard mount, so content stays fresh
// without background tasks. No-ops on web.

const BRUNEI_OFFSET_MS = 8 * 60 * 60 * 1000;

// Scoped per user. These are derived from account data, not device taste:
// reminder prefs are keyed by *merchant name* and the alert markers by budget
// id, so a device-global key handed the next account to sign in a list of the
// previous account's merchants — visible in Settings > Notifications, and
// scheduling bill reminders for spending that was never theirs. Theme,
// currency and the privacy cloak stay device-global on purpose; those are
// preferences about this handset, not facts about an account.
const remindersKey = (userId: string) => `bukit.reminders.${userId}`;
const digestKey = (userId: string) => `bukit.digest.${userId}`;
const alertedKey = (userId: string) => `bukit.alerted.${userId}`;

export interface DigestPrefs {
  on: boolean;
  /** 0 = Sunday … 6 = Saturday. Default: 1 (Monday). */
  dayOfWeek: number;
  /** 0–23 Brunei time. Default: 9. */
  hour: number;
}

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

export async function getReminderPrefs(userId: string): Promise<ReminderPrefs> {
  return kvGetJson<ReminderPrefs>(remindersKey(userId), {});
}

export async function setReminderPref(
  userId: string,
  merchant: string,
  daysBefore: ReminderDays | null,
): Promise<ReminderPrefs> {
  const prefs = await getReminderPrefs(userId);
  if (daysBefore === null) delete prefs[merchant];
  else prefs[merchant] = { daysBefore };
  await kvSetJson(remindersKey(userId), prefs);
  return prefs;
}

const DIGEST_DEFAULTS: DigestPrefs = { on: false, dayOfWeek: 1, hour: 9 };

export async function getDigestPrefs(userId: string): Promise<DigestPrefs> {
  const stored = await kvGetJson<Partial<DigestPrefs>>(digestKey(userId), {});
  return { ...DIGEST_DEFAULTS, ...stored };
}

export async function setDigestPrefs(
  userId: string,
  prefs: Partial<DigestPrefs>,
): Promise<DigestPrefs> {
  const current = await getDigestPrefs(userId);
  const next = { ...current, ...prefs };
  await kvSetJson(digestKey(userId), next);
  return next;
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

/** Next occurrence of `dayOfWeek` (0=Sun) at `hour`:00 Brunei time, always
 *  at least one day from now so we don't fire immediately on every app open. */
function nextWeeklyTrigger(dayOfWeek: number, hour: number): Date {
  const now = new Date(Date.now() + BRUNEI_OFFSET_MS);
  const daysUntil = ((dayOfWeek - now.getUTCDay() + 7) % 7) || 7;
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntil, hour, 0, 0) -
      BRUNEI_OFFSET_MS,
  );
}

/** Re-sync every scheduled local notification from current data. Called on
 *  dashboard mount. Cancels and re-schedules under stable identifiers. */
export async function syncScheduledNotifications(opts: {
  userId: string;
  recurring: RecurringSpend[];
  spentThisMonth: number;
  income: number | null;
}): Promise<void> {
  const N = notifications();
  if (!N) return;
  const prefs = await getReminderPrefs(opts.userId);
  const digest = await getDigestPrefs(opts.userId);
  if (Object.keys(prefs).length === 0 && !digest.on) {
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
        body: `${r.merchant}: about ${formatMoney(r.amount, r.currency)} expected around day ${expectedDay}.`,
      },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: fireAt },
    });
  }

  // Weekly digest: next chosen day/time in Brunei time, body computed from
  // current data (refreshed on every app open, so it stays roughly current).
  if (digest.on) {
    const fire = nextWeeklyTrigger(digest.dayOfWeek, digest.hour);
    const pct =
      opts.income && opts.income > 0 ? Math.round((opts.spentThisMonth / opts.income) * 100) : null;
    await N.scheduleNotificationAsync({
      content: {
        title: 'Bukit Pennies weekly update',
        body:
          pct !== null
            ? `You've spent ${formatMoney(opts.spentThisMonth)} this month, ${pct}% of your income used so far.`
            : `You've spent ${formatMoney(opts.spentThisMonth)} this month. Set your income in Settings to track the percentage used.`,
      },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: fire },
    });
  }
}

/** Fire an immediate overspend alert once per budget per threshold per month. */
export async function maybeOverspendAlert(
  userId: string,
  budgets: Array<{ id: string; name: string; spent: number; limit: number }>,
): Promise<void> {
  const N = notifications();
  if (!N) return;
  const monthKey = bruneiMonthKey(Date.now());
  const alerted = await kvGetJson<Record<string, number>>(alertedKey(userId), {});
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
              ? `${b.name}: ${formatMoney(b.spent)} spent of ${formatMoney(b.limit)}. Over budget.`
              : `${b.name}: ${Math.round(ratio * 100)}% of the ${formatMoney(b.limit)} budget used.`,
        },
        trigger: null,
      });
      alerted[key] = level;
      changed = true;
    }
  }
  if (changed) await kvSetJson(alertedKey(userId), alerted);
}
