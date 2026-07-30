/**
 * Calendar-grid arithmetic for the date pickers. Pure and tested — the month
 * boundaries (leap years, a month starting on Sunday, December rolling over)
 * are the part that silently goes wrong.
 *
 * UTC getters throughout: a grid is a set of calendar labels, not instants, so
 * the device timezone must not shift it. Brunei-local "today" comes from
 * `bruneiDayKey` in format.ts, not from here.
 */

/** Rows of 7, always exactly 6 rows so a sheet's height never shifts between
 *  months. Leading and trailing blanks are null. `month` is 0-based. */
export function monthGrid(year: number, month: number): (number | null)[][] {
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length < 42) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

/** 'YYYY-MM-DD' from grid coordinates. `month` is 0-based. */
export function dayKeyOf(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Steps a viewed month by `months`, carrying the year. `month` is 0-based. */
export function stepMonth(
  year: number,
  month: number,
  months: number,
): { year: number; month: number } {
  const m = month + months;
  return { year: year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
}

export const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^(\d{1,2}):(\d{2})$/;
