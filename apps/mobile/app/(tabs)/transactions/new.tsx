import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, colors, Field, Muted, Title } from '@/components/ui';
import { bruneiParts } from '@/lib/format';
import { useCategories, useCreateManualTransaction } from '@/lib/queries';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})$/;

function nowBrunei() {
  const p = bruneiParts(Date.now());
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}

export default function NewTransaction() {
  const initial = nowBrunei();
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [cardLast4, setCardLast4] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const categories = useCategories();
  const create = useCreateManualTransaction();

  function validate(): string | null {
    if (!merchant.trim()) return 'Merchant is required.';
    const amt = Number(amount);
    if (!amount.trim() || !Number.isFinite(amt) || amt <= 0) return 'Amount must be a positive number.';
    if (!DATE_RE.test(date.trim())) return 'Date must be YYYY-MM-DD.';
    const t = TIME_RE.exec(time.trim());
    if (!t || Number(t[1]) > 23 || Number(t[2]) > 59) return 'Time must be HH:MM (24-hour).';
    if (cardLast4.trim() && !/^\d{4}$/.test(cardLast4.trim())) return 'Card must be the last 4 digits.';
    return null;
  }

  function submit() {
    const problem = validate();
    setError(problem);
    if (problem) return;
    const [h, m] = time.trim().split(':');
    const occurredAt = `${date.trim()}T${h!.padStart(2, '0')}:${m}:00+08:00`;
    create.mutate(
      {
        merchant: merchant.trim(),
        amount: Math.round(Number(amount) * 100) / 100,
        currency: 'BND',
        occurredAt,
        categoryId,
        cardLast4: cardLast4.trim() || null,
        notes: notes.trim() || null,
      },
      {
        onSuccess: () => router.back(),
        onError: (e) => setError(e instanceof Error ? e.message : String(e)),
      },
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Title>Add a transaction manually</Title>
        <Muted>For cash spends or anything that never produced a bank message.</Muted>
        <View style={{ marginTop: 12 }}>
          <Field label="Merchant" placeholder="e.g. Pasar Gadong" value={merchant} onChangeText={setMerchant} />
          <Field
            label="Amount (BND)"
            placeholder="0.00"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
          />
          <View style={styles.rowFields}>
            <View style={{ flex: 1 }}>
              <Field label="Date" placeholder="YYYY-MM-DD" value={date} onChangeText={setDate} autoCapitalize="none" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Time" placeholder="HH:MM" value={time} onChangeText={setTime} autoCapitalize="none" />
            </View>
          </View>
          <Field
            label="Card last 4 digits (optional)"
            placeholder="0213"
            value={cardLast4}
            onChangeText={setCardLast4}
            keyboardType="number-pad"
            maxLength={4}
          />
          <Field label="Notes (optional)" placeholder="Add a note…" value={notes} onChangeText={setNotes} multiline />
        </View>
      </Card>

      <Card>
        <Title>Category</Title>
        <View style={styles.chips}>
          {(categories.data ?? []).map((c) => (
            <Pressable
              key={c.id}
              onPress={() => setCategoryId(categoryId === c.id ? null : c.id)}
              style={[styles.chip, categoryId === c.id && styles.chipActive]}
            >
              <Text style={categoryId === c.id ? styles.chipActiveText : styles.chipText}>{c.name}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button label="Save transaction" onPress={submit} busy={create.isPending} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  rowFields: { flexDirection: 'row', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
  chipActiveText: { color: '#fff', fontWeight: '600' },
  error: { color: colors.danger, marginBottom: 8 },
});
