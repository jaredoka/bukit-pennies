import Ionicons from '@expo/vector-icons/Ionicons';
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
import { Badge, Button, Card, Centered, Field, Muted, Sheet, Title, useSheetPresence } from '@/components/ui';
import { formatTime, bruneiParts } from '@/lib/format';
import { buildReparsePatch, canReparse } from '@/lib/reparse';
import { themedStyles, useTheme } from '@/lib/theme';
import { usePrivacy } from '@/lib/privacy';
import {
  useCategories,
  useCreateCategory,
  useDeleteTransaction,
  useTransaction,
  useUpdateTransaction,
} from '@/lib/queries';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatActualDate(iso: string): string {
  const p = bruneiParts(iso);
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}  ${formatTime(iso)}`;
}

const BANK_FULL_NAMES: Record<string, string> = {
  baiduri: 'Baiduri Bank',
  bibd: 'Bank Islam Brunei Darussalam',
  scb: 'Standard Chartered Bank',
  unknown: 'Unknown Bank',
};

function bankName(id: string): string {
  return BANK_FULL_NAMES[id.toLowerCase()] ?? id;
}

function confirmAsync(title: string, message: string, confirmLabel = 'Delete'): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(globalThis.confirm ? globalThis.confirm(`${title}\n\n${message}`) : true);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export default function TransactionDetail() {
  const { money } = usePrivacy();
  const styles = useStyles();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: tx, isLoading } = useTransaction(id);
  const categories = useCategories();
  const update = useUpdateTransaction();
  const del = useDeleteTransaction();
  const createCategory = useCreateCategory();

  const [notes, setNotes] = useState('');
  const [reparseNote, setReparseNote] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [catSheetOpen, setCatSheetOpen] = useState(false);
  const catSheetPresent = useSheetPresence(catSheetOpen ? 'cat' : null) !== null;
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

  // Overwrites fields the user may have corrected by hand, with no undo — so
  // it asks first. The rules about what it may and may not overwrite live in
  // lib/reparse.ts, where they are unit-tested.
  async function reparse() {
    if (!tx) return;
    const patch = buildReparsePatch(tx);
    if (!patch) {
      setReparseNote('Nothing could be read from the original message, so the transaction is unchanged.');
      return;
    }
    const ok = await confirmAsync(
      'Re-parse from original text',
      'This replaces the amount, merchant, date and card with whatever the original message says. Your notes and category are kept.',
      'Re-parse',
    );
    if (!ok) return;
    setReparseNote(null);
    update.mutate({ id: tx.id, patch });
  }

  async function remove() {
    if (!tx) return;
    const ok = await confirmAsync('Delete transaction', 'This cannot be undone.');
    if (!ok) return;
    del.mutate(tx.id, { onSuccess: () => router.back() });
  }

  const currentCategory = (categories.data ?? []).find((c) => c.id === tx.category_id);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      {/* Hero card: centered merchant → category pill → big amount */}
      <Card>
        <View style={styles.hero}>
          <Text style={styles.merchant} numberOfLines={2}>
            {tx.merchant ?? 'Unknown merchant'}
          </Text>

          {/* Category pill — tapping opens dropdown sheet */}
          <Pressable style={styles.categoryPill} onPress={() => setCatSheetOpen(true)}>
            <Text style={styles.categoryPillText}>
              {currentCategory ? currentCategory.name : 'No category'}
            </Text>
            <Ionicons name="chevron-down" size={13} color={colors.muted} />
          </Pressable>

          <Text style={styles.amount}>
            {money(tx.amount === null ? null : Number(tx.amount), tx.currency)}
          </Text>
        </View>
      </Card>

      {/* Details card */}
      <Card>
        <Title>Details</Title>
        <View style={styles.detailRow}>
          <Muted>Date</Muted>
          <Text style={styles.detailValue}>
            {tx.occurred_at ? formatActualDate(tx.occurred_at) : '—'}
          </Text>
        </View>
        {tx.card_last4 ? (
          <View style={styles.detailRow}>
            <Muted>Card</Muted>
            <Text style={styles.detailValue}>{tx.card_last4}</Text>
          </View>
        ) : null}
        <View style={styles.detailRow}>
          <Muted>Bank</Muted>
          <Text style={styles.detailValue}>{bankName(tx.bank)}</Text>
        </View>
        <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
          <Muted>Source</Muted>
          <Text style={styles.detailValue}>{tx.source}</Text>
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
        <Title>Original message</Title>
        <Text style={styles.raw}>{tx.raw_text}</Text>
        {canReparse(tx) ? (
          <>
            <Button
              label="Reparse from original text"
              variant="secondary"
              onPress={() => void reparse()}
              busy={update.isPending}
            />
            {reparseNote ? <Muted>{reparseNote}</Muted> : null}
          </>
        ) : (
          <Muted>You typed this one in, so there is no bank message to read it back from.</Muted>
        )}
      </Card>

      <Button label="Delete transaction" variant="danger" onPress={remove} busy={del.isPending} />

      {/* Category dropdown sheet */}
      {catSheetPresent ? (
        <Sheet
          visible={catSheetOpen}
          title="Category"
          onClose={() => setCatSheetOpen(false)}
          onClear={
            tx.category_id
              ? () => { update.mutate({ id: tx.id, patch: { category_id: null } }); setCatSheetOpen(false); }
              : undefined
          }
        >
                {(categories.data ?? []).map((c) => (
                  <Pressable
                    key={c.id}
                    style={styles.catRow}
                    onPress={() => {
                      update.mutate({ id: tx.id, patch: { category_id: tx.category_id === c.id ? null : c.id } });
                      setCatSheetOpen(false);
                    }}
                  >
                    <Text style={[styles.catRowText, tx.category_id === c.id && { color: colors.primary, fontWeight: '600' }]}>
                      {c.name}
                    </Text>
                    {tx.category_id === c.id ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
                  </Pressable>
                ))}
                {categories.data?.length === 0 ? (
                  <Muted>No categories yet. Add one below.</Muted>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 16 }}>
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
                    onPress={() => createCategory.mutate(newCategory.trim(), { onSuccess: () => setNewCategory('') })}
                  />
                </View>
        </Sheet>
      ) : null}
    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  // Hero
  hero: { alignItems: 'center', paddingVertical: 8, gap: 12 },
  merchant: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center' },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: colors.bg,
  },
  categoryPillText: { fontSize: 13, color: colors.muted },
  amount: {
    fontSize: 38,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    fontVariant: ['tabular-nums'] as const,
  },
  // Details
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  detailValue: { color: colors.text, fontWeight: '500', flexShrink: 1, textAlign: 'right', marginLeft: 16 },
  // Category sheet
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  catRowText: { fontSize: 16, color: colors.text },
  // Raw text
  raw: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
    color: colors.muted,
    marginBottom: 12,
  },
}));
