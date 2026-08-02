import { Platform } from 'react-native';
import { kvGetJson, kvSetJson } from './kvStore';
import { bruneiMonthKey, formatMoney } from './format';

// Local (on-device) notifications only — no push infrastructure. All
// schedules are recomputed on every dashboard mount, so content stays fresh
// without background tasks. No-ops on web.

const BRUNEI_OFFSET_MS = 8 * 60 * 60 * 1000;

// Scoped per user. These are derived from account data, not device taste: the
// alert markers are keyed by budget id, so a device-global key would hand the
// next account to sign in the previous account's fired-alert state. Theme,
// currency and the privacy cloak stay device-global on purpose; those are
// preferences about this handset, not facts about an account.
const digestKey = (userId: string) => `bukit.digest.${userId}`;
const alertedKey = (userId: string) => `bukit.alerted.${userId}`;

export interface DigestPrefs {
  on: boolean;
  /** 0 = Sunday … 6 = Saturday. Default: 1 (Monday). */
  dayOfWeek: number;
  /** 0–23 Brunei time. Default: 9. */
  hour: number;
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
  spentThisMonth: number;
  income: number | null;
}): Promise<void> {
  const N = notifications();
  if (!N) return;
  const digest = await getDigestPrefs(opts.userId);
  if (!digest.on) {
    // Also how per-merchant bill reminders get cleaned up: they were scheduled
    // by an earlier version and nothing reschedules them now, so the first
    // dashboard mount after this update cancels them for good.
    await N.cancelAllScheduledNotificationsAsync();
    return;
  }
  if (!(await ensureNotificationPermission())) return;

  await N.cancelAllScheduledNotificationsAsync();

  // Weekly digest: next chosen day/time in Brunei time, body computed from
  // current data (refreshed on every app open, so it stays roughly current).
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
