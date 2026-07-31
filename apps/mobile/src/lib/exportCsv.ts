import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { buildCsv } from './csv';
import { bruneiDayKey, formatTime } from './format';
import { supabase } from './supabase';
import type { CategoryRow, TransactionRow } from './types';

// The I/O half of the CSV export. Rendering — quoting, and the formula
// neutralisation that makes an exported merchant name safe to open in a
// spreadsheet — lives in ./csv.ts, which is pure and unit-tested.

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

/** Export every transaction as CSV: share sheet on device, download on web. */
export async function exportTransactionsCsv(): Promise<number> {
  const [txs, { data: categories, error }] = await Promise.all([
    fetchAllTransactions(),
    supabase.from('categories').select('*'),
  ]);
  if (error) throw new Error(error.message);

  const catName = new Map((categories ?? []).map((c: CategoryRow) => [c.id, c.name]));
  const csv = buildCsv(txs, catName, { day: bruneiDayKey, time: formatTime });
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
