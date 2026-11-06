import type { TxDirection } from './types';

/**
 * Pure rules for the optional transaction direction. Kept free of Supabase and
 * React so the same answer is used by the list, detail screen, CSV export and
 * the aggregate fallbacks — and can be unit-tested.
 *
 * `null` ("Not set") is an effective `out` everywhere. That is what lets people
 * ignore direction entirely without their transactions vanishing from totals.
 */
export function effectiveDirection(direction: TxDirection | null): TxDirection {
  return direction ?? 'out';
}

export function isNotSet(direction: TxDirection | null): boolean {
  return direction === null;
}

/** Spending, including a refund (which is netted off its category). */
export function isSpend(direction: TxDirection | null): boolean {
  const d = effectiveDirection(direction);
  return d === 'out' || d === 'refund';
}

/** Plain incoming money. Refunds are deliberately not included: they already
 *  reduce spending, and counting them here too would improve the dashboard
 *  twice. */
export function isMoneyIn(direction: TxDirection | null): boolean {
  return effectiveDirection(direction) === 'in';
}

export function isRefund(direction: TxDirection | null): boolean {
  return effectiveDirection(direction) === 'refund';
}

export function isTransfer(direction: TxDirection | null): boolean {
  return effectiveDirection(direction) === 'transfer';
}

/** A refund must name the category it reduces. */
export function requiresCategory(direction: TxDirection | null): boolean {
  return effectiveDirection(direction) === 'refund';
}

/** Money in, refund and transfer never keep a spending category. */
export function keepsCategory(direction: TxDirection | null): boolean {
  const d = effectiveDirection(direction);
  return d === 'out' || d === 'refund';
}

/** '+' for money in/refund, '−' for out, nothing for transfer. */
export function amountSign(direction: TxDirection | null): '+' | '-' | '' {
  const d = effectiveDirection(direction);
  if (d === 'transfer') return '';
  return d === 'in' || d === 'refund' ? '+' : '-';
}

/**
 * Amount with its cash-flow sign: money out is negative, money in and refunds
 * are positive, transfer is null because it changes nothing. Kept separate from
 * the display sign so a CSV can sum the column.
 */
export function signedAmount(
  amount: number | null,
  direction: TxDirection | null,
): number | null {
  if (amount === null || !Number.isFinite(amount)) return null;
  const d = effectiveDirection(direction);
  if (d === 'transfer') return null;
  return d === 'in' || d === 'refund' ? Math.abs(amount) : -Math.abs(amount);
}

export const DIRECTION_LABELS: Record<TxDirection, string> = {
  out: 'Money out',
  in: 'Money in',
  refund: 'Refund',
  transfer: 'Transfer',
};

export function directionLabel(direction: TxDirection | null): string {
  return direction === null ? 'Not set' : DIRECTION_LABELS[direction];
}

/** The four explicit choices, in the order the pickers show them. */
export const DIRECTION_CHOICES: { value: TxDirection | null; label: string }[] = [
  { value: 'out', label: 'Money out' },
  { value: 'in', label: 'Money in' },
  { value: 'refund', label: 'Refund (money in)' },
  { value: 'transfer', label: 'Transfer' },
  { value: null, label: 'Not set' },
];
