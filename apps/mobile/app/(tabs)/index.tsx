import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BarChart, LineChart } from 'react-native-gifted-charts';
import { Card, colors, Muted, Title } from '@/components/ui';
import {
  bruneiDayKey,
  bruneiMonthKey,
  bruneiMonthStartIso,
  formatMoney,
  formatMonthName,
} from '@/lib/format';
import { useMonthlyTotals, useThisMonthTransactions, useTopMerchants } from '@/lib/queries';

export default function Dashboard() {
  const { width } = useWindowDimensions();
  const chartWidth = Math.min(width, 720) - 88;

  const monthly = useMonthlyTotals();
  const thisMonthTx = useThisMonthTransactions();
  const topMerchants = useTopMerchants(8);

  const thisMonthKey = bruneiMonthKey(Date.now());
  const lastMonthKey = bruneiMonthKey(bruneiMonthStartIso(1));

  const thisMonth = monthly.data?.find((r) => r.month.startsWith(thisMonthKey.slice(0, 7)));
  const lastMonth = monthly.data?.find((r) => r.month.startsWith(lastMonthKey.slice(0, 7)));

  const delta =
    thisMonth && lastMonth && Number(lastMonth.total) > 0
      ? ((Number(thisMonth.total) - Number(lastMonth.total)) / Number(lastMonth.total)) * 100
      : null;

  // Sum parsed spends per Brunei day for the current month, day 1..today.
  const dailyData = useMemo(() => {
    const byDay = new Map<number, number>();
    for (const tx of thisMonthTx.data ?? []) {
      if (!tx.occurred_at || tx.amount === null) continue;
      const day = Number(bruneiDayKey(tx.occurred_at).slice(8));
      byDay.set(day, (byDay.get(day) ?? 0) + Number(tx.amount));
    }
    const today = Number(bruneiDayKey(Date.now()).slice(8));
    return Array.from({ length: today }, (_, i) => ({
      value: Math.round((byDay.get(i + 1) ?? 0) * 100) / 100,
      label: (i + 1) % 5 === 0 || i === 0 ? String(i + 1) : '',
    }));
  }, [thisMonthTx.data]);

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
        <Title>Top merchants</Title>
        {merchantBars.length > 0 ? (
          <BarChart
            data={merchantBars}
            width={chartWidth}
            height={200}
            barWidth={22}
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
});
