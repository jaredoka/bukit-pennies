import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { Card, Muted, Title } from '@/components/ui';
import { bruneiMonthKey, formatMonthName } from '@/lib/format';
import { usePrivacy } from '@/lib/privacy';
import { useCategories, usePullToRefresh, useRecentMonthsTransactions } from '@/lib/queries';
import { themedStyles, useTheme } from '@/lib/theme';

const MONTHS_BACK = 6;
const STACK_CATEGORIES = 4; // top N categories get their own stack color

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
  const { money } = usePrivacy();

  const recentTx = useRecentMonthsTransactions(MONTHS_BACK);
  const categories = useCategories();
  const { refreshing, onRefresh } = usePullToRefresh();

  const insights = useMemo(
    () => buildInsights((recentTx.data ?? []) as Tx[]),
    [recentTx.data],
  );

  const categoryName = (id: string | null) => {
    if (id === null) return 'Uncategorized';
    return categories.data?.find((c) => c.id === id)?.name ?? 'Unknown';
  };
  const categoryColor = (id: string | null, fallbackIndex: number) => {
    const db = id === null ? null : categories.data?.find((c) => c.id === id)?.color;
    return db ?? colors.chartCategories[fallbackIndex % colors.chartCategories.length]!;
  };

  // ---- Stacked month bars: top categories + Other -------------------------
  const stackedBars = useMemo(() => {
    const topIds = insights.topCategoryIds.slice(0, STACK_CATEGORIES);
    return insights.months.map((m) => {
      const stacks = topIds
        .map((id, i) => ({
          value: m.byCategory.get(id) ?? 0,
          color: categoryColor(id, i),
        }))
        .filter((s) => s.value > 0);
      const other =
        m.total - topIds.reduce((s, id) => s + (m.byCategory.get(id) ?? 0), 0);
      if (other > 0.005) stacks.push({ value: other, color: colors.chartOther });
      return {
        stacks: stacks.length > 0 ? stacks : [{ value: 0, color: colors.border }],
        label: formatMonthName(m.key).split(' ')[0]!.slice(0, 3),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insights, categories.data, colors]);

  const cur = insights.months.at(-1);
  const prev = insights.months.at(-2);
  const momDelta = cur && prev && prev.total > 0 ? (cur.total - prev.total) / prev.total : null;

  const hasData = insights.months.some((m) => m.total > 0);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {!hasData ? (
        <Card>
          <Title>Insights</Title>
          <Muted>
            Nothing to analyze yet. Insights appear once you have transactions across a month or
            two. Capture a few bank messages to get started.
          </Muted>
        </Card>
      ) : (
        <>
          {/* ---- Month-over-month headline ---- */}
          <View style={styles.statRow}>
            <Card style={styles.statCard}>
              <Muted>This month</Muted>
              <Text style={styles.statValue}>{money(cur?.total ?? 0)}</Text>
            </Card>
            <Card style={styles.statCard}>
              <Muted>Last month</Muted>
              <Text style={styles.statValue}>{money(prev?.total ?? 0)}</Text>
            </Card>
            <Card style={styles.statCard}>
              <Muted>Change</Muted>
              {momDelta === null ? (
                <Text style={styles.statValue}>—</Text>
              ) : (
                <View style={styles.deltaWrap}>
                  <Ionicons
                    name={momDelta > 0 ? 'trending-up' : 'trending-down'}
                    size={16}
                    color={momDelta > 0 ? colors.danger : colors.primary}
                  />
                  <Text
                    style={[
                      styles.statValue,
                      { color: momDelta > 0 ? colors.danger : colors.primary },
                    ]}
                  >
                    {`${momDelta > 0 ? '+' : ''}${Math.round(momDelta * 100)}%`}
                  </Text>
                </View>
              )}
            </Card>
          </View>

          {/* ---- Category trends: stacked months ---- */}
          <Card>
            <Title>Where it goes, month by month</Title>
            <BarChart
              stackData={stackedBars}
              width={chartWidth}
              height={170}
              barWidth={26}
              barBorderTopLeftRadius={4}
              barBorderTopRightRadius={4}
              yAxisTextStyle={{ color: colors.muted, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: colors.muted, fontSize: 10 }}
              rulesColor={colors.border}
              yAxisColor={colors.border}
              xAxisColor={colors.border}
              noOfSections={4}
            />
            <View style={styles.legendWrap}>
              {insights.topCategoryIds.slice(0, STACK_CATEGORIES).map((id, i) => (
                <View key={id ?? 'null'} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: categoryColor(id, i) }]} />
                  <Text style={styles.legendText}>{categoryName(id)}</Text>
                </View>
              ))}
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.chartOther }]} />
                <Text style={styles.legendText}>Other</Text>
              </View>
            </View>
          </Card>

          {/* ---- Category deltas vs last month ---- */}
          {cur && prev ? (
            <Card>
              <Title>Categories vs last month</Title>
              {insights.categoryDeltas.length === 0 ? (
                <Muted>No category changes to show yet.</Muted>
              ) : (
                insights.categoryDeltas.map((d, i) => (
                  <View key={d.id ?? 'null'} style={styles.deltaRow}>
                    <View style={[styles.legendDot, { backgroundColor: categoryColor(d.id, i) }]} />
                    <Text style={styles.rowName} numberOfLines={1}>
                      {categoryName(d.id)}
                    </Text>
                    <Text style={styles.rowValue}>{money(d.current)}</Text>
                    <Text
                      style={[
                        styles.rowDelta,
                        { color: d.delta > 0 ? colors.danger : colors.primary },
                      ]}
                    >
                      {`${d.delta > 0 ? '+' : '−'}${money(Math.abs(d.delta))}`}
                    </Text>
                  </View>
                ))
              )}
            </Card>
          ) : null}

          {/* ---- Merchant movers ---- */}
          {insights.merchantMovers.length > 0 ? (
            <Card>
              <Title>Merchant movers</Title>
              <Muted>Biggest spending shifts vs last month.</Muted>
              <View style={{ marginTop: 8 }}>
                {insights.merchantMovers.map((m) => (
                  <View key={m.name} style={styles.deltaRow}>
                    <Ionicons
                      name={m.delta > 0 ? 'arrow-up' : 'arrow-down'}
                      size={14}
                      color={m.delta > 0 ? colors.danger : colors.primary}
                    />
                    <Text style={styles.rowName} numberOfLines={1}>
                      {m.name}
                    </Text>
                    <Text style={styles.rowValue}>{money(m.current)}</Text>
                    <Text
                      style={[
                        styles.rowDelta,
                        { color: m.delta > 0 ? colors.danger : colors.primary },
                      ]}
                    >
                      {`${m.delta > 0 ? '+' : '−'}${money(Math.abs(m.delta))}`}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

interface MonthBucket {
  key: string; // YYYY-MM-01
  total: number;
  byCategory: Map<string | null, number>;
  byMerchant: Map<string, number>;
}

function buildInsights(txs: Tx[]) {
  const buckets = new Map<string, MonthBucket>();
  for (const tx of txs) {
    if (!tx.occurred_at || tx.amount === null) continue;
    const key = bruneiMonthKey(tx.occurred_at);
    let b = buckets.get(key);
    if (!b) {
      b = { key, total: 0, byCategory: new Map(), byMerchant: new Map() };
      buckets.set(key, b);
    }
    const amount = Number(tx.amount);
    b.total += amount;
    b.byCategory.set(tx.category_id, (b.byCategory.get(tx.category_id) ?? 0) + amount);
    if (tx.merchant_normalized) {
      b.byMerchant.set(tx.merchant_normalized, (b.byMerchant.get(tx.merchant_normalized) ?? 0) + amount);
    }
  }
  const months = Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key));

  // Categories ranked by total across the whole window — keeps stack colors
  // stable from month to month.
  const categoryTotals = new Map<string | null, number>();
  for (const m of months) {
    for (const [id, v] of m.byCategory) {
      categoryTotals.set(id, (categoryTotals.get(id) ?? 0) + v);
    }
  }
  const topCategoryIds = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  const cur = months.at(-1);
  const prev = months.at(-2);

  const categoryDeltas = !cur || !prev
    ? []
    : Array.from(new Set([...cur.byCategory.keys(), ...prev.byCategory.keys()]))
        .map((id) => {
          const current = cur.byCategory.get(id) ?? 0;
          const previous = prev.byCategory.get(id) ?? 0;
          return { id, current, previous, delta: current - previous };
        })
        .filter((d) => Math.abs(d.delta) >= 0.01)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const merchantMovers = !cur || !prev
    ? []
    : Array.from(new Set([...cur.byMerchant.keys(), ...prev.byMerchant.keys()]))
        .map((name) => {
          const current = cur.byMerchant.get(name) ?? 0;
          const previous = prev.byMerchant.get(name) ?? 0;
          return { name, current, previous, delta: current - previous };
        })
        .filter((d) => Math.abs(d.delta) >= 1)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 8);

  return { months, topCategoryIds, categoryDeltas, merchantMovers };
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center' },
  statRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, paddingVertical: 12, paddingHorizontal: 12 },
  statValue: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 2, fontVariant: ['tabular-nums'] as const },
  deltaWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: colors.muted, fontSize: 12 },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowName: { flex: 1, color: colors.text, fontSize: 13 },
  rowValue: { color: colors.text, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] as const },
  rowDelta: { fontSize: 13, fontWeight: '700', minWidth: 76, textAlign: 'right', fontVariant: ['tabular-nums'] as const },
}));
