import { bruneiMonthKey } from './format';

export interface RecurringCandidateTx {
  occurred_at: string | null;
  amount: number | null;
  currency: string;
  merchant_normalized: string | null;
}

export interface RecurringSpend {
  merchant: string;
  /** Median amount of the cluster — the "subscription price". */
  amount: number;
  /** Actual sum of every spend in the cluster. */
  total: number;
  currency: string;
  /** Distinct Brunei months ('YYYY-MM-01') the spend appeared in, ascending. */
  months: string[];
  lastSeen: string;
}

/** Amounts within ±10% of the cluster's first amount belong together —
 *  subscriptions are usually exact, but FX and small plan changes wobble. */
const AMOUNT_TOLERANCE = 0.1;
/** A merchant+amount cluster is "recurring" once it hits this many distinct months. */
const MIN_MONTHS = 3;

/** Same-merchant, similar-amount, multi-month heuristic (HANDOFF §14 item 11).
 *  Pass parsed transactions covering the last ~6 Brunei months. */
export function detectRecurring(txs: RecurringCandidateTx[]): RecurringSpend[] {
  const byMerchant = new Map<string, RecurringCandidateTx[]>();
  for (const tx of txs) {
    if (!tx.merchant_normalized || tx.amount === null || !tx.occurred_at) continue;
    byMerchant.set(tx.merchant_normalized, [...(byMerchant.get(tx.merchant_normalized) ?? []), tx]);
  }

  const results: RecurringSpend[] = [];
  for (const [merchant, rows] of byMerchant) {
    // Cluster the merchant's amounts: each row joins the first cluster whose
    // anchor amount is within tolerance, else starts a new one.
    const clusters: { anchor: number; rows: RecurringCandidateTx[] }[] = [];
    for (const row of rows) {
      const amt = Number(row.amount);
      const cluster = clusters.find((c) => Math.abs(amt - c.anchor) <= c.anchor * AMOUNT_TOLERANCE);
      if (cluster) cluster.rows.push(row);
      else clusters.push({ anchor: amt, rows: [row] });
    }

    for (const cluster of clusters) {
      const months = Array.from(
        new Set(cluster.rows.map((r) => bruneiMonthKey(r.occurred_at!))),
      ).sort();
      if (months.length < MIN_MONTHS) continue;
      const amounts = cluster.rows.map((r) => Number(r.amount)).sort((a, b) => a - b);
      const median = amounts[Math.floor(amounts.length / 2)]!;
      const lastSeen = cluster.rows
        .map((r) => r.occurred_at!)
        .sort()
        .at(-1)!;
      results.push({
        merchant,
        amount: median,
        total: amounts.reduce((s, a) => s + a, 0),
        currency: cluster.rows[0]!.currency,
        months,
        lastSeen,
      });
    }
  }

  return results.sort((a, b) => b.amount - a.amount);
}
