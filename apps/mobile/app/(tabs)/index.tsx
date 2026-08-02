import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { Card, Muted, Sheet, Title, WheelPicker } from '@/components/ui';
import {
  bruneiDayKey,
  bruneiMonthKey,
  formatMonthName,
} from '@/lib/format';
import { kvGet } from '@/lib/kvStore';
import {
  useBudgets,
  useCategories,
  useMonthlyTotals,
  useProfile,
  useRecentMonthsTransactions,
  useThisMonthTransactions,
  useSubscriptions,
  useTransactionsForPeriod,
  usePullToRefresh,
} from '@/lib/queries';
import { maybeOverspendAlert, syncScheduledNotifications } from '@/lib/notifications';
import {
  dismissSetupCard,
  getCompletedSteps,
  isSetupCardDismissed,
  nextIncompleteStep,
  onboardedKey,
  SETUP_STEP_COUNT,
} from '@/lib/onboarding';
import { usePrivacy } from '@/lib/privacy';
import { usePrimaryCurrency } from '@/lib/primaryCurrency';
import { detectRecurring } from '@/lib/recurring';
import { useSession } from '@/lib/session';
import {
  cycleLabel,
  dueLabel,
  mergeSubscriptions,
  monthlyTotal,
} from '@/lib/subscriptions';
import { themedStyles, useTheme } from '@/lib/theme';

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
  const router = useRouter();
  const { session } = useSession();
  // Optimistic: assume set up, so the card never flashes for existing users.
  const [onboarded, setOnboarded] = useState(true);
  const [cardDismissed, setCardDismissed] = useState(true);
  const [setupSteps, setSetupSteps] = useState<number[]>([]);

  // On focus, not just on mount: the flag and the step ticks are written on
  // the setup screen, so a card read once at mount would still be advertising
  // "step 3 of 5" after the user came back having finished all five.
  useFocusEffect(
    useCallback(() => {
      const uid = session?.user.id;
      if (!uid) return;
      let live = true;
      void (async () => {
        const [flag, dismissed, steps] = await Promise.all([
          kvGet(onboardedKey(uid)),
          isSetupCardDismissed(uid),
          getCompletedSteps(uid),
        ]);
        if (!live) return;
        setOnboarded(flag === '1');
        setCardDismissed(dismissed);
        setSetupSteps(steps);
      })();
      return () => {
        live = false;
      };
    }, [session?.user.id]),
  );

  // Capture setup is the reason to use this app, so the prompt stays — but as
  // a card the user can dismiss for good, not a gate (HANDOFF §22).
  const showSetupCard = !onboarded && !cardDismissed;
  const setupResumeAt = nextIncompleteStep(setupSteps);

  async function dismissSetup() {
    setCardDismissed(true);
    if (session?.user.id) await dismissSetupCard(session.user.id);
  }

  const { currency: primaryCurrency } = usePrimaryCurrency();
  const profile = useProfile();
  const monthly = useMonthlyTotals();
  const thisMonthTx = useThisMonthTransactions();
  const categories = useCategories();
  const budgets = useBudgets();
  const recentTx = useRecentMonthsTransactions(6);
  const subscriptions = useSubscriptions();
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
  // The multi-currency note below the donut. Collapsed by default: it is
  // standing context, not news, and three lines of it under the chart pulled
  // the eye away from the donut and legend every single time the tab opened.
  const [currencyNoteOpen, setCurrencyNoteOpen] = useState(false);

  const userId = session?.user.id;

  const thisMonthData = monthly.data?.find(
    (r) => r.month.startsWith(thisMonthKey.slice(0, 7)) && r.currency === primaryCurrency,
  );
  const income = profile.data?.monthly_income == null ? null : Number(profile.data.monthly_income);
  // Income comparison only makes sense for BND
  const effectiveIncome = primaryCurrency === 'BND' ? income : null;

  // Count excluded (non-primary-currency) transactions for the note
  const excludedCurrencies = useMemo(() => {
    const others = new Set<string>();
    for (const tx of periodTx.data ?? []) {
      if (tx.currency !== primaryCurrency) others.add(tx.currency);
    }
    return [...others].sort();
  }, [periodTx.data, primaryCurrency]);

  // ---- Hero donut: category spend vs income / period ----------------------
  const donut = useMemo(() => {
    const byCategory = new Map<string | null, number>();
    let spent = 0;
    for (const tx of periodTx.data ?? []) {
      if (tx.amount === null || tx.currency !== primaryCurrency) continue;
      byCategory.set(tx.category_id, (byCategory.get(tx.category_id) ?? 0) + Number(tx.amount));
      spent += Number(tx.amount);
    }
    const named = Array.from(byCategory.entries())
      .map(([id, value]) => {
        const catIndex = id === null ? -1 : (categories.data?.findIndex((c) => c.id === id) ?? -1);
        const cat = catIndex >= 0 ? categories.data![catIndex] : undefined;
        return {
          key: id ?? 'uncategorized',
          name: id === null ? 'Uncategorized' : (cat?.name ?? 'Unknown'),
          dbColor: id === null ? null : (cat?.color ?? null),
          catIndex,
          value,
        };
      })
      .sort((a, b) => b.value - a.value);
    const slices: Slice[] = named.slice(0, 5).map((c) => ({
      key: c.key,
      name: c.name,
      value: c.value,
      color: c.dbColor ?? colors.chartCategories[Math.max(c.catIndex, 0) % colors.chartCategories.length]!,
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
    const remaining = effectiveIncome !== null && !isYearMode ? effectiveIncome - spent : null;
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
  }, [periodTx.data, categories.data, colors, effectiveIncome, isYearMode, primaryCurrency]);

  const selectedSlice = donut.slices.find((s) => s.key === selected) ?? null;
  const pctBase = effectiveIncome !== null && !isYearMode ? effectiveIncome : donut.spent;

  function toggleSelect(key: string) {
    setSelected((cur) => (cur === key ? null : key));
  }

  // ---- Budget progress (always current month) -----------------------------
  const budgetProgress = useMemo(() => {
    if (!budgets.data?.length) return { items: [], hiddenCurrencies: new Set<string>() };
    const spentByCategory = new Map<string, number>();
    for (const tx of thisMonthTx.data ?? []) {
      if (!tx.category_id || tx.amount === null || tx.currency !== primaryCurrency) continue;
      spentByCategory.set(tx.category_id, (spentByCategory.get(tx.category_id) ?? 0) + Number(tx.amount));
    }
    const hiddenCurrencies = new Set<string>();
    const items = budgets.data
      .filter((b) => {
        if (b.currency !== primaryCurrency) { hiddenCurrencies.add(b.currency); return false; }
        return true;
      })
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
    return { items, hiddenCurrencies };
  }, [budgets.data, thisMonthTx.data, categories.data, colors, primaryCurrency]);

  const recurring = useMemo(() => detectRecurring(recentTx.data ?? []).slice(0, 6), [recentTx.data]);

  // The subscriptions card shows both halves at once: rows the user declared,
  // each carrying whichever detected cluster it matches, then the clusters
  // nobody has claimed as suggestions. Display-only — see lib/subscriptions.ts.
  // Cancelled rows are dropped here rather than at the total: they are excluded
  // from the figure either way, and listing what you no longer pay for under a
  // monthly cost reads as a contradiction. They stay on the full screen.
  const subscriptionItems = useMemo(
    () =>
      mergeSubscriptions(subscriptions.data ?? [], recurring, bruneiDayKey(Date.now())).filter(
        (i) => i.status !== 'cancelled',
      ),
    [subscriptions.data, recurring],
  );
  const subsMonthlyTotal = monthlyTotal(subscriptionItems, primaryCurrency);

  useEffect(() => {
    if (!userId || thisMonthTx.isLoading || recentTx.isLoading) return;
    void syncScheduledNotifications({
      userId,
      spentThisMonth: thisMonthData ? Number(thisMonthData.total) : 0,
      income,
    });
  }, [userId, thisMonthData, income, thisMonthTx.isLoading, recentTx.isLoading]);

  useEffect(() => {
    if (!userId || budgetProgress.items.length === 0) return;
    void maybeOverspendAlert(userId, budgetProgress.items);
  }, [userId, budgetProgress]);

  const periodLabel = isYearMode ? 'this year' : 'this month';
  const saved = effectiveIncome !== null && !isYearMode ? effectiveIncome - donut.spent : null;

  return (
    <>
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* ---- Capture setup: prominent, resumable, dismissible ---- */}
      {showSetupCard ? (
        <View
          style={[styles.captureBanner, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}
        >
          <Pressable
            style={styles.captureBannerMain}
            onPress={() => router.push('/(tabs)/settings/shortcut-setup')}
          >
            <Ionicons name="flash-outline" size={15} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.captureBannerText, { color: colors.primary }]}>
                {setupResumeAt && setupSteps.length > 0
                  ? `Finish automatic capture — step ${setupResumeAt} of ${SETUP_STEP_COUNT}`
                  : 'Set up automatic capture — every bank SMS logs itself'}
              </Text>
              <Text style={[styles.captureBannerSub, { color: colors.primary }]}>
                {setupSteps.length > 0 ? 'Your progress is saved' : 'About 5 minutes, one time'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={dismissSetup}
            hitSlop={10}
            accessibilityLabel="Dismiss capture setup prompt"
          >
            <Ionicons name="close" size={16} color={colors.primary} />
          </Pressable>
        </View>
      ) : null}

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
                      {(() => { const s = money(selectedSlice.value, primaryCurrency); return <Text style={[styles.centerValue, { fontSize: donutFontSize(s) }]} numberOfLines={1} adjustsFontSizeToFit>{s}</Text>; })()}
                      <Muted>
                        {pctBase > 0
                          ? `${Math.round((selectedSlice.value / pctBase) * 100)}% of ${effectiveIncome !== null && !isYearMode ? 'income' : 'spending'}`
                          : ''}
                      </Muted>
                    </>
                  ) : effectiveIncome !== null && !isYearMode ? (
                    <>
                      <Text style={styles.centerLabel}>
                        {donut.remaining !== null && donut.remaining < 0 ? 'Over income' : 'Remaining'}
                      </Text>
                      {(() => { const s = money(Math.abs(donut.remaining ?? 0), primaryCurrency); return <Text style={[styles.centerValue, { fontSize: donutFontSize(s) }, donut.remaining !== null && donut.remaining < 0 && { color: colors.danger }]} numberOfLines={1} adjustsFontSizeToFit>{s}</Text>; })()}
                      <Muted>{`of ${money(effectiveIncome, primaryCurrency)}`}</Muted>
                    </>
                  ) : (
                    <>
                      <Text style={styles.centerLabel}>Spent</Text>
                      {(() => { const s = money(donut.spent, primaryCurrency); return <Text style={[styles.centerValue, { fontSize: donutFontSize(s) }]} numberOfLines={1} adjustsFontSizeToFit>{s}</Text>; })()}
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
                  <Text style={styles.legendValue}>{money(s.value, primaryCurrency)}</Text>
                </Pressable>
              ))}
            </View>
            {income === null && !isYearMode && primaryCurrency === 'BND' ? (
              <Link href="/(tabs)/settings" asChild>
                <Pressable>
                  <Muted>Set your monthly income in Settings to see what's remaining →</Muted>
                </Pressable>
              </Link>
            ) : null}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Muted>No spending this {isYearMode ? 'year' : 'month'} yet.</Muted>
            <Muted>Capture a bank message or add one manually.</Muted>
          </View>
        )}
        {excludedCurrencies.length > 0 ? (
          <View style={styles.currencyNote}>
            {/* Header carries the one fact worth reading at a glance; the
                explanation and the way to change it sit behind the chevron. */}
            <Pressable
              onPress={() => setCurrencyNoteOpen((o) => !o)}
              style={styles.currencyNoteHead}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityState={{ expanded: currencyNoteOpen }}
              accessibilityLabel={`Only ${primaryCurrency} shown. ${currencyNoteOpen ? 'Collapse' : 'Expand'} for details.`}
            >
              <Ionicons name="information-circle-outline" size={14} color={colors.muted} />
              <Muted>{`Only ${primaryCurrency} shown`}</Muted>
              <Ionicons
                name={currencyNoteOpen ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={colors.muted}
              />
            </Pressable>
            {currencyNoteOpen ? (
              <View style={styles.currencyNoteBody}>
                <Muted>{`You also have ${excludedCurrencies.join(' and ')} transactions recorded, which the donut above leaves out.`}</Muted>
                {/* Its own Link, not the whole block: with the block tappable,
                    a tap meant to collapse the note navigated to Settings. */}
                <Link href="/(tabs)/settings/appearance" asChild>
                  <Pressable hitSlop={6}>
                    <Text style={styles.currencyNoteLink}>
                      Change your primary currency in Settings &gt; Appearance →
                    </Text>
                  </Pressable>
                </Link>
              </View>
            ) : null}
          </View>
        ) : null}
      </Card>

      {/* ---- 2-stat strip ---- */}
      <View style={styles.statRow}>
        <Card style={styles.statCard}>
          <Muted>{`Saved ${periodLabel}`}</Muted>
          <Text style={[styles.statValue, saved !== null && saved < 0 && { color: colors.danger }]}>
            {saved !== null ? money(Math.abs(saved), primaryCurrency) : '—'}
          </Text>
          {saved !== null && saved < 0 ? <Muted>over budget</Muted> : null}
        </Card>
        <Card style={styles.statCard}>
          <Muted>{`Spent ${periodLabel}`}</Muted>
          <Text style={styles.statValue}>{money(donut.spent, primaryCurrency)}</Text>
        </Card>
      </View>

      {/* ---- Budgets (always current month) ---- */}
      {budgetProgress.items.length > 0 || budgetProgress.hiddenCurrencies.size > 0 ? (
        <Card>
          <Title>Budgets</Title>
          {budgetProgress.items.map((b) => {
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
                    {money(b.spent, primaryCurrency)} / {money(b.limit, primaryCurrency)}
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
                {over ? <Muted>{`Over by ${money(b.spent - b.limit, primaryCurrency)}`}</Muted> : null}
              </View>
            );
          })}
          {budgetProgress.hiddenCurrencies.size > 0 ? (
            <Link href="/(tabs)/settings/appearance" asChild>
              <Pressable style={{ marginTop: 8 }}>
                <Muted>{`You have budgets in ${[...budgetProgress.hiddenCurrencies].join(' and ')} that are not shown here.`}</Muted>
                <Muted>Switch your primary currency in Settings &gt; Appearance to view them.</Muted>
              </Pressable>
            </Link>
          ) : null}
        </Card>
      ) : null}

      {/* ---- Subscriptions: what you declared, merged with what we detected ---- */}
      <Card>
        <Pressable onPress={() => router.push('/subscriptions')} style={styles.subsHeader}>
          <View style={{ flex: 1 }}>
            <Title>Subscriptions</Title>
          </View>
          <Text style={styles.subsTotal}>{`${money(subsMonthlyTotal, primaryCurrency)}/mo`}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} style={{ marginLeft: 4 }} />
        </Pressable>
        {subscriptionItems.length === 0 ? (
          <Muted>
            Nothing recorded yet. Add what you subscribe to and it will be here whenever you forget
            what you are paying for.
          </Muted>
        ) : (
          <View style={{ marginTop: 4 }}>
            {subscriptionItems.slice(0, 5).map((item) => (
              <View key={item.key} style={styles.recurringRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.legendName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Muted>
                    {item.kind === 'suggestion'
                      ? `Detected · ${item.detected!.months.length} months`
                      : // No due date is the common case for something you
                        // recorded without knowing its billing day — saying so
                        // adds nothing, so the cycle stands alone.
                        [
                          cycleLabel(item.cycle, item.cycleDays),
                          ...(item.nextDueOn ? [`due ${dueLabel(item.daysUntilDue)}`] : []),
                        ].join(' · ')}
                  </Muted>
                </View>
                <Text style={styles.legendValue}>{money(item.amount, item.currency)}</Text>
              </View>
            ))}
          </View>
        )}
        <Pressable onPress={() => router.push('/subscriptions')} hitSlop={8}>
          <Text style={styles.subsLink}>
            {subscriptionItems.length > 5
              ? `View all ${subscriptionItems.length} →`
              : 'Manage subscriptions →'}
          </Text>
        </Pressable>
      </Card>
    </ScrollView>

    {/* Period picker sheet */}
    <Sheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title="Select period">
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
    </Sheet>
    </>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  captureBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  captureBannerMain: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  captureBannerSub: { fontSize: 11, opacity: 0.8, marginTop: 1 },
  captureBannerText: { flex: 1, fontSize: 13, fontWeight: '600' },
  heroHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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
  emptyState: { alignItems: 'center', gap: 6, paddingVertical: 16 },
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
  legendRowActive: { backgroundColor: colors.primary + '28' },
  currencyNote: { marginTop: 10 },
  currencyNoteHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  currencyNoteBody: { gap: 6, marginTop: 6, paddingLeft: 20 },
  currencyNoteLink: { color: colors.primary, fontSize: 13, lineHeight: 18 },
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
  recurringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    // Matches the 8 that `legendRow` reserves on its right, so a subscription
    // amount and a donut-category amount end at the same x. The left stays
    // flush: the legend's extra inset there is its colour dot, which these
    // rows have no equivalent of.
    paddingRight: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  subsHeader: { flexDirection: 'row', alignItems: 'center' },
  subsTotal: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
    fontVariant: ['tabular-nums'] as const,
  },
  subsLink: { color: colors.primary, fontWeight: '600', fontSize: 13, marginTop: 10 },
}));
