import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Field, Muted, NavRow, Title } from '@/components/ui';
import { exportTransactionsCsv } from '@/lib/exportCsv';
import { invalidateTransactionQueries } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { themedStyles } from '@/lib/theme';

export default function Spending() {
  const styles = useStyles();
  const qc = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [resetNote, setResetNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [resetting, setResetting] = useState(false);

  async function exportCsv() {
    setExporting(true);
    setExportNote(null);
    try {
      const count = await exportTransactionsCsv();
      setExportNote(`Exported ${count} transaction${count === 1 ? '' : 's'}.`);
    } catch (e) {
      setExportNote(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  async function resetTransactions() {
    setResetting(true);
    setResetNote(null);
    try {
      const { data, error } = await supabase.rpc('reset_transactions');
      if (error) {
        setResetNote({ text: `Reset failed: ${error.message}`, ok: false });
        return;
      }
      const count = (data as number | null) ?? 0;
      setConfirmText('');
      setResetNote({ text: `Deleted ${count} transaction${count === 1 ? '' : 's'}.`, ok: true });
      // Every derived cache — the list, monthly totals, facets, review — is a
      // function of the transactions table; one helper invalidates them all.
      invalidateTransactionQueries(qc);
    } catch (e) {
      setResetNote({ text: `Reset failed: ${e instanceof Error ? e.message : String(e)}`, ok: false });
    } finally {
      setResetting(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Title>Spending &amp; data</Title>
        <NavRow
          href="/(tabs)/settings/budgets"
          icon="pie-chart"
          label="Set category budgets"
          note="Set per-category limits shown on the dashboard"
        />
        <NavRow
          href="/subscriptions"
          icon="repeat"
          label="Subscriptions"
          note="Record what you subscribe to and see what it costs per month"
        />
        <NavRow
          href="/(tabs)/settings/weekly-summary"
          icon="notifications"
          label="Weekly summary"
          note="Weekly update on money spent, and percent of money used so far in the month"
        />
        <View style={{ marginTop: 12 }}>
          <Button label="Export transactions (CSV)" variant="secondary" onPress={exportCsv} busy={exporting} />
          {exportNote ? <Muted>{exportNote}</Muted> : null}
        </View>
      </Card>
      <Card>
        <Title>Reset all transactions</Title>
        <Text style={styles.body}>
          Deletes every transaction you have recorded, and each one's category assignment goes
          with it. Your budgets, goals, subscriptions, cards, and settings are kept. There is no
          undo.
        </Text>
        <Muted>Capture tokens are unaffected. Revoke one under Capture devices to stop a capture path.</Muted>
      </Card>
      <Card>
        <Field
          label={'Type RESET TRANSACTIONS to confirm'}
          value={confirmText}
          onChangeText={setConfirmText}
          autoCapitalize="characters"
          placeholder="RESET TRANSACTIONS"
        />
        {resetNote ? (
          <Text style={[styles.note, resetNote.ok ? styles.noteOk : styles.noteErr]}>
            {resetNote.text}
          </Text>
        ) : null}
        <Button
          label="Reset all transactions"
          variant="danger"
          onPress={resetTransactions}
          disabled={confirmText.trim().toUpperCase() !== 'RESET TRANSACTIONS'}
          busy={resetting}
        />
      </Card>
    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  body: { color: colors.text, lineHeight: 20, marginBottom: 8 },
  note: { marginBottom: 8 },
  noteOk: { color: colors.muted },
  noteErr: { color: colors.danger },
}));
