import { parseBankMessage } from '@bukit/parsers';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Badge, Button, Card, Centered, Field, Muted, Title } from '@/components/ui';
import { formatTime, bruneiDayKey, formatDayHeading } from '@/lib/format';
import { themedStyles } from '@/lib/theme';
import { usePrivacy } from '@/lib/privacy';
import {
  useCategories,
  useCreateCategory,
  useDeleteTransaction,
  useTransaction,
  useUpdateTransaction,
} from '@/lib/queries';

function confirmAsync(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(globalThis.confirm ? globalThis.confirm(`${title}\n\n${message}`) : true);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export default function TransactionDetail() {
  const { money } = usePrivacy();
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: tx, isLoading } = useTransaction(id);
  const categories = useCategories();
  const update = useUpdateTransaction();
  const del = useDeleteTransaction();
  const createCategory = useCreateCategory();

  const [notes, setNotes] = useState('');
  const [newCategory, setNewCategory] = useState('');
  useEffect(() => {
    if (tx) setNotes(tx.notes ?? '');
  }, [tx?.id]);

  if (isLoading || !tx) {
    return (
      <Centered>
        <ActivityIndicator size="large" />
      </Centered>
    );
  }

  const notesDirty = notes !== (tx.notes ?? '');

  function reparse() {
    if (!tx) return;
    const { tx: parsed } = parseBankMessage(tx.raw_text);
    if (!parsed) return;
    update.mutate({
      id: tx.id,
      patch: {
        amount: parsed.amount,
        currency: parsed.currency,
        merchant: parsed.merchant,
        merchant_normalized: parsed.merchantNormalized,
        occurred_at: parsed.occurredAt,
        card_last4: parsed.cardLast4,
        bank: parsed.bank,
        confidence: parsed.confidence,
        parse_status: parsed.confidence >= 0.75 && parsed.amount !== null ? 'parsed' : 'needs_review',
      },
    });
  }

  async function remove() {
    if (!tx) return;
    const ok = await confirmAsync('Delete transaction', 'This cannot be undone.');
    if (!ok) return;
    del.mutate(tx.id, { onSuccess: () => router.back() });
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Title>{tx.merchant ?? 'Unknown merchant'}</Title>
            <Muted>
              {tx.occurred_at
                ? `${formatDayHeading(bruneiDayKey(tx.occurred_at))} ${formatTime(tx.occurred_at)}`
                : 'No date'}
              {tx.card_last4 ? `  ·  •${tx.card_last4}` : ''}
              {`  ·  ${tx.bank}`}
            </Muted>
          </View>
          <Text style={styles.amount}>{money(tx.amount === null ? null : Number(tx.amount), tx.currency)}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
          <Badge
            label={tx.parse_status === 'parsed' ? 'parsed' : 'needs review'}
            tone={tx.parse_status === 'parsed' ? 'success' : 'warning'}
          />
          <Badge label={`confidence ${(Number(tx.confidence ?? 0) * 100).toFixed(0)}%`} />
          <Badge label={tx.source} />
        </View>
      </Card>

      <Card>
        <Title>Notes</Title>
        <Field
          placeholder="Add a note…"
          value={notes}
          onChangeText={setNotes}
          multiline
          style={{ minHeight: 60 }}
        />
        <Button
          label={notesDirty ? 'Save note' : 'Saved'}
          onPress={() => update.mutate({ id: tx.id, patch: { notes: notes || null } })}
          disabled={!notesDirty}
          busy={update.isPending}
        />
      </Card>

      <Card>
        <Title>Category</Title>
        <View style={styles.chips}>
          {(categories.data ?? []).map((c) => (
            <Pressable
              key={c.id}
              onPress={() =>
                update.mutate({
                  id: tx.id,
                  patch: { category_id: tx.category_id === c.id ? null : c.id },
                })
              }
              style={[styles.chip, tx.category_id === c.id && styles.chipActive]}
            >
              <Text style={tx.category_id === c.id ? styles.chipActiveText : styles.chipText}>
                {c.name}
              </Text>
            </Pressable>
          ))}
          {categories.data?.length === 0 ? <Muted>No categories yet — add one below.</Muted> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Field
              placeholder="New category name"
              value={newCategory}
              onChangeText={setNewCategory}
              style={{ marginBottom: 0 }}
            />
          </View>
          <Button
            label="Add"
            variant="secondary"
            disabled={!newCategory.trim()}
            onPress={() =>
              createCategory.mutate(newCategory.trim(), { onSuccess: () => setNewCategory('') })
            }
          />
        </View>
      </Card>

      <Card>
        <Title>Original message</Title>
        <Text style={styles.raw}>{tx.raw_text}</Text>
        <Button label="Re-parse from original text" variant="secondary" onPress={reparse} busy={update.isPending} />
      </Card>

      <Button label="Delete transaction" variant="danger" onPress={remove} busy={del.isPending} />
    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  amount: { fontSize: 22, fontWeight: '800', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text },
  chipActiveText: { color: colors.onPrimary, fontWeight: '600' },
  raw: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
    color: colors.muted,
    marginBottom: 12,
  },
}));
