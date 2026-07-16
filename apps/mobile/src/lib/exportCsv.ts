import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { bruneiDayKey, formatTime } from './format';
import { supabase } from './supabase';
import type { CategoryRow, TransactionRow } from './types';

const HEADER = [
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

function csvField(value: string | number | null): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function fetchAllTransactions(): Promise<TransactionRow[]> {
  const PAGE = 1000;
  const rows: TransactionRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('occurred_at', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

export function buildCsv(txs: TransactionRow[], categories: CategoryRow[]): string {
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const lines = [HEADER.join(',')];
  for (const tx of txs) {
    lines.push(
      [
        csvField(tx.occurred_at ? bruneiDayKey(tx.occurred_at) : null),
        csvField(tx.occurred_at ? formatTime(tx.occurred_at) : null),
        csvField(tx.amount === null ? null : Number(tx.amount).toFixed(2)),
        csvField(tx.currency),
        csvField(tx.merchant),
        csvField(tx.category_id ? (catName.get(tx.category_id) ?? '') : null),
        csvField(tx.bank),
        csvField(tx.card_last4),
        csvField(tx.source),
        csvField(tx.parse_status),
        csvField(tx.notes),
        csvField(tx.raw_text),
      ].join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}

/** Export every transaction as CSV: share sheet on device, download on web. */
export async function exportTransactionsCsv(): Promise<number> {
  const [txs, { data: categories, error }] = await Promise.all([
    fetchAllTransactions(),
    supabase.from('categories').select('*'),
  ]);
  if (error) throw new Error(error.message);

  const csv = buildCsv(txs, categories ?? []);
  const filename = `bukit-pennies-${bruneiDayKey(Date.now())}.csv`;

  if (Platform.OS === 'web') {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return txs.length;
  }

  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.write(csv);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export transactions' });
  }
  return txs.length;
}
