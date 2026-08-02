import { describe, expect, it } from 'vitest';
import { formatMoney, formatMoneyPair } from '@/lib/format';

describe('formatMoneyPair', () => {
  it('states the currency once, on the left', () => {
    expect(formatMoneyPair(100, 500, 'BND')).toBe('BND 100.00 / 500.00');
  });

  it('comma-formats both sides', () => {
    expect(formatMoneyPair(1234567.89, 3000000, 'BND')).toBe(
      'BND 1,234,567.89 / 3,000,000.00',
    );
  });

  it('handles a null first value like formatMoney does', () => {
    expect(formatMoneyPair(null, 500, 'BND')).toBe('—');
    expect(formatMoneyPair(Number.NaN, 500, 'BND')).toBe('—');
  });

  it('shows an em dash for a null second value', () => {
    expect(formatMoneyPair(100, null, 'BND')).toBe('BND 100.00 / —');
  });

  it('keeps a negative sign on the side that carries it', () => {
    expect(formatMoneyPair(100, -50, 'BND')).toBe('BND 100.00 / -50.00');
    expect(formatMoney(-50, 'BND')).toBe('-BND 50.00');
  });
});
