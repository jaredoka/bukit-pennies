import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
import { Card, Muted, PickerSheet, Title, WheelPicker } from '@/components/ui';
import {
  bruneiDayKey,
  bruneiMonthKey,
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
  useTransactionsForPeriod,
  usePullToRefresh,
} from '@/lib/queries';
import {
  getReminderPrefs,
  maybeOverspendAlert,
  setReminderPref,
  syncScheduledNotifications,
  type ReminderDays,
  type ReminderPrefs,
} from '@/lib/notifications';
import { usePrivacy } from '@/lib/privacy';
import { detectRecurring } from '@/lib/recurring';
import { themedStyles, useTheme } from '@/lib/theme';

/** off → on due day → 1 day before → 3 days before → off */
const REMINDER_CYCLE: (ReminderDays | null)[] = [null, 0, 1, 3];
const reminderLabel = (d: ReminderDays) => (d === 0 ? 'due day' : `${d}d before`);

const REMAINING_KEY = '__remaining__';

// Month wheel: index 0 = full year, indices 1–12 = specific month
const MONTH_ITEMS = [
  'All year',
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const YEAR_COUNT = 6;

/**
 * Fits the amount string on one line inside the donut's inner circle.
 * innerRadius=78 → usable text width ≈ 130px. SF Pro / Roboto Bold
 * tabular-nums chars are ~0.61× the font size wide.
 */
function donutFontSize(str: string): number {
  const usableWidth = 130;
  const charWidthRatio = 0.61;
  return Math.max(11, Math.min(22, Math.floor(usableWidth / (str.length * charWidthRatio))));
}

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
  const { hidden, toggle, money } = usePrivacy();

  // ---- Period filter -------------------------------------------------------
  const thisMonthKey = bruneiMonthKey(Date.now());
  const nowYear = Number(thisMonthKey.slice(0, 4));
  const nowMonth = Number(thisMonthKey.slice(5, 7));

  // Year wheel: YEAR_COUNT years ending at nowYear
  const yearItems = useMemo(
    () => Array.from({ length: YEAR_COUNT }, (_, i) => String(nowYear - (YEAR_COUNT - 1) + i)),
    [nowYear],
  );
  const [periodYearIdx, setPeriodYearIdx] = useState(YEAR_COUNT - 1); // current year
  const [periodMonthIdx, setPeriodMonthIdx] = useState(nowMonth);     // 1–12, or 0 = all year

  const isYearMode = periodMonthIdx === 0;
  const selectedYear = Number(yearItems[periodYearIdx]);

  const periodTx = useTransactionsForPeriod(selectedYear, isYearMode ? null : periodMonthIdx);

  const periodTitle = isYearMode
    ? yearItems[periodYearIdx]
    : formatMonthName(`${selectedYear}-${String(periodMonthIdx).padStart(2, '0')}-01`);

  // ---- Data queries -------------------------------------------------------
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [reminderPrefs, setReminderPrefs] = useState<ReminderPrefs>({});

  useEffect(() => {
    getReminderPrefs().then(setReminderPrefs);
  }, []);

  const thisMonthData = monthly.data?.find(
    (r) => r.month.startsWith(thisMonthKey.slice(0, 7)) && r.currency === 'BND',
  );
  const income = profile.data?.monthly_income == null ? null : Number(profile.data.monthly_income);

  // ---- Hero donut: category spend vs income / period ----------------------
  const donut = useMemo(() => {
    const byCategory = new Map<string | null, number>();
    let spent = 0;
    for (const tx of periodTx.data ?? []) {
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
    const remaining = income !== null && !isYearMode ? income - spent : null;
    if (remaining !== null && remaining > 0) {
      slices.push({
        key: REMAINING_KEY,
        name: 'Remaining',
        value: remaining,
        color: colors.border,
        isRemaining: true,
      });
    }
    return { slices, spent, remaining };
  }, [periodTx.data, categories.data, colors, income, isYearMode]);

  const selectedSlice = donut.slices.find((s) => s.key === selected) ?? null;
  const pctBase = income !== null && !isYearMode ? income : donut.spent;

  function toggleSelect(key: string) {
    setSelected((cur) => (cur === key ? null : key));
  }

  // ---- Daily spend (month view only) --------------------------------------
  const dayOfMonth = Number(bruneiDayKey(Date.now()).slice(8));
  const dailyData = useMemo(() => {
    if (isYearMode) return [];
    const byDay = new Map<number, number>();
    for (const tx of periodTx.data ?? []) {
      if (!tx.occurred_at || tx.amount === null) continue;
      const day = Number(bruneiDayKey(tx.occurred_at).slice(8));
      byDay.set(day, (byDay.get(day) ?? 0) + Number(tx.amount));
    }
    return Array.from({ length: dayOfMonth }, (_, i) => ({
      value: Math.round((byDay.get(i + 1) ?? 0) * 100) / 100,
      label: (i + 1) % 5 === 0 || i === 0 ? String(i + 1) : '',
    }));
  }, [periodTx.data, dayOfMonth, isYearMode]);

  // ---- Budget progress (always current month) -----------------------------
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

  useEffect(() => {
    if (thisMonthTx.isLoading || recentTx.isLoading) return;
    void syncScheduledNotifications({
      recurring,
      spentThisMonth: thisMonthData ? Number(thisMonthData.total) : 0,
      income,
    });
  }, [recurring, thisMonthData, income, thisMonthTx.isLoading, recentTx.isLoading]);

  useEffect(() => {
    if (budgetProgress.length === 0) return;
    void maybeOverspendAlert(budgetProgress);
  }, [budgetProgress]);

  async function cycleReminder(merchant: string) {
    const current = reminderPrefs[merchant]?.daysBefore ?? null;
    const next = REMINDER_CYCLE[(REMINDER_CYCLE.indexOf(current) + 1) % REMINDER_CYCLE.length]!;
    setReminderPrefs(await setReminderPref(merchant, next));
  }

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

  const periodLabel = isYearMode ? 'this year' : 'this month';
  const saved = income !== null && !isYearMode ? income - donut.spent : null;

  return (
    <>
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* ---- Hero: interactive donut + period wheels ---- */}
      <Card>
        <View style={styles.heroHeader}>
          <Pressable onPress={() => setPickerOpen(true)} style={styles.periodPill} hitSlop={8}>
            <Text style={styles.periodPillText}>{periodTitle}</Text>
            <Ionicons name="chevron-down" size={14} color={colors.muted} />
          </Pressable>
          <View style={styles.heroActions}>
            <Pressable onPress={toggle} hitSlop={8} accessibilityLabel={hidden ? 'Show amounts' : 'Hide amounts'}>
              <Ionicons name={hidden ? 'eye-off' : 'eye'} size={22} color={colors.muted} />
            </Pressable>
          </View>
        </View>

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
                      {(() => { const s = money(selectedSlice.value); return <Text style={[styles.centerValue, { fontSize: donutFontSize(s) }]}>{s}</Text>; })()}
                      <Muted>
                        {pctBase > 0
                          ? `${Math.round((selectedSlice.value / pctBase) * 100)}% of ${income !== null && !isYearMode ? 'income' : 'spending'}`
                          : ''}
                      </Muted>
                    </>
                  ) : income !== null && !isYearMode ? (
                    <>
                      <Text style={styles.centerLabel}>
                        {donut.remaining !== null && donut.remaining < 0 ? 'Over income' : 'Remaining'}
                      </Text>
                      {(() => { const s = money(Math.abs(donut.remaining ?? 0)); return <Text style={[styles.centerValue, { fontSize: donutFontSize(s) }, donut.remaining !== null && donut.remaining < 0 && { color: colors.danger }]}>{s}</Text>; })()}
                      <Muted>{`of ${money(income)}`}</Muted>
                    </>
                  ) : (
                    <>
                      <Text style={styles.centerLabel}>Spent</Text>
                      {(() => { const s = money(donut.spent); return <Text style={[styles.centerValue, { fontSize: donutFontSize(s) }]}>{s}</Text>; })()}
                      <Muted>{periodLabel}</Muted>
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
                  <Text style={styles.legendValue}>{money(s.value)}</Text>
                </Pressable>
              ))}
            </View>
            {income === null && !isYearMode ? (
              <Link href="/(tabs)/settings" asChild>
                <Pressable>
                  <Muted>Set your monthly income in Settings to see what's remaining →</Muted>
                </Pressable>
              </Link>
            ) : null}
          </View>
        ) : (
          <Muted>No spending this {isYearMode ? 'year' : 'month'} yet. Capture a bank message or add one manually.</Muted>
        )}
      </Card>

      {/* ---- 2-stat strip ---- */}
      <View style={styles.statRow}>
        <Card style={styles.statCard}>
          <Muted>{`Saved ${periodLabel}`}</Muted>
          <Text style={[styles.statValue, saved !== null && saved < 0 && { color: colors.danger }]}>
            {saved !== null ? money(Math.abs(saved)) : '—'}
          </Text>
          {saved !== null && saved < 0 ? <Muted>over budget</Muted> : null}
        </Card>
        <Card style={styles.statCard}>
          <Muted>{`Spent ${periodLabel}`}</Muted>
          <Text style={styles.statValue}>{money(donut.spent)}</Text>
        </Card>
      </View>

      {/* ---- Budgets (always current month) ---- */}
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
                    {money(b.spent)} / {money(b.limit)}
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
                {over ? <Muted>{`Over by ${money(b.spent - b.limit)}`}</Muted> : null}
              </View>
            );
          })}
        </Card>
      ) : null}

      {/* ---- Daily spend (month view only) ---- */}
      {!isYearMode ? (
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
      ) : null}

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
                  <Text style={styles.legendValue}>{money(m.total)}</Text>
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
          <Muted>No merchant data yet. Capture a bank message to get started.</Muted>
        )}
      </Card>

      {/* ---- Recurring, with per-item bill reminders ---- */}
      {recurring.length > 0 ? (
        <Card>
          <Title>Likely recurring</Title>
          <Muted>
            Same merchant, similar amount, seen in 3+ months. Tap the bell to be reminded before
            the next expected charge.
          </Muted>
          <View style={{ marginTop: 8 }}>
            {recurring.map((r) => {
              const pref = reminderPrefs[r.merchant];
              return (
                <View key={`${r.merchant}:${r.amount}`} style={styles.recurringRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.legendName} numberOfLines={1}>
                      {r.merchant}
                    </Text>
                    <Muted>{`${r.months.length} months · ~${money(r.amount, r.currency)}/month`}</Muted>
                  </View>
                  <Text style={styles.legendValue}>{money(r.total, r.currency)}</Text>
                  <Pressable
                    onPress={() => cycleReminder(r.merchant)}
                    hitSlop={8}
                    style={styles.bellWrap}
                    accessibilityLabel={`Reminder for ${r.merchant}`}
                  >
                    <Ionicons
                      name={pref ? 'notifications' : 'notifications-off-outline'}
                      size={18}
                      color={pref ? colors.primary : colors.muted}
                    />
                    {pref ? <Text style={styles.bellLabel}>{reminderLabel(pref.daysBefore)}</Text> : null}
                  </Pressable>
                </View>
              );
            })}
          </View>
        </Card>
      ) : null}
    </ScrollView>

    {/* Period picker sheet */}
    <PickerSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title="Select period">
      <View key={pickerOpen ? 'open' : 'closed'} style={styles.wheelsRow}>
        <View style={styles.wheelCol}>
          <WheelPicker
            items={MONTH_ITEMS}
            selectedIndex={periodMonthIdx}
            onSelect={setPeriodMonthIdx}
          />
        </View>
        <View style={styles.wheelDivider} />
        <View style={styles.wheelColNarrow}>
          <WheelPicker
            items={yearItems}
            selectedIndex={periodYearIdx}
            onSelect={setPeriodYearIdx}
          />
        </View>
      </View>
    </PickerSheet>
    </>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  heroHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  periodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  periodPillText: { fontSize: 18, fontWeight: '700', color: colors.text },
  wheelsRow: { flexDirection: 'row', alignItems: 'stretch', marginVertical: 8 },
  wheelCol: { flex: 3 },
  wheelColNarrow: { flex: 2 },
  wheelDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 8 },
  heroWrap: { alignItems: 'center', gap: 16 },
  center: { alignItems: 'center', width: 148 },
  centerLabel: { color: colors.muted, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  centerValue: { fontSize: 15, fontWeight: '800', color: colors.text, marginVertical: 2, textAlign: 'center', width: 140, fontVariant: ['tabular-nums'] as const },
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
  bellWrap: { alignItems: 'center', marginLeft: 10, minWidth: 44 },
  bellLabel: { color: colors.primary, fontSize: 10, marginTop: 2 },
  recurringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
}));
