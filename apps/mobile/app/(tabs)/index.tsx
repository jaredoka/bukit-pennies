import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { BarChart, LineChart, PieChart } from 'react-native-gifted-charts';
import { Card, Muted, Title } from '@/components/ui';
import {
  bruneiDayKey,
  bruneiMonthKey,
  bruneiMonthStartIso,
  formatMoney,
  formatMonthName,
} from '@/lib/format';
import {
  useBudgets,
  useCategories,
  useMonthlyTotals,
  useProfile,
  useRecentMonthsTransactions,
  useThisMonthTransactions,
  useTopMerchants,
  usePullToRefresh,
} from '@/lib/queries';
import { detectRecurring } from '@/lib/recurring';
import { themedStyles, useTheme } from '@/lib/theme';

const REMAINING_KEY = '__remaining__';

interface Slice {
  key: string;
  name: string;
  value: number;
  color: string;
  isRemaining: boolean;
}

export default function Dashboard() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const chartWidth = Math.min(width, 720) - 88;

  const profile = useProfile();
  const monthly = useMonthlyTotals();
  const thisMonthTx = useThisMonthTransactions();
  const topMerchants = useTopMerchants(6);
  const categories = useCategories();
  const budgets = useBudgets();
  const recentTx = useRecentMonthsTransactions(6);
  const { refreshing, onRefresh } = usePullToRefresh();

  const [selected, setSelected] = useState<string | null>(null);

  const thisMonthKey = bruneiMonthKey(Date.now());
  const lastMonthKey = bruneiMonthKey(bruneiMonthStartIso(1));
  const thisMonth = monthly.data?.find((r) => r.month.startsWith(thisMonthKey.slice(0, 7)));
  const lastMonth = monthly.data?.find((r) => r.month.startsWith(lastMonthKey.slice(0, 7)));
  const income = profile.data?.monthly_income == null ? null : Number(profile.data.monthly_income);

  // ---- Hero donut: category spend vs monthly income -----------------------
  const donut = useMemo(() => {
    const byCategory = new Map<string | null, number>();
    let spent = 0;
    for (const tx of thisMonthTx.data ?? []) {
      if (tx.amount === null) continue;
      byCategory.set(tx.category_id, (byCategory.get(tx.category_id) ?? 0) + Number(tx.amount));
      spent += Number(tx.amount);
    }
    const named = Array.from(byCategory.entries())
      .map(([id, value]) => {
        const cat = categories.data?.find((c) => c.id === id);
        return {
          key: id ?? 'uncategorized',
          name: id === null ? 'Uncategorized' : (cat?.name ?? 'Unknown'),
          dbColor: id === null ? null : (cat?.color ?? null),
          value,
        };
      })
      .sort((a, b) => b.value - a.value);
    const slices: Slice[] = named.slice(0, 5).map((c, i) => ({
      key: c.key,
      name: c.name,
      value: c.value,
      color: c.dbColor ?? colors.chartCategories[i % colors.chartCategories.length]!,
      isRemaining: false,
    }));
    const rest = named.slice(5);
    if (rest.length > 0) {
      slices.push({
        key: '__other__',
        name: 'Other',
        value: rest.reduce((s, c) => s + c.value, 0),
        color: colors.chartOther,
        isRemaining: false,
      });
    }
    const remaining = income !== null ? income - spent : null;
    if (remaining !== null && remaining > 0) {
      slices.push({
        key: REMAINING_KEY,
        name: 'Left to spend',
        value: remaining,
        color: colors.border,
        isRemaining: true,
      });
    }
    return { slices, spent, remaining };
  }, [thisMonthTx.data, categories.data, colors, income]);

  const selectedSlice = donut.slices.find((s) => s.key === selected) ?? null;
  // Percentage base: income when set, otherwise this month's spend.
  const pctBase = income ?? donut.spent;

  function toggleSelect(key: string) {
    setSelected((cur) => (cur === key ? null : key));
  }

  // ---- Secondary stats ----------------------------------------------------
  const delta =
    thisMonth && lastMonth && Number(lastMonth.total) > 0
      ? ((Number(thisMonth.total) - Number(lastMonth.total)) / Number(lastMonth.total)) * 100
      : null;
  const dayOfMonth = Number(bruneiDayKey(Date.now()).slice(8));
  const avgPerDay = thisMonth ? Number(thisMonth.total) / dayOfMonth : 0;

  const dailyData = useMemo(() => {
    const byDay = new Map<number, number>();
    for (const tx of thisMonthTx.data ?? []) {
      if (!tx.occurred_at || tx.amount === null) continue;
      const day = Number(bruneiDayKey(tx.occurred_at).slice(8));
      byDay.set(day, (byDay.get(day) ?? 0) + Number(tx.amount));
    }
    return Array.from({ length: dayOfMonth }, (_, i) => ({
      value: Math.round((byDay.get(i + 1) ?? 0) * 100) / 100,
      label: (i + 1) % 5 === 0 || i === 0 ? String(i + 1) : '',
    }));
  }, [thisMonthTx.data, dayOfMonth]);

  const budgetProgress = useMemo(() => {
    if (!budgets.data?.length) return [];
    const spentByCategory = new Map<string, number>();
    for (const tx of thisMonthTx.data ?? []) {
      if (!tx.category_id || tx.amount === null) continue;
      spentByCategory.set(tx.category_id, (spentByCategory.get(tx.category_id) ?? 0) + Number(tx.amount));
    }
    return budgets.data
      .map((b) => {
        const cat = categories.data?.find((c) => c.id === b.category_id);
        return {
          id: b.id,
          name: cat?.name ?? 'Unknown',
          color: cat?.color ?? colors.chartOther,
          spent: spentByCategory.get(b.category_id) ?? 0,
          limit: Number(b.amount),
        };
      })
      .sort((a, b) => b.spent / b.limit - a.spent / a.limit);
  }, [budgets.data, thisMonthTx.data, categories.data, colors]);

  const recurring = useMemo(() => detectRecurring(recentTx.data ?? []).slice(0, 6), [recentTx.data]);

  const monthlyBars = useMemo(
    () =>
      (monthly.data ?? [])
        .slice(0, 6)
        .reverse()
        .map((r) => ({
          value: Number(r.total),
          label: formatMonthName(r.month.slice(0, 7) + '-01').split(' ')[0],
        })),
    [monthly.data],
  );

  const merchantRanking = useMemo(() => {
    const rows = (topMerchants.data ?? []).map((m) => ({
      name: m.merchant_normalized,
      total: Number(m.total),
      count: m.tx_count,
    }));
    const max = rows.reduce((s, r) => Math.max(s, r.total), 0);
    return { rows, max };
  }, [topMerchants.data]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* ---- Hero: interactive donut ---- */}
      <Card>
        <Title>{formatMonthName(thisMonthKey)}</Title>
        {donut.slices.length > 0 ? (
          <View style={styles.heroWrap}>
            <PieChart
              data={donut.slices.map((s) => ({
                value: s.value,
                color: s.color,
                focused: s.key === selected,
                onPress: () => toggleSelect(s.key),
              }))}
              donut
              sectionAutoFocus
              radius={110}
              innerRadius={78}
              focusedPieIndex={selected === null ? -1 : donut.slices.findIndex((s) => s.key === selected)}
              strokeWidth={3}
              strokeColor={colors.card}
              innerCircleColor={colors.card}
              centerLabelComponent={() => (
                <Pressable style={styles.center} onPress={() => setSelected(null)}>
                  {selectedSlice ? (
                    <>
                      <Text style={styles.centerLabel} numberOfLines={1}>
                        {selectedSlice.name}
                      </Text>
                      <Text style={styles.centerValue}>{formatMoney(selectedSlice.value)}</Text>
                      <Muted>
                        {pctBase > 0
                          ? `${Math.round((selectedSlice.value / pctBase) * 100)}% of ${income !== null ? 'income' : 'spending'}`
                          : ''}
                      </Muted>
                    </>
                  ) : income !== null ? (
                    <>
                      <Text style={styles.centerLabel}>
                        {donut.remaining !== null && donut.remaining < 0 ? 'Over income' : 'Left to spend'}
                      </Text>
                      <Text
                        style={[
                          styles.centerValue,
                          donut.remaining !== null && donut.remaining < 0 && { color: colors.danger },
                        ]}
                      >
                        {formatMoney(Math.abs(donut.remaining ?? 0))}
                      </Text>
                      <Muted>{`of ${formatMoney(income)}`}</Muted>
                    </>
                  ) : (
                    <>
                      <Text style={styles.centerLabel}>Spent</Text>
                      <Text style={styles.centerValue}>{formatMoney(donut.spent)}</Text>
                      <Muted>this month</Muted>
                    </>
                  )}
                </Pressable>
              )}
            />
            <View style={styles.legend}>
              {donut.slices.map((s) => (
                <Pressable
                  key={s.key}
                  onPress={() => toggleSelect(s.key)}
                  style={[styles.legendRow, selected === s.key && styles.legendRowActive]}
                >
                  <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                  <Text
                    style={[styles.legendName, s.isRemaining && { color: colors.muted }]}
                    numberOfLines={1}
                  >
                    {s.name}
                  </Text>
                  <Text style={styles.legendValue}>{formatMoney(s.value)}</Text>
                </Pressable>
              ))}
            </View>
            {income === null ? (
              <Link href="/(tabs)/settings" asChild>
                <Pressable>
                  <Muted>Set your monthly income in Settings to see what’s left to spend →</Muted>
                </Pressable>
              </Link>
            ) : null}
          </View>
        ) : (
          <Muted>No spending this month yet — capture a bank message or add one manually.</Muted>
        )}
      </Card>

      {/* ---- Compact stat strip ---- */}
      <View style={styles.statRow}>
        <Card style={styles.statCard}>
          <Muted>Spent</Muted>
          <Text style={styles.statValue}>{formatMoney(donut.spent)}</Text>
        </Card>
        <Card style={styles.statCard}>
          <Muted>vs last month</Muted>
          <Text
            style={[
              styles.statValue,
              delta !== null && { color: delta > 0 ? colors.danger : colors.primary },
            ]}
          >
            {delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(0)}%`}
          </Text>
        </Card>
        <Card style={styles.statCard}>
          <Muted>Per day</Muted>
          <Text style={styles.statValue}>{formatMoney(avgPerDay)}</Text>
        </Card>
      </View>

      {/* ---- Budgets ---- */}
      {budgetProgress.length > 0 ? (
        <Card>
          <Title>Budgets</Title>
          {budgetProgress.map((b) => {
            const ratio = b.limit > 0 ? b.spent / b.limit : 0;
            const over = ratio > 1;
            return (
              <View key={b.id} style={styles.budgetRow}>
                <View style={styles.budgetHeader}>
                  <View style={[styles.legendDot, { backgroundColor: b.color }]} />
                  <Text style={styles.legendName} numberOfLines={1}>
                    {b.name}
                  </Text>
                  <Text style={[styles.budgetAmounts, over && { color: colors.danger }]}>
                    {formatMoney(b.spent)} / {formatMoney(b.limit)}
                  </Text>
                </View>
                <View style={styles.budgetTrack}>
                  <View
                    style={[
                      styles.budgetFill,
                      {
                        width: `${Math.min(ratio, 1) * 100}%`,
                        backgroundColor: over ? colors.danger : ratio > 0.85 ? colors.warning : colors.primary,
                      },
                    ]}
                  />
                </View>
                {over ? <Muted>{`Over by ${formatMoney(b.spent - b.limit)}`}</Muted> : null}
              </View>
            );
          })}
        </Card>
      ) : null}

      {/* ---- Trend ---- */}
      <Card>
        <Title>Daily spend</Title>
        {dailyData.some((d) => d.value > 0) ? (
          <LineChart
            data={dailyData}
            width={chartWidth}
            height={160}
            color={colors.primary}
            thickness={2}
            hideDataPoints
            areaChart
            startFillColor={colors.primary}
            startOpacity={0.25}
            endOpacity={0.02}
            yAxisTextStyle={{ color: colors.muted, fontSize: 10 }}
            xAxisLabelTextStyle={{ color: colors.muted, fontSize: 10 }}
            rulesColor={colors.border}
            yAxisColor={colors.border}
            xAxisColor={colors.border}
            noOfSections={4}
          />
        ) : (
          <Muted>No spending recorded this month yet.</Muted>
        )}
      </Card>

      {/* ---- Month history ---- */}
      <Card>
        <Title>Month by month</Title>
        {monthlyBars.length > 0 ? (
          <BarChart
            data={monthlyBars}
            width={chartWidth}
            height={150}
            barWidth={30}
            barBorderTopLeftRadius={4}
            barBorderTopRightRadius={4}
            frontColor={colors.primary}
            yAxisTextStyle={{ color: colors.muted, fontSize: 10 }}
            xAxisLabelTextStyle={{ color: colors.muted, fontSize: 10 }}
            rulesColor={colors.border}
            yAxisColor={colors.border}
            xAxisColor={colors.border}
            noOfSections={4}
          />
        ) : (
          <Muted>No monthly history yet.</Muted>
        )}
      </Card>

      {/* ---- Top merchants as a ranked list ---- */}
      <Card>
        <Title>Top merchants</Title>
        {merchantRanking.rows.length > 0 ? (
          merchantRanking.rows.map((m) => (
            <View key={m.name} style={styles.merchantRow}>
              <View style={{ flex: 1 }}>
                <View style={styles.merchantHeader}>
                  <Text style={styles.legendName} numberOfLines={1}>
                    {m.name}
                  </Text>
                  <Text style={styles.legendValue}>{formatMoney(m.total)}</Text>
                </View>
                <View style={styles.merchantTrack}>
                  <View
                    style={[
                      styles.merchantFill,
                      { width: `${merchantRanking.max > 0 ? (m.total / merchantRanking.max) * 100 : 0}%` },
                    ]}
                  />
                </View>
              </View>
            </View>
          ))
        ) : (
          <Muted>No merchant data yet — capture a bank message to get started.</Muted>
        )}
      </Card>

      {/* ---- Recurring ---- */}
      {recurring.length > 0 ? (
        <Card>
          <Title>Likely recurring</Title>
          <Muted>Same merchant, similar amount, seen in 3+ months.</Muted>
          <View style={{ marginTop: 8 }}>
            {recurring.map((r) => (
              <View key={`${r.merchant}:${r.amount}`} style={styles.recurringRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.legendName} numberOfLines={1}>
                    {r.merchant}
                  </Text>
                  <Muted>{`${r.months.length} months · ~${formatMoney(r.amount, r.currency)}/month`}</Muted>
                </View>
                <Text style={styles.legendValue}>{formatMoney(r.total, r.currency)}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  heroWrap: { alignItems: 'center', gap: 16 },
  center: { alignItems: 'center', paddingHorizontal: 8, maxWidth: 150 },
  centerLabel: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  centerValue: { fontSize: 24, fontWeight: '800', color: colors.text, marginVertical: 2 },
  legend: { alignSelf: 'stretch', gap: 2 },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  legendRowActive: { backgroundColor: colors.bg },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendName: { flex: 1, color: colors.text, fontSize: 13 },
  legendValue: { color: colors.muted, fontSize: 13, fontVariant: ['tabular-nums'] },
  statRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, paddingVertical: 12, paddingHorizontal: 12 },
  statValue: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 2 },
  budgetRow: { marginBottom: 12 },
  budgetHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  budgetAmounts: { color: colors.text, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  budgetTrack: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  budgetFill: { height: '100%', borderRadius: 4 },
  merchantRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  merchantHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  merchantTrack: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  merchantFill: { height: '100%', borderRadius: 3, backgroundColor: colors.primary },
  recurringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
}));
