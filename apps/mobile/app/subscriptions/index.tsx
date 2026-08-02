import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, Centered, CollapsibleSection, Muted, Title } from '@/components/ui';
import { bruneiDayKey, bruneiMonthKey, formatDayDate } from '@/lib/format';
import { usePrimaryCurrency } from '@/lib/primaryCurrency';
import { usePrivacy } from '@/lib/privacy';
import { useCategories, useRecentMonthsTransactions, useSubscriptions } from '@/lib/queries';
import { detectRecurring } from '@/lib/recurring';
import {
  chargeInMonth,
  cycleLabel,
  dueLabel,
  lastCharge,
  mergeSubscriptions,
  monthlyTotal,
  type SubscriptionListItem,
} from '@/lib/subscriptions';
import { themedStyles, useTheme } from '@/lib/theme';

export default function SubscriptionsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { money } = usePrivacy();
  const { currency: primaryCurrency } = usePrimaryCurrency();

  const subs = useSubscriptions();
  const recentTx = useRecentMonthsTransactions();
  const categories = useCategories();

  // The count is the only part worth reading every visit; the explanation of
  // how the figure is built is standing context that was crowding the total.
  const [summaryOpen, setSummaryOpen] = useState(false);

  const todayKey = bruneiDayKey(Date.now());
  const thisMonthKey = bruneiMonthKey(Date.now());

  const items = useMemo(
    () => mergeSubscriptions(subs.data ?? [], detectRecurring(recentTx.data ?? []), todayKey),
    [subs.data, recentTx.data, todayKey],
  );

  const active = items.filter((i) => i.kind === 'declared' && i.status === 'active');
  const suggestions = items.filter((i) => i.kind === 'suggestion');
  const cancelled = items.filter((i) => i.status === 'cancelled');

  const total = monthlyTotal(items, primaryCurrency);
  const otherCurrencies = [
    ...new Set(active.filter((i) => i.currency !== primaryCurrency).map((i) => i.currency)),
  ];

  if (subs.isLoading) {
    return (
      <Centered>
        <ActivityIndicator size="large" />
      </Centered>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/subscriptions/edit')}
              hitSlop={8}
              accessibilityLabel="Add a subscription"
              style={{ paddingRight: 4 }}
            >
              <Ionicons name="add" size={28} color={colors.primary} />
            </Pressable>
          ),
        }}
      />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card>
          <Title>What you pay every month</Title>
          <Text style={styles.total}>{money(total, primaryCurrency)}</Text>
          {active.length === 0 ? (
            // Nothing to caveat when there is nothing recorded, so the empty
            // state stays a plain prompt rather than a chevron over "0 active
            // subscriptions".
            <Muted>Nothing added yet. Tap + to record what you are subscribed to.</Muted>
          ) : (
            <Pressable
              onPress={() => setSummaryOpen((o) => !o)}
              style={styles.summaryHead}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityState={{ expanded: summaryOpen }}
            >
              <Muted>{`${active.length} active subscription${active.length === 1 ? '' : 's'}`}</Muted>
              <Ionicons
                name={summaryOpen ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={colors.muted}
              />
            </Pressable>
          )}
          {active.length > 0 && summaryOpen ? (
            <View style={styles.summaryBody}>
              <Muted>Each one is converted to what it costs per month.</Muted>
              {otherCurrencies.length > 0 ? (
                <Muted>{`Not included: subscriptions in ${otherCurrencies.join(', ')}. Change your primary currency in Settings > Appearance to total those instead.`}</Muted>
              ) : null}
              <Muted>
                This is a record, not a budget. The real charge arrives as a transaction and is
                already counted against your monthly limit, so nothing here is added on top.
              </Muted>
            </View>
          ) : null}
        </Card>

        {active.map((item) => (
          <SubscriptionCard
            key={item.key}
            item={item}
            categoryName={
              categories.data?.find((c) => c.id === item.subscription?.category_id)?.name ?? null
            }
            thisMonthKey={thisMonthKey}
            recentTx={recentTx.data ?? []}
          />
        ))}

        {suggestions.length > 0 ? (
          <Card>
            <Title>Spotted in your spending</Title>
            <Muted>
              Same merchant, similar amount, seen in 3 or more months. Add one and it becomes a
              subscription you can price and date.
            </Muted>
            <View style={{ marginTop: 4 }}>
              {suggestions.map((s) => (
                <View key={s.key} style={styles.suggestionRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.suggestionName} numberOfLines={1}>
                      {s.name}
                    </Text>
                    <Muted>{`${s.detected?.months.length} months · ~${money(s.amount, s.currency)}/month`}</Muted>
                  </View>
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: '/subscriptions/edit',
                        params: {
                          name: s.name,
                          amount: String(s.amount),
                          currency: s.currency,
                          merchant: s.detected?.merchant ?? s.name,
                        },
                      })
                    }
                    hitSlop={8}
                    accessibilityLabel={`Add ${s.name} as a subscription`}
                    style={styles.addPill}
                  >
                    <Ionicons name="add" size={16} color={colors.onPrimary} />
                    <Text style={styles.addPillText}>Add</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {cancelled.length > 0 ? <CancelledSection items={cancelled} /> : null}
      </ScrollView>
    </>
  );
}

function SubscriptionCard({
  item,
  categoryName,
  thisMonthKey,
  recentTx,
}: {
  item: SubscriptionListItem;
  categoryName: string | null;
  thisMonthKey: string;
  recentTx: { occurred_at: string | null; amount: number | null; currency: string; merchant_normalized: string | null }[];
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { money } = usePrivacy();
  const sub = item.subscription!;

  const charged = chargeInMonth(sub, recentTx, thisMonthKey);
  const previous = charged ? null : lastCharge(sub, recentTx);
  const overdue = item.daysUntilDue !== null && item.daysUntilDue < 0;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/subscriptions/edit', params: { id: sub.id } })}
    >
      <Card>
        <View style={styles.cardHead}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            <Muted>{cycleLabel(item.cycle, item.cycleDays)}</Muted>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.amount}>{money(item.amount, item.currency)}</Text>
            {item.cycle !== 'monthly' ? (
              <Muted>{`${money(item.monthly, item.currency)}/month`}</Muted>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} style={{ marginLeft: 6 }} />
        </View>

        <View style={styles.badgeRow}>
          <Badge
            label={
              item.nextDueOn
                ? `${overdue ? 'Was due' : 'Due'} ${dueLabel(item.daysUntilDue)}`
                : 'No date set'
            }
            tone={overdue ? 'warning' : 'muted'}
          />
          {item.trialDaysLeft !== null && item.trialDaysLeft >= 0 ? (
            <Badge label={`Trial ends ${dueLabel(item.trialDaysLeft).toLowerCase()}`} tone="warning" />
          ) : null}
          {categoryName ? <Badge label={categoryName} /> : null}
          {sub.card_last4 ? <Badge label={`•${sub.card_last4}`} /> : null}
        </View>

        {/* Proof the money was captured: the charge counted toward the monthly
            limit is a real transaction, which is why this screen adds nothing. */}
        <Muted>
          {charged
            ? `Charged ${money(charged.amount, charged.currency)} on ${formatDayDate(charged.occurredAt)}. Already in your spending.`
            : previous
              ? `Not seen this month. Last captured charge was ${money(previous.amount, previous.currency)} on ${formatDayDate(previous.occurredAt)}.`
              : 'No captured charge matched to this yet.'}
        </Muted>

        {sub.notes ? <Text style={styles.notes}>{sub.notes}</Text> : null}
      </Card>
    </Pressable>
  );
}

function CancelledSection({ items }: { items: SubscriptionListItem[] }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { money } = usePrivacy();

  return (
    <Card>
      <CollapsibleSection title={`Cancelled (${items.length})`}>
        <View>
          <Muted>Kept so they stay out of the suggestions above, and so you can restore one.</Muted>
          {items.map((item) => (
            <Pressable
              key={item.key}
              onPress={() =>
                router.push({
                  pathname: '/subscriptions/edit',
                  params: { id: item.subscription!.id },
                })
              }
              style={styles.suggestionRow}
            >
              <Text style={[styles.suggestionName, { flex: 1, marginRight: 8 }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Muted>{money(item.amount, item.currency)}</Muted>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} style={{ marginLeft: 6 }} />
            </Pressable>
          ))}
        </View>
      </CollapsibleSection>
    </Card>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center', paddingBottom: 32 },
  total: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 6,
    fontVariant: ['tabular-nums'] as const,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center' },
  summaryHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryBody: { gap: 6, marginTop: 8 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  amount: { fontSize: 16, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] as const },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 10 },
  notes: { color: colors.muted, fontSize: 13, fontStyle: 'italic', marginTop: 6 },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  suggestionName: { color: colors.text, fontWeight: '600' },
  addPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  addPillText: { color: colors.onPrimary, fontWeight: '700', fontSize: 13 },
}));
