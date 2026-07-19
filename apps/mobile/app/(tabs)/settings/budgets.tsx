import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, Card, Centered, Field, Muted, Title } from '@/components/ui';
import {
  useBudgets,
  useCategories,
  useCreateCategory,
  useDeleteAllBudgets,
  useDeleteBudget,
  useDeleteCategory,
  useUpdateCategory,
  useUpsertBudget,
} from '@/lib/queries';
import type { BudgetRow, CategoryRow } from '@/lib/types';
import { themedStyles, useTheme } from '@/lib/theme';
import { usePrivacy } from '@/lib/privacy';

// 20 swatches evenly spaced around the colour wheel (~18° hue steps)
const COLOR_SWATCHES = [
  '#E03131', // Red         0°
  '#E8521A', // Red-orange 18°
  '#F76707', // Orange     36°
  '#F59F00', // Amber      54°
  '#F2C404', // Yellow     72°
  '#94D82D', // Lime-green 90°
  '#66A80F', // Yellow-grn108°
  '#2F9E44', // Green     126°
  '#099268', // Emerald   144°
  '#12B886', // Teal      162°
  '#1098AD', // Cyan      180°
  '#1C7ED6', // Sky       198°
  '#1971C2', // Blue      216°
  '#3B5BDB', // Blue-indg 234°
  '#4263EB', // Indigo    252°
  '#7048E8', // Violet    270°
  '#9C36B5', // Purple    288°
  '#AE3EC9', // Magenta   306°
  '#D6336C', // Pink      324°
  '#E64980', // Rose      342°
];

const RESET_PHRASE = 'RESET-BUDGET';

export default function Budgets() {
  const styles = useStyles();
  const { colors } = useTheme();
  const categories = useCategories();
  const budgets = useBudgets();
  const createCategory = useCreateCategory();
  const deleteAllBudgets = useDeleteAllBudgets();
  const [newName, setNewName] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resetText, setResetText] = useState('');

  function addCategory() {
    const name = newName.trim();
    if (!name) return;
    createCategory.mutate(name, { onSuccess: () => setNewName('') });
  }

  function confirmReset() {
    Alert.alert(
      'Reset all budgets?',
      'This will permanently clear every monthly budget limit. Your categories and transactions are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () =>
            deleteAllBudgets.mutate(undefined, { onSuccess: () => setResetText('') }),
        },
      ],
    );
  }

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
        <Title>Category budgets</Title>
        <Muted>
          Set a monthly budget per category. The dashboard tracks this month&apos;s spending
          against each limit. Tap a category to edit its budget and colour.
        </Muted>
      </Card>

      <Card style={styles.listCard}>
        {(categories.data ?? []).map((c, idx) => {
          const budget = budgets.data?.find((b) => b.category_id === c.id) ?? null;
          const isExpanded = expandedId === c.id;
          const isLast = idx === (categories.data?.length ?? 0) - 1;
          return (
            <View key={c.id}>
              <CategoryAccordionRow
                category={c}
                categoryIndex={idx}
                budget={budget}
                expanded={isExpanded}
                onToggle={() => setExpandedId(isExpanded ? null : c.id)}
              />
              {!isLast && !isExpanded && <View style={styles.divider} />}
            </View>
          );
        })}
        {(categories.data ?? []).length === 0 ? (
          <Muted>No categories yet. Add one below.</Muted>
        ) : null}
      </Card>

      <Card>
        <Title>Add category</Title>
        <View style={styles.addRow}>
          <View style={{ flex: 1 }}>
            <Field
              placeholder="Category name"
              value={newName}
              onChangeText={setNewName}
              style={{ marginBottom: 0 }}
            />
          </View>
          <Button
            label="Add"
            onPress={addCategory}
            disabled={!newName.trim()}
            busy={createCategory.isPending}
          />
        </View>
        {createCategory.error ? (
          <Text style={styles.error}>{createCategory.error.message}</Text>
        ) : null}
      </Card>

      {/* ---- Danger zone: reset all budgets ---- */}
      <Card>
        <Title>Reset budgets</Title>
        <Muted>
          Clears every monthly budget limit back to none. Type{' '}
          <Text style={styles.resetPhrase}>{RESET_PHRASE}</Text> below to unlock the
          reset button.
        </Muted>
        <Field
          placeholder={RESET_PHRASE}
          value={resetText}
          onChangeText={setResetText}
          autoCapitalize="characters"
          style={{ marginTop: 10, marginBottom: 4 }}
        />
        <Button
          label="Reset all budgets"
          variant="danger"
          onPress={confirmReset}
          disabled={resetText !== RESET_PHRASE}
          busy={deleteAllBudgets.isPending}
        />
        {deleteAllBudgets.error ? (
          <Text style={styles.error}>
            {deleteAllBudgets.error instanceof Error
              ? deleteAllBudgets.error.message
              : String(deleteAllBudgets.error)}
          </Text>
        ) : null}
      </Card>
    </ScrollView>
  );
}

