import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BarChart, LineChart, PieChart } from 'react-native-gifted-charts';
import { Card, colors, Muted, Title } from '@/components/ui';
import {
  bruneiDayKey,
  bruneiMonthKey,
  bruneiMonthStartIso,
  formatMoney,
  formatMonthName,
} from '@/lib/format';
import {
  useCategories,
  useMonthlyTotals,
  useThisMonthTransactions,
  useTopMerchants,
} from '@/lib/queries';

// Validated categorical palette (dataviz six-checks, light surface). Fixed
// order; used when a category has no color of its own. "Other" is muted.
const CATEGORY_PALETTE = ['#0A8F72', '#D9730D', '#4C6EF5', '#C2255C', '#9C36B5'];
const OTHER_COLOR = '#6B7A8C';

export default function Dashboard() {
  const { width } = useWindowDimensions();
  const chartWidth = Math.min(width, 720) - 88;

  const monthly = useMonthlyTotals();
  const thisMonthTx = useThisMonthTransactions();
  const topMerchants = useTopMerchants(8);
  const categories = useCategories();

  const thisMonthKey = bruneiMonthKey(Date.now());
  const lastMonthKey = bruneiMonthKey(bruneiMonthStartIso(1));

  const thisMonth = monthly.data?.find((r) => r.month.startsWith(thisMonthKey.slice(0, 7)));
  const lastMonth = monthly.data?.find((r) => r.month.startsWith(lastMonthKey.slice(0, 7)));

  const delta =
    thisMonth && lastMonth && Number(lastMonth.total) > 0
      ? ((Number(thisMonth.total) - Number(lastMonth.total)) / Number(lastMonth.total)) * 100
      : null;

  const dayOfMonth = Number(bruneiDayKey(Date.now()).slice(8));
  const avgPerDay = thisMonth ? Number(thisMonth.total) / dayOfMonth : 0;

  // This month's biggest merchant by spend.
  const topMerchantThisMonth = useMemo(() => {
    const byMerchant = new Map<string, number>();
    for (const tx of thisMonthTx.data ?? []) {
      if (!tx.merchant_normalized || tx.amount === null) continue;
      byMerchant.set(
        tx.merchant_normalized,
        (byMerchant.get(tx.merchant_normalized) ?? 0) + Number(tx.amount),
      );
    }
    let best: { name: string; total: number } | null = null;
    for (const [name, total] of byMerchant) {
      if (!best || total > best.total) best = { name, total };
    }
    return best;
  }, [thisMonthTx.data]);

  // Sum parsed spends per Brunei day for the current month, day 1..today.
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

  // Category breakdown, this month: top 5 categories + "Other" fold.
  const categoryBreakdown = useMemo(() => {
    const byCategory = new Map<string | null, number>();
    let total = 0;
    for (const tx of thisMonthTx.data ?? []) {
      if (tx.amount === null) continue;
      byCategory.set(tx.category_id, (byCategory.get(tx.category_id) ?? 0) + Number(tx.amount));
      total += Number(tx.amount);
    }
    const named = Array.from(byCategory.entries())
      .map(([id, value]) => {
        const cat = categories.data?.find((c) => c.id === id);
        return {
          name: id === null ? 'Uncategorized' : (cat?.name ?? 'Unknown'),
          dbColor: id === null ? null : (cat?.color ?? null),
          value,
        };
      })
      .sort((a, b) => b.value - a.value);
    const top = named.slice(0, 5).map((c, i) => ({
      ...c,
      color: c.dbColor ?? CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
    }));
    const rest = named.slice(5);
    if (rest.length > 0) {
      top.push({
        name: 'Other',
        dbColor: null,
        color: OTHER_COLOR,
        value: rest.reduce((s, c) => s + c.value, 0),
      });
    }
    return { slices: top, total };
  }, [thisMonthTx.data, categories.data]);

  // Monthly totals, oldest→newest, last 6 Brunei months.
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

  const merchantBars = useMemo(
    () =>
      (topMerchants.data ?? []).map((m) => ({
        value: Number(m.total),
        label: m.merchant_normalized.split(' ').slice(0, 2).join(' ').slice(0, 12),
      })),
    [topMerchants.data],
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.statRow}>
        <Card style={styles.statCard}>
          <Muted>{formatMonthName(thisMonthKey)}</Muted>
          <Text style={styles.statValue}>
            {formatMoney(thisMonth ? Number(thisMonth.total) : 0)}
          </Text>
          <Muted>{`${thisMonth?.tx_count ?? 0} transactions`}</Muted>
        </Card>
        <Card style={styles.statCard}>
          <Muted>vs {formatMonthName(lastMonthKey)}</Muted>
          <Text
            style={[
              styles.statValue,
              delta !== null && { color: delta > 0 ? colors.danger : colors.primary },
            ]}
          >
            {delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(0)}%`}
          </Text>
          <Muted>{formatMoney(lastMonth ? Number(lastMonth.total) : 0)} last month</Muted>
        </Card>
      </View>

      <View style={styles.statRow}>
        <Card style={styles.statCard}>
          <Muted>Average per day</Muted>
          <Text style={styles.statValue}>{formatMoney(avgPerDay)}</Text>
          <Muted>{`over ${dayOfMonth} day${dayOfMonth === 1 ? '' : 's'}`}</Muted>
        </Card>
        <Card style={styles.statCard}>
          <Muted>Top merchant this month</Muted>
          <Text style={styles.statValueSmall} numberOfLines={2}>
            {topMerchantThisMonth?.name ?? '—'}
          </Text>
          <Muted>{topMerchantThisMonth ? formatMoney(topMerchantThisMonth.total) : 'no spending yet'}</Muted>
        </Card>
      </View>

      <Card>
        <Title>Daily spend — {formatMonthName(thisMonthKey)}</Title>
        {dailyData.length > 0 ? (
          <LineChart
            data={dailyData}
            width={chartWidth}
            height={180}
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

      <Card>
        <Title>Where it went — {formatMonthName(thisMonthKey)}</Title>
        {categoryBreakdown.slices.length > 0 ? (
          <View style={styles.donutRow}>
            <PieChart
              data={categoryBreakdown.slices.map((s) => ({ value: s.value, color: s.color }))}
              donut
              radius={78}
              innerRadius={52}
              strokeWidth={2}
              strokeColor={colors.card}
              innerCircleColor={colors.card}
              centerLabelComponent={() => (
                <View style={{ alignItems: 'center' }}>
                  <Text style={styles.donutCenterValue}>
                    {formatMoney(categoryBreakdown.total)}
                  </Text>
                  <Muted>this month</Muted>
                </View>
              )}
            />
            <View style={styles.legend}>
              {categoryBreakdown.slices.map((s) => (
                <View key={s.name} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                  <Text style={styles.legendName} numberOfLines={1}>
                    {s.name}
                  </Text>
                  <Text style={styles.legendValue}>{formatMoney(s.value)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <Muted>No categorized spending this month yet.</Muted>
        )}
      </Card>

      <Card>
        <Title>Monthly totals</Title>
        {monthlyBars.length > 0 ? (
          <BarChart
            data={monthlyBars}
            width={chartWidth}
            height={160}
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

      <Card>
        <Title>Top merchants — all time</Title>
        {merchantBars.length > 0 ? (
          <BarChart
            data={merchantBars}
            width={chartWidth}
            height={200}
            barWidth={22}
            barBorderTopLeftRadius={4}
            barBorderTopRightRadius={4}
            frontColor={colors.primary}
            yAxisTextStyle={{ color: colors.muted, fontSize: 10 }}
            xAxisLabelTextStyle={{
              color: colors.muted,
              fontSize: 9,
              transform: [{ rotate: '35deg' }],
            }}
            rulesColor={colors.border}
            yAxisColor={colors.border}
            xAxisColor={colors.border}
            noOfSections={4}
            labelWidth={56}
          />
        ) : (
          <Muted>No merchant data yet — capture a bank message to get started.</Muted>
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  statRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1 },
  statValue: { fontSize: 24, fontWeight: '800', color: colors.text, marginVertical: 4 },
  statValueSmall: { fontSize: 16, fontWeight: '700', color: colors.text, marginVertical: 4 },
  donutRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 16 },
  donutCenterValue: { fontSize: 16, fontWeight: '800', color: colors.text },
  legend: { flex: 1, minWidth: 180, gap: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendName: { flex: 1, color: colors.text, fontSize: 13 },
  legendValue: { color: colors.muted, fontSize: 13, fontVariant: ['tabular-nums'] },
});
