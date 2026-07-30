import { describe, expect, it } from 'vitest';
import { DAY_KEY_RE, TIME_RE, dayKeyOf, monthGrid, stepMonth } from '@/lib/calendar';

describe('monthGrid', () => {
  it('always returns 6 rows of 7 so the sheet height never shifts', () => {
    for (const [y, m] of [[2026, 0], [2026, 1], [2026, 6], [2024, 1], [2026, 10]] as const) {
      const grid = monthGrid(y, m);
      expect(grid).toHaveLength(6);
      for (const row of grid) expect(row).toHaveLength(7);
    }
  });

  it('pads the leading blanks to the first weekday', () => {
    // 1 July 2026 is a Wednesday → three blanks (Su, Mo, Tu).
    expect(monthGrid(2026, 6)[0]).toEqual([null, null, null, 1, 2, 3, 4]);
  });

  it('has no leading blanks when the month starts on a Sunday', () => {
    // 1 February 2026 is a Sunday.
    expect(monthGrid(2026, 1)[0]![0]).toBe(1);
  });

  it('gets month lengths right, including leap February', () => {
    const days = (y: number, m: number) => monthGrid(y, m).flat().filter((d) => d !== null);
    expect(days(2026, 1)).toHaveLength(28); // Feb 2026
    expect(days(2024, 1)).toHaveLength(29); // Feb 2024, leap
    expect(days(2026, 3)).toHaveLength(30); // April
    expect(days(2026, 0)).toHaveLength(31); // January
  });

  it('lays days out consecutively with no gaps or repeats', () => {
    const days = monthGrid(2026, 7).flat().filter((d): d is number => d !== null);
    expect(days).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
  });
});

describe('dayKeyOf', () => {
  it('zero-pads and shifts the 0-based month', () => {
    expect(dayKeyOf(2026, 0, 5)).toBe('2026-01-05');
    expect(dayKeyOf(2026, 11, 31)).toBe('2026-12-31');
  });

  it('produces keys the pickers accept', () => {
    expect(DAY_KEY_RE.test(dayKeyOf(2026, 6, 1))).toBe(true);
  });
});

describe('stepMonth', () => {
  it('steps within a year', () => {
    expect(stepMonth(2026, 5, 1)).toEqual({ year: 2026, month: 6 });
    expect(stepMonth(2026, 5, -1)).toEqual({ year: 2026, month: 4 });
  });

  it('carries the year in both directions', () => {
    expect(stepMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(stepMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });

  it('handles multi-year jumps', () => {
    expect(stepMonth(2026, 0, 25)).toEqual({ year: 2028, month: 1 });
    expect(stepMonth(2026, 0, -13)).toEqual({ year: 2024, month: 11 });
  });
});

describe('TIME_RE', () => {
  it('accepts what the time wheel emits', () => {
    expect(TIME_RE.test('00:00')).toBe(true);
    expect(TIME_RE.test('23:59')).toBe(true);
    expect(TIME_RE.test('9:05')).toBe(true);
  });

  it('rejects partial or malformed times', () => {
    for (const bad of ['', '12', '12:', ':30', '12:3', 'ab:cd', '12:30:00']) {
      expect(TIME_RE.test(bad)).toBe(false);
    }
  });
});
