import { describe, expect, it } from 'vitest';
import {
  amountSign,
  directionLabel,
  effectiveDirection,
  isMoneyIn,
  isRefund,
  isSpend,
  isTransfer,
  keepsCategory,
  requiresCategory,
  signedAmount,
} from '@/lib/direction';

/**
 * These pin the meaning of the optional direction. The load-bearing rule is
 * that `null` ("Not set") is an effective `out` everywhere: that is what keeps
 * existing totals unchanged for people who never tag a transaction.
 */
describe('effectiveDirection', () => {
  it('treats Not set as money out', () => {
    expect(effectiveDirection(null)).toBe('out');
  });

  it('keeps an explicit direction', () => {
    expect(effectiveDirection('in')).toBe('in');
    expect(effectiveDirection('refund')).toBe('refund');
    expect(effectiveDirection('transfer')).toBe('transfer');
  });
});

describe('predicates', () => {
  it('counts out and Not set as spending', () => {
    expect(isSpend('out')).toBe(true);
    expect(isSpend(null)).toBe(true);
    expect(isSpend('refund')).toBe(true);
    expect(isSpend('in')).toBe(false);
    expect(isSpend('transfer')).toBe(false);
  });

  it('counts only plain money in as money in', () => {
    expect(isMoneyIn('in')).toBe(true);
    expect(isMoneyIn('refund')).toBe(false);
    expect(isMoneyIn(null)).toBe(false);
  });

  it('recognises refunds and transfers', () => {
    expect(isRefund('refund')).toBe(true);
    expect(isTransfer('transfer')).toBe(true);
    expect(isTransfer(null)).toBe(false);
  });

  it('requires a category for a refund, and keeps it for out and Not set', () => {
    expect(requiresCategory('refund')).toBe(true);
    expect(requiresCategory('in')).toBe(false);
    expect(keepsCategory('out')).toBe(true);
    expect(keepsCategory(null)).toBe(true);
    expect(keepsCategory('refund')).toBe(true);
    expect(keepsCategory('in')).toBe(false);
    expect(keepsCategory('transfer')).toBe(false);
  });
});

describe('display helpers', () => {
  it('signs the amount by cash flow, not accounting income', () => {
    expect(amountSign('out')).toBe('-');
    expect(amountSign(null)).toBe('-');
    expect(amountSign('in')).toBe('+');
    expect(amountSign('refund')).toBe('+');
    expect(amountSign('transfer')).toBe('');
  });

  it('has a signed amount for every direction except transfer', () => {
    expect(signedAmount(12.5, 'out')).toBe(-12.5);
    expect(signedAmount(12.5, null)).toBe(-12.5);
    expect(signedAmount(12.5, 'in')).toBe(12.5);
    expect(signedAmount(12.5, 'refund')).toBe(12.5);
    expect(signedAmount(12.5, 'transfer')).toBeNull();
    expect(signedAmount(null, 'out')).toBeNull();
  });

  it('labels Not set explicitly', () => {
    expect(directionLabel(null)).toBe('Not set');
    expect(directionLabel('out')).toBe('Money out');
    expect(directionLabel('in')).toBe('Money in');
    expect(directionLabel('refund')).toBe('Refund');
    expect(directionLabel('transfer')).toBe('Transfer');
  });
});
