import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Button, Card, Field, Muted, Title, WheelPicker } from '@/components/ui';
import { monthKeyOf } from '@/lib/budget';
import { bruneiMonthKey, formatMonthName } from '@/lib/format';
import { usePrimaryCurrency } from '@/lib/primaryCurrency';
import {
  useDeleteMonthBudget,
  useMonthBudgets,
  useProfile,
  useSaveMonthBudget,
  useUpdateProfile,
} from '@/lib/queries';
import { themedStyles } from '@/lib/theme';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function Budget() {
  const styles = useStyles();
  const profile = useProfile();
  const update = useUpdateProfile();
  const { currency: primaryCurrency } = usePrimaryCurrency();
  const monthBudgets = useMonthBudgets();
  const saveMonth = useSaveMonthBudget();
  const deleteMonth = useDeleteMonthBudget();

  const [draft, setDraft] = useState<string | null>(null);
  const [monthDraft, setMonthDraft] = useState<string | null>(null);

  // Default budget -----------------------------------------------------------
  const saved = profile.data?.monthly_income == null ? '' : String(Number(profile.data.monthly_income));
  const savedCurrency = profile.data?.monthly_income_currency ?? 'BND';
  const value = draft ?? saved;
  const parsed = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed > 0;

  // Per-month budgets --------------------------------------------------------
  const todayKey = bruneiMonthKey(Date.now());
  const thisYear = Number(todayKey.slice(0, 4));
  const thisMonth = Number(todayKey.slice(5, 7));
  // One year back and forward covers "fix last month" and "plan December"
  // without turning the wheel into a scroll through the decade.
  const yearItems = useMemo(
    () => Array.from({ length: 3 }, (_, i) => String(thisYear - 1 + i)),
    [thisYear],
  );
  const [yearIdx, setYearIdx] = useState(1);
  const [monthIdx, setMonthIdx] = useState(thisMonth - 1);

  const year = Number(yearItems[yearIdx]);
  const month = monthIdx + 1;
  const monthKey = monthKeyOf(year, month);
  const override = (monthBudgets.data ?? []).find((r) => r.month.slice(0, 10) === monthKey) ?? null;
  const monthLabel = formatMonthName(monthKey);

  const monthValue = monthDraft ?? (override === null ? '' : String(Number(override.amount)));
  const monthParsed = Number(monthValue);
  const monthValid = monthValue.trim() !== '' && Number.isFinite(monthParsed) && monthParsed > 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Card>
        <Title>Monthly budget</Title>
        <Muted>
          The figure used for a month with no budget of its own. Money recorded In for a month
          takes priority over this, and a budget set for a specific month takes priority over both.
        </Muted>
        <View style={{ marginTop: 12 }}>
          <Field
            label={`Amount (${primaryCurrency})`}
            value={value}
            onChangeText={setDraft}
            placeholder="e.g. 2500"
            keyboardType="decimal-pad"
          />
          {savedCurrency !== primaryCurrency && saved !== '' ? (
            <Muted>{`Currently recorded as ${savedCurrency} ${saved}. Saving records ${primaryCurrency}.`}</Muted>
          ) : null}
          <Button
            label={update.isSuccess && draft === null ? 'Saved ✓' : `Set ${primaryCurrency} amount`}
            onPress={() => {
              update.mutate(
                { monthly_income: parsed, monthly_income_currency: primaryCurrency },
                { onSuccess: () => setDraft(null) },
              );
            }}
            disabled={!valid || (value === saved && savedCurrency === primaryCurrency)}
            busy={update.isPending}
          />
          {update.error ? <Muted>{update.error.message}</Muted> : null}
        </View>
      </Card>

      <Card>
        <Title>Budget for one month</Title>
        <Muted>
          A Christmas month can cost more than a quiet one. Leave a month alone and it keeps using
          the figure above.
        </Muted>

        <View style={styles.wheelsRow}>
          <View style={styles.wheelCol}>
            <WheelPicker items={MONTH_NAMES} selectedIndex={monthIdx} onSelect={setMonthIdx} />
          </View>
          <View style={styles.wheelDivider} />
          <View style={styles.wheelColNarrow}>
            <WheelPicker items={yearItems} selectedIndex={yearIdx} onSelect={setYearIdx} />
          </View>
        </View>

        <Muted>
          {override !== null
            ? `${monthLabel}: ${override.currency} ${Number(override.amount)}`
            : `${monthLabel}: using the monthly budget`}
        </Muted>

        <View style={{ marginTop: 12 }}>
          <Field
            label={`Amount (${primaryCurrency})`}
            value={monthValue}
            onChangeText={setMonthDraft}
            placeholder="e.g. 500"
            keyboardType="decimal-pad"
          />
          <Button
            label={`Set ${monthLabel}`}
            onPress={() =>
              saveMonth.mutate(
                { month: monthKey, amount: monthParsed, currency: primaryCurrency },
                { onSuccess: () => setMonthDraft(null) },
              )
            }
            disabled={!monthValid}
            busy={saveMonth.isPending}
          />
          {override !== null ? (
            <Pressable
              onPress={() => deleteMonth.mutate(monthKey, { onSuccess: () => setMonthDraft(null) })}
              hitSlop={8}
              style={{ marginTop: 12 }}
            >
              <Muted>Use the monthly budget for this month</Muted>
            </Pressable>
          ) : null}
          {saveMonth.error ? <Muted>{saveMonth.error.message}</Muted> : null}
          {deleteMonth.error ? <Muted>{deleteMonth.error.message}</Muted> : null}
        </View>
      </Card>
    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  wheelsRow: { flexDirection: 'row', alignItems: 'stretch', marginVertical: 8 },
  wheelCol: { flex: 3 },
  wheelColNarrow: { flex: 2 },
  wheelDivider: { width: 1, backgroundColor: colors.border, marginVertical: 8 },
}));