function CategoryAccordionRow({
  category,
  categoryIndex,
  budget,
  expanded,
  onToggle,
}: {
  category: CategoryRow;
  categoryIndex: number;
  budget: BudgetRow | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { money } = usePrivacy();
  const styles = useStyles();
  const { colors } = useTheme();
  const [value, setValue] = useState(budget ? Number(budget.amount).toFixed(2) : '');
  const [error, setError] = useState<string | null>(null);
  const upsert = useUpsertBudget();
  const del = useDeleteBudget();
  const deleteCategory = useDeleteCategory();
  const updateCategory = useUpdateCategory();

  const savedLabel = budget ? money(Number(budget.amount), budget.currency) : 'no limit';
  const dirty = value.trim() !== (budget ? Number(budget.amount).toFixed(2) : '');
  const isGlobal = category.user_id === null;
  const dotColor = category.color ?? colors.chartCategories[categoryIndex % colors.chartCategories.length]!;

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
    <View>
      <Pressable onPress={onToggle} style={styles.accordionRow}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <Text style={styles.name} numberOfLines={1}>{category.name}</Text>
        <Muted>{savedLabel}</Muted>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.muted}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.accordionBody}>
          {/* Colour swatches — global categories share their colour with all users so we lock it */}
          {!isGlobal ? (
            <View style={styles.swatchRow}>
              {COLOR_SWATCHES.map((hex) => (
                <Pressable
                  key={hex}
                  onPress={() => updateCategory.mutate({ id: category.id, color: hex })}
                  style={[
                    styles.swatch,
                    { backgroundColor: hex },
                    category.color === hex && styles.swatchSelected,
                  ]}
                />
              ))}
            </View>
          ) : null}

          <View style={styles.controls}>
            <View style={{ flex: 1 }}>
              <Field
                placeholder="Monthly budget ($)"
                value={value}
                onChangeText={setValue}
                keyboardType="decimal-pad"
                style={{ marginBottom: 0 }}
              />
            </View>
            <Button label="Save" variant="secondary" onPress={save} disabled={!dirty} busy={upsert.isPending} />
            {budget ? (
              <Button
                label="Clear"
                variant="secondary"
                onPress={() => del.mutate(budget.id, { onSuccess: () => setValue('') })}
                busy={del.isPending}
              />
            ) : null}
          </View>

          {!isGlobal ? (
            <Button
              label="Delete category"
              variant="danger"
              onPress={() => deleteCategory.mutate(category.id)}
              busy={deleteCategory.isPending}
            />
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  listCard: { paddingVertical: 0, paddingHorizontal: 0, overflow: 'hidden' },
  accordionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  accordionBody: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: 16 },
  dot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  name: { flex: 1, fontWeight: '600', color: colors.text },
  controls: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  error: { color: colors.danger, marginTop: 6 },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatch: { width: 28, height: 28, borderRadius: 14 },
  swatchSelected: { borderWidth: 3, borderColor: colors.text },
  resetPhrase: { fontFamily: 'monospace', color: colors.text, fontWeight: '700' },
}));
