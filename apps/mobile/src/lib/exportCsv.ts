import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { buildCsv } from './csv';
import { bruneiDayKey, formatTime } from './format';
import { fetchAllPages } from './queries';
import { supabase } from './supabase';
import type { CategoryRow, TransactionRow } from './types';

// The I/O half of the CSV export. Rendering — quoting, and the formula
// neutralisation that makes an exported merchant name safe to open in a
// spreadsheet — lives in ./csv.ts, which is pure and unit-tested.

// Paging is shared with the dashboard aggregates now (queries.ts). This is
// where it was first done correctly; `id` was added to the ordering because
// `occurred_at` + `created_at` can still tie, and a tie is what makes a paged
// read drop one row and repeat another.
function fetchAllTransactions(): Promise<TransactionRow[]> {
  return fetchAllPages<TransactionRow>((from, to) =>
    supabase
      .from('transactions')
      .select('*')
      .order('occurred_at', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  );
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
