import Ionicons from '@expo/vector-icons/Ionicons';
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
import { BarChart } from 'react-native-gifted-charts';
import { Card, Muted, Sheet, Title, WheelPicker } from '@/components/ui';
import { bruneiParts } from '@/lib/format';
import { usePrivacy } from '@/lib/privacy';
import { usePrimaryCurrency } from '@/lib/primaryCurrency';
import {
  useCategories,
  useEarliestTransactionYear,
  usePullToRefresh,
  useTransactionsForPeriod,
} from '@/lib/queries';
import { themedStyles, useTheme } from '@/lib/theme';

const STACK_CATEGORIES = 4; // top N categories get their own stack color
const MERCHANT_ROWS = 10;
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Gap between bars. Twelve months have to fit without scrolling — the point of
// the chart is the shape of the whole year at a glance — so the bar width is
// derived from the space left over rather than fixed.
const BAR_SPACING = 6;

type Tx = {
  occurred_at: string | null;
  amount: number | string | null;
  category_id: string | null;
  merchant_normalized: string | null;
};

export default function Insights() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const chartWidth = Math.min(width, 720) - 88;
  const barWidth = Math.max(8, Math.floor((chartWidth - BAR_SPACING * 13) / 12));
  const { money } = usePrivacy();
  const { currency: primaryCurrency } = usePrimaryCurrency();

  const currentYear = bruneiParts(Date.now()).year;
  const [year, setYear] = useState(currentYear);
  const [pickerOpen, setPickerOpen] = useState(false);

  const earliestYear = useEarliestTransactionYear();
  // Oldest transaction year through the current one. Before that query lands
  // the list is just this year, so the picker is never empty.
  const yearItems = useMemo(() => {
    const first = Math.min(earliestYear.data ?? currentYear, currentYear);
    return Array.from({ length: currentYear - first + 1 }, (_, i) => String(first + i));
  }, [earliestYear.data, currentYear]);
  const yearIdx = Math.max(0, yearItems.indexOf(String(year)));

  const yearTx = useTransactionsForPeriod(year, null);
  const categories = useCategories();
  const { refreshing, onRefresh } = usePullToRefresh();

  const filteredTx = useMemo(
    () => (yearTx.data ?? []).filter((tx) => tx.currency === primaryCurrency),
    [yearTx.data, primaryCurrency],
  );

  const insights = useMemo(() => buildYearInsights(filteredTx as Tx[]), [filteredTx]);

  const categoryName = (id: string | null) => {
    if (id === null) return 'Uncategorized';
    return categories.data?.find((c) => c.id === id)?.name ?? 'Unknown';
  };
  const categoryColor = (id: string | null) => {
    const idx = id === null ? -1 : (categories.data?.findIndex((c) => c.id === id) ?? -1);
    const db = idx >= 0 ? categories.data![idx]!.color : null;
    return db ?? colors.chartCategories[Math.max(idx, 0) % colors.chartCategories.length]!;
  };

  // ---- Stacked month bars: top categories + Other -------------------------
  // Always twelve, so the chart keeps the same shape all year and past years
  // look the same as the current one. Months with no spending draw as nothing.
  const stackedBars = useMemo(() => {
    const topIds = insights.topCategoryIds.slice(0, STACK_CATEGORIES);
    return insights.months.map((m, i) => {
      const stacks = topIds
        .map((id) => ({ value: m.byCategory.get(id) ?? 0, color: categoryColor(id) }))
        .filter((s) => s.value > 0);
      const other = m.total - topIds.reduce((s, id) => s + (m.byCategory.get(id) ?? 0), 0);
      if (other > 0.005) stacks.push({ value: other, color: colors.chartOther });
      return {
        stacks: stacks.length > 0 ? stacks : [{ value: 0, color: colors.border }],
        label: MONTH_LABELS[i]!,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insights, categories.data, colors]);

  const hasData = insights.months.some((m) => m.total > 0);

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* ---- Hero: the year's spending, month by month ---- */}
        <Card>
          <View style={styles.heroHeader}>
            <Title>Spending by months</Title>
            <Pressable
              onPress={() => setPickerOpen(true)}
              style={styles.yearPill}
              hitSlop={8}
              accessibilityLabel={`Year ${year}. Change year`}
            >
              <Text style={styles.yearPillText}>{year}</Text>
              <Ionicons name="chevron-down" size={14} color={colors.muted} />
            </Pressable>
          </View>

          {!hasData ? (
            <Muted>
              {`Nothing to show for ${year}. Capture a few bank messages, or pick another year.`}
            </Muted>
          ) : (
            <>
              <BarChart
                stackData={stackedBars}
                width={chartWidth}
                height={170}
                barWidth={barWidth}
                spacing={BAR_SPACING}
                initialSpacing={BAR_SPACING}
                barBorderTopLeftRadius={0}
                barBorderTopRightRadius={0}
                yAxisTextStyle={{ color: colors.muted, fontSize: 10 }}
                xAxisLabelTextStyle={{ color: colors.muted, fontSize: 9 }}
                rulesColor={colors.border}
                yAxisColor={colors.border}
                xAxisColor={colors.border}
                noOfSections={4}
              />
              <View style={styles.legendWrap}>
                {insights.topCategoryIds.slice(0, STACK_CATEGORIES).map((id) => (
                  <View key={id ?? 'null'} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: categoryColor(id) }]} />
                    <Text style={styles.legendText}>{categoryName(id)}</Text>
                  </View>
                ))}
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.chartOther }]} />
                  <Text style={styles.legendText}>Other</Text>
                </View>
              </View>
            </>
          )}
        </Card>

        {hasData ? (
          <>
            {/* ---- Category totals for the year ---- */}
            <Card>
              <Title>Categories</Title>
              <Muted>{`Total spent in ${year}.`}</Muted>
              <View style={{ marginTop: 8 }}>
                {insights.categoryTotals.map((c) => (
                  <View key={c.id ?? 'null'} style={styles.row}>
                    <View style={[styles.legendDot, { backgroundColor: categoryColor(c.id) }]} />
                    <Text style={styles.rowName} numberOfLines={1}>
                      {categoryName(c.id)}
                    </Text>
                    <Text style={styles.rowValue}>{money(c.total, primaryCurrency)}</Text>
                  </View>
                ))}
              </View>
            </Card>

            {/* ---- Merchant totals for the year ---- */}
            {insights.merchantTotals.length > 0 ? (
              <Card>
                <Title>Merchants</Title>
                <Muted>{`Where the most went in ${year}.`}</Muted>
                <View style={{ marginTop: 8 }}>
                  {insights.merchantTotals.map((m) => (
                    <View key={m.name} style={styles.row}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {m.name}
                      </Text>
                      <Text style={styles.rowValue}>{money(m.total, primaryCurrency)}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      {/* Year picker sheet */}
      <Sheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title="Select year">
        <View key={pickerOpen ? 'open' : 'closed'} style={styles.wheelRow}>
          <WheelPicker
            items={yearItems}
            selectedIndex={yearIdx}
            onSelect={(i) => setYear(Number(yearItems[i]))}
          />
        </View>
      </Sheet>
    </>
  );
}

interface MonthBucket {
  total: number;
  byCategory: Map<string | null, number>;
}

function buildYearInsights(txs: Tx[]) {
  const months: MonthBucket[] = Array.from({ length: 12 }, () => ({
    total: 0,
    byCategory: new Map<string | null, number>(),
  }));
  const categoryTotalsMap = new Map<string | null, number>();
  const merchantTotalsMap = new Map<string, number>();

  for (const tx of txs) {
    if (!tx.occurred_at || tx.amount === null) continue;
    const amount = Number(tx.amount);
    const m = months[bruneiParts(tx.occurred_at).month - 1];
    if (!m) continue;
    m.total += amount;
    m.byCategory.set(tx.category_id, (m.byCategory.get(tx.category_id) ?? 0) + amount);
    categoryTotalsMap.set(tx.category_id, (categoryTotalsMap.get(tx.category_id) ?? 0) + amount);
    if (tx.merchant_normalized) {
      merchantTotalsMap.set(
        tx.merchant_normalized,
        (merchantTotalsMap.get(tx.merchant_normalized) ?? 0) + amount,
      );
    }
  }

  const categoryTotals = Array.from(categoryTotalsMap.entries())
    .map(([id, total]) => ({ id, total }))
    .filter((c) => c.total > 0.005)
    .sort((a, b) => b.total - a.total);

  // Ranked across the whole year, so a category keeps its stack colour from
  // month to month.
  const topCategoryIds = categoryTotals.map((c) => c.id);

  const merchantTotals = Array.from(merchantTotalsMap.entries())
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, MERCHANT_ROWS);

  return { months, topCategoryIds, categoryTotals, merchantTotals };
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center' },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  yearPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 2 },
  yearPillText: { fontSize: 18, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] as const },
  wheelRow: { marginVertical: 8 },
  legendWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: colors.muted, fontSize: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowName: { flex: 1, color: colors.text, fontSize: 13 },
  rowValue: { color: colors.text, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] as const },
}));
