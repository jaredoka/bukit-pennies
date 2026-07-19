import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Badge, Button, Card, Centered, Field, Muted, Title } from '@/components/ui';
import { formatTime, bruneiDayKey, formatDayHeading } from '@/lib/format';
import { useDeleteTransaction, usePullToRefresh, useReviewItems, useUpdateTransaction } from '@/lib/queries';
import type { TransactionRow } from '@/lib/types';
import { themedStyles } from '@/lib/theme';
import { usePrivacy } from '@/lib/privacy';

export default function ReviewInbox() {
  const styles = useStyles();
  const { data, isLoading } = useReviewItems();
  const { refreshing, onRefresh } = usePullToRefresh();

  if (isLoading) {
    return (
      <Centered>
        <ActivityIndicator size="large" />
      </Centered>
    );
  }

  const items = data ?? [];
  return (
    <FlatList
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) =>
        item.possible_duplicate_of ? <DuplicateItem tx={item} /> : <FixItem tx={item} />
      }
      ListEmptyComponent={
        <Centered>
          <Text style={{ fontSize: 40 }}>🎉</Text>
          <Muted>Inbox zero. Nothing needs review.</Muted>
        </Centered>
      }
    />
  );
}

/** needs_review row: fix fields inline → confirm as parsed, or discard. */
function FixItem({ tx }: { tx: TransactionRow }) {
  const styles = useStyles();
  const update = useUpdateTransaction();
  const del = useDeleteTransaction();
  const [amount, setAmount] = useState(tx.amount === null ? '' : String(tx.amount));
  const [merchant, setMerchant] = useState(tx.merchant ?? '');
  const [date, setDate] = useState(tx.occurred_at ? tx.occurred_at.slice(0, 16).replace('T', ' ') : '');

  const parsedAmount = Number.parseFloat(amount.replace(/,/g, ''));
  const amountOk = Number.isFinite(parsedAmount) && parsedAmount > 0;
  // Accept "YYYY-MM-DD HH:mm" (Brunei local) or empty.
  const dateMatch = date.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  const dateOk = date.trim() === '' || !!dateMatch;

  function confirm() {
    const occurredAt = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T${dateMatch[4]}:${dateMatch[5]}:00+08:00`
      : null;
    update.mutate({
      id: tx.id,
      patch: {
        amount: parsedAmount,
        merchant: merchant.trim() || null,
        merchant_normalized: merchant.trim() ? merchant.trim().toUpperCase().replace(/\s+/g, ' ') : null,
        occurred_at: occurredAt,
        parse_status: 'parsed',
        confidence: 1, // human-confirmed
      },
    });
  }

  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
        <Badge label="needs review" tone="warning" />
        <Badge label={tx.source} />
      </View>
      <Text style={styles.raw}>{tx.raw_text}</Text>
      <Field label="Amount (BND)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
      <Field label="Merchant" value={merchant} onChangeText={setMerchant} placeholder="MERCHANT NAME" />
      <Field
        label="Date (YYYY-MM-DD HH:mm, Brunei time, optional)"
        value={date}
        onChangeText={setDate}
        placeholder="2026-07-16 12:30"
        autoCapitalize="none"
      />
      {!dateOk ? <Text style={styles.error}>Date must look like 2026-07-16 12:30</Text> : null}
      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <Button
            label="Confirm as parsed"
            onPress={confirm}
            disabled={!amountOk || !dateOk}
            busy={update.isPending}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Discard" variant="danger" onPress={() => del.mutate(tx.id)} busy={del.isPending} />
        </View>
      </View>
    </Card>
  );
}

/** Row flagged as a possible near-duplicate: merge (drop this copy) or keep both. */
function DuplicateItem({ tx }: { tx: TransactionRow }) {
  const { money } = usePrivacy();
  const styles = useStyles();
  const update = useUpdateTransaction();
  const del = useDeleteTransaction();

  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
        <Badge label="possible duplicate" tone="danger" />
        <Badge label={tx.source} />
      </View>
      <Title>
        {money(tx.amount === null ? null : Number(tx.amount), tx.currency)} · {tx.merchant ?? 'unknown'}
      </Title>
      <Muted>
        {tx.occurred_at
          ? `${formatDayHeading(bruneiDayKey(tx.occurred_at))} ${formatTime(tx.occurred_at)}`
          : 'No date'}
        {tx.card_last4 ? `  ·  •${tx.card_last4}` : ''}
      </Muted>
      <Text style={styles.raw}>{tx.raw_text}</Text>
      <Muted>
        This looks like a second capture of a transaction already recorded (same amount and card
        within 3 minutes).
      </Muted>
      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <Button
            label="Merge (remove this copy)"
            onPress={() => del.mutate(tx.id)}
            busy={del.isPending}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label="Keep both"
            variant="secondary"
            onPress={() =>
              update.mutate({
                id: tx.id,
                patch: {
                  possible_duplicate_of: null,
                  ...(tx.parse_status === 'needs_review' && tx.amount !== null
                    ? { parse_status: 'parsed' as const, confidence: 1 }
                    : {}),
                },
              })
            }
            busy={update.isPending}
          />
        </View>
      </View>
    </Card>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center', flexGrow: 1 },
  raw: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
    color: colors.muted,
    marginBottom: 12,
  },
  error: { color: colors.danger, marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
}));
