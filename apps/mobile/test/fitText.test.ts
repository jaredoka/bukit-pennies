import { describe, expect, it } from 'vitest';
import { estimateWidthEm, fitFontSize } from '../src/lib/fitText';

describe('estimateWidthEm', () => {
  it('is calibrated against the dashboard card reference', () => {
    // Measured in the preview: this string occupies 119px at 16px, i.e. 7.44em.
    // The estimate must be at least that, or the fitter would under-shrink.
    const em = estimateWidthEm('BND 12,345.67');
    expect(em).toBeGreaterThan(7.44);
    expect(em).toBeLessThan(7.9);
  });

  it('scales with length', () => {
    expect(estimateWidthEm('BND 1.00')).toBeLessThan(estimateWidthEm('BND 99,999.99'));
  });
});

describe('fitFontSize', () => {
  const long = 'BND 99,999.99';

  it('keeps the base size when the card is wide enough', () => {
    // iPhone 17: each of the two top cards gives the amount ~155px.
    expect(fitFontSize(long, 155, { base: 16, min: 12 })).toBe(16);
  });

  it('shrinks on a narrow card instead of clipping', () => {
    const size = fitFontSize(long, 119, { base: 16, min: 12 });
    expect(size).toBeLessThan(16);
    expect(size).toBeGreaterThanOrEqual(12);
  });

  it('never goes below the floor', () => {
    expect(fitFontSize(long, 40, { base: 16, min: 12 })).toBe(12);
  });

  it('steps in half points', () => {
    const size = fitFontSize(long, 130, { base: 16, min: 12 });
    expect(size * 2).toBe(Math.round(size * 2));
  });

  it('returns the base size before the card has been measured', () => {
    expect(fitFontSize(long, 0, { base: 16 })).toBe(16);
  });

  it('handles empty text', () => {
    expect(fitFontSize('', 80, { base: 16 })).toBe(16);
  });

  it('fits the resulting size inside the width', () => {
    const width = 130;
    const size = fitFontSize(long, width, { base: 16, min: 12 });
    expect(estimateWidthEm(long) * size * 1.06).toBeLessThanOrEqual(width);
  });
});
