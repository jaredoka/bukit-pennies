import type { FieldName, FieldStatus } from './types.ts';

/** Field weights (sum = 1). Amount matters most; card least. */
export const WEIGHTS: Record<FieldName, number> = {
  amount: 0.4,
  merchant: 0.25,
  date: 0.2,
  card: 0.15,
};

/** Generic fallback and UNVERIFIED skeleton parsers never exceed this → always needs_review. */
export const UNVERIFIED_CONFIDENCE_CAP = 0.7;

const STATUS_FACTOR: Record<FieldStatus, number> = {
  exact: 1,
  heuristic: 0.5,
  missing: 0,
};

export function scoreConfidence(fields: Record<FieldName, FieldStatus>): number {
  let score = 0;
  for (const name of Object.keys(WEIGHTS) as FieldName[]) {
    score += WEIGHTS[name] * STATUS_FACTOR[fields[name]];
  }
  return Math.round(score * 100) / 100;
}
