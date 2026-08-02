// All display dates use Brunei time (+08:00, no DST). Shifting the epoch by
// 8h and reading UTC getters avoids depending on the device timezone or full
// Intl timezone data on Hermes.
const BRUNEI_OFFSET_MS = 8 * 60 * 60 * 1000;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function bruneiParts(iso: string | number | Date) {
  const d = new Date(new Date(iso).getTime() + BRUNEI_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

/** 'YYYY-MM-DD' key in Brunei time — sectioning + chart bucketing. */
export function bruneiDayKey(iso: string | number | Date): string {
  const p = bruneiParts(iso);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** 'YYYY-MM-01' matching the monthly_totals view's month bucket. */
export function bruneiMonthKey(iso: string | number | Date): string {
  const p = bruneiParts(iso);
  return `${p.year}-${String(p.month).padStart(2, '0')}-01`;
}

/** First instant of a Brunei month as UTC ISO, offset by `monthsAgo`. */
export function bruneiMonthStartIso(monthsAgo = 0): string {
  const now = bruneiParts(Date.now());
  const m = now.month - 1 - monthsAgo;
  const year = now.year + Math.floor(m / 12);
  const month = ((m % 12) + 12) % 12;
  return new Date(Date.UTC(year, month, 1) - BRUNEI_OFFSET_MS).toISOString();
}

function numberBody(amount: number | null): string | null {
  if (amount === null || Number.isNaN(amount)) return null;
  const abs = Math.abs(amount);
  const [intPart, decPart] = abs.toFixed(2).split('.');
  const intWithCommas = intPart!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${amount < 0 ? '-' : ''}${intWithCommas}.${decPart}`;
}

export function formatMoney(amount: number | null, currency = 'BND'): string {
  const body = numberBody(amount);
  if (body === null) return '—';
  // The sign precedes the currency ("-BND 500.00"), as it always has.
  return `${body.startsWith('-') ? '-' : ''}${currency} ${body.replace(/^-/, '')}`;
}

/**
 * "BND 100.00 / 500.00" — the currency is stated once, on the left, so a
 * two-value ratio (saved/target, spent/limit) doesn't repeat it.
 */
export function formatMoneyPair(
  first: number | null,
  second: number | null,
  currency = 'BND',
): string {
  if (first === null || Number.isNaN(first)) return '—';
  return `${formatMoney(first, currency)} / ${numberBody(second) ?? '—'}`;
}

export function formatDayHeading(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const today = bruneiDayKey(Date.now());
  const yesterday = bruneiDayKey(Date.now() - 24 * 60 * 60 * 1000);
  if (dayKey === today) return 'Today';
  if (dayKey === yesterday) return 'Yesterday';
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** '12 Aug 2026' from either a timestamp or a 'YYYY-MM-DD' key. Unlike
 *  `formatDayHeading` it never says "Today" — used where the actual date is
 *  the point (a subscription's billing date). */
export function formatDayDate(value: string): string {
  const key = /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : bruneiDayKey(value);
  const [y, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS[m! - 1]} ${y}`;
}

export function formatTime(iso: string | null): string {
  if (!iso) return '';
  const p = bruneiParts(iso);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

export function formatMonthName(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
