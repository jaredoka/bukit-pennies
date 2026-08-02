import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Field, Muted, Title } from '@/components/ui';
import { invalidateTransactionQueries } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { themedStyles } from '@/lib/theme';

export default function ResetTransactions() {
  const styles = useStyles();
  const qc = useQueryClient();
  const [confirmText, setConfirmText] = useState('');
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function resetTransactions() {
    setBusy(true);
    setNote(null);
    try {
      const { data, error } = await supabase.rpc('reset_transactions');
      if (error) {
        setNote({ text: `Reset failed: ${error.message}`, ok: false });
        return;
      }
      const count = (data as number | null) ?? 0;
      setConfirmText('');
      setNote({ text: `Deleted ${count} transaction${count === 1 ? '' : 's'}.`, ok: true });
      // Every derived cache — the list, monthly totals, facets, review — is a
      // function of the transactions table; one helper invalidates them all.
      invalidateTransactionQueries(qc);
    } catch (e) {
      setNote({ text: `Reset failed: ${e instanceof Error ? e.message : String(e)}`, ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Title>Reset all transactions</Title>
        <Text style={styles.body}>
          Deletes your spending history — every transaction in the Transactions tab, including
          the notes and categories on each one. This cannot be undone.
        </Text>
        <Muted>
          Your budgets, goals, subscriptions, cards, and settings are kept. Recording new
          transactions keeps working, so anything you capture from now on is added as usual.
        </Muted>
      </Card>
      <Card>
        <Field
          label={'Type RESET TRANSACTIONS to confirm'}
          value={confirmText}
          onChangeText={setConfirmText}
          autoCapitalize="characters"
          placeholder="RESET TRANSACTIONS"
        />
        {note ? (
          <Text style={[styles.note, note.ok ? styles.noteOk : styles.noteErr]}>
            {note.text}
          </Text>
        ) : null}
        <Button
          label="Reset all transactions"
          variant="danger"
          onPress={resetTransactions}
          disabled={confirmText.trim().toUpperCase() !== 'RESET TRANSACTIONS'}
          busy={busy}
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
