import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Centered, Field, Muted, Title } from '@/components/ui';

import { useBudgets, useCategories, useDeleteBudget, useUpsertBudget } from '@/lib/queries';
import type { BudgetRow, CategoryRow } from '@/lib/types';
import { themedStyles, useTheme } from '@/lib/theme';
import { usePrivacy } from '@/lib/privacy';

export default function Budgets() {
  const styles = useStyles();
  const categories = useCategories();
  const budgets = useBudgets();

  if (categories.isLoading || budgets.isLoading) {
    return (
      <Centered>
        <ActivityIndicator size="large" />
      </Centered>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Title>Monthly budgets</Title>
        <Muted>
          Set a monthly limit per category. The dashboard shows how this month&apos;s spending
          tracks against each limit.
        </Muted>
      </Card>
      {(categories.data ?? []).map((c) => (
        <BudgetRowCard
          key={c.id}
          category={c}
          budget={budgets.data?.find((b) => b.category_id === c.id) ?? null}
        />
      ))}
    </ScrollView>
  );
}

function BudgetRowCard({ category, budget }: { category: CategoryRow; budget: BudgetRow | null }) {
  const { money } = usePrivacy();
  const styles = useStyles();
  const { colors } = useTheme();
  const [value, setValue] = useState(budget ? Number(budget.amount).toFixed(2) : '');
  const [error, setError] = useState<string | null>(null);
  const upsert = useUpsertBudget();
  const del = useDeleteBudget();

  const savedLabel = budget ? money(Number(budget.amount), budget.currency) : 'no limit';
  const dirty = value.trim() !== (budget ? Number(budget.amount).toFixed(2) : '');

  function save() {
    const amt = Number(value);
    if (!value.trim() || !Number.isFinite(amt) || amt <= 0) {
      setError('Enter a positive amount.');
      return;
    }
    setError(null);
    upsert.mutate(
      { categoryId: category.id, amount: Math.round(amt * 100) / 100 },
      { onError: (e) => setError(e instanceof Error ? e.message : String(e)) },
    );
  }

  return (
    <Card>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: category.color ?? colors.muted }]} />
        <Text style={styles.name}>{category.name}</Text>
        <Muted>{savedLabel}</Muted>
      </View>
      <View style={styles.controls}>
        <View style={{ flex: 1 }}>
          <Field
            placeholder="Monthly limit (BND)"
            value={value}
            onChangeText={setValue}
            keyboardType="decimal-pad"
            style={{ marginBottom: 0 }}
          />
        </View>
        <Button label="Save" variant="secondary" onPress={save} disabled={!dirty} busy={upsert.isPending} />
        {budget ? (
          <Button
            label="Remove"
            variant="secondary"
            onPress={() => del.mutate(budget.id, { onSuccess: () => setValue('') })}
            busy={del.isPending}
          />
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Card>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { flex: 1, fontWeight: '600', color: colors.text },
  controls: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  error: { color: colors.danger, marginTop: 6 },
}));
