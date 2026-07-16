/** Canonical form used for raw_hash dedup: trim + collapse all whitespace runs. */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Dashboard grouping key: uppercase + collapsed whitespace. */
export function normalizeMerchant(merchant: string): string {
  return normalizeText(merchant).toUpperCase();
}

/** "1,234.56" → 1234.56; null when not a clean positive number. */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/,/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Currency tokens seen in Brunei bank messages; "B$" is BND shorthand. */
export function normalizeCurrency(raw: string): string {
  const upper = raw.toUpperCase();
  return upper === 'B$' ? 'BND' : upper;
}

/** "4x0213" / "****0213" → "0213". */
export function extractLast4(masked: string): string | null {
  const m = /(\d{4})$/.exec(masked.trim());
  return m ? m[1]! : null;
}
