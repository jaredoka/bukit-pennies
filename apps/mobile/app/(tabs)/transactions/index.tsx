import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Badge, Centered, Field, Muted } from '@/components/ui';
import { bruneiDayKey, formatDayHeading, formatTime } from '@/lib/format';
import { usePullToRefresh, useTransactions } from '@/lib/queries';
import type { TransactionRow } from '@/lib/types';
import { themedStyles } from '@/lib/theme';
import { usePrivacy } from '@/lib/privacy';

/** 'all', 'bank:<bank>' or 'card:<last4>'. */
type TxFilter = string;

const BANK_LABELS: Record<string, string> = {
  baiduri: 'Baiduri',
  bibd: 'BIBD',
  scb: 'StanChart',
  unknown: 'Other',
};

function matchesFilter(tx: TransactionRow, filter: TxFilter): boolean {
  if (filter === 'all') return true;
  const [kind, value] = filter.split(':', 2);
  if (kind === 'bank') return tx.bank === value;
  return tx.card_last4 === value;
}

export default function TransactionsList() {
  const { money } = usePrivacy();
  const styles = useStyles();
  const { data, isLoading, error } = useTransactions();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<TxFilter>('all');
  const { refreshing, onRefresh } = usePullToRefresh();

  // Chips are derived from the data: every bank and card that appears.
  const chips = useMemo(() => {
    const banks = new Set<string>();
    const cards = new Set<string>();
    for (const tx of data ?? []) {
      if (tx.bank && tx.bank !== 'unknown') banks.add(tx.bank);
      if (tx.card_last4) cards.add(tx.card_last4);
    }
    return [
      { key: 'all', label: 'All' },
      ...Array.from(banks).sort().map((b) => ({ key: `bank:${b}`, label: BANK_LABELS[b] ?? b })),
      ...Array.from(cards).sort().map((c) => ({ key: `card:${c}`, label: `•${c}` })),
    ];
  }, [data]);

  const sections = useMemo(() => {
    const q = search.trim().toUpperCase();
    const rows = (data ?? []).filter(
      (tx) =>
        matchesFilter(tx, filter) &&
        (!q ||
          tx.merchant_normalized?.includes(q) ||
          tx.raw_text.toUpperCase().includes(q) ||
          tx.notes?.toUpperCase().includes(q)),
    );
    const byDay = new Map<string, TransactionRow[]>();
    for (const tx of rows) {
      const key = tx.occurred_at ? bruneiDayKey(tx.occurred_at) : 'unknown';
      byDay.set(key, [...(byDay.get(key) ?? []), tx]);
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => (a === 'unknown' ? 1 : b === 'unknown' ? -1 : b.localeCompare(a)))
      .map(([day, items]) => ({
        title: day === 'unknown' ? 'Unknown date' : formatDayHeading(day),
        total: items.reduce((s, t) => s + Number(t.amount ?? 0), 0),
        data: items,
      }));
  }, [data, search, filter]);

  if (isLoading) {
    return (
      <Centered>
        <ActivityIndicator size="large" />
      </Centered>
    );
  }
  if (error) {
    return (
      <Centered>
        <Muted>{String(error)}</Muted>
      </Centered>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.searchWrap}>
        <Field
          placeholder="Search merchant, notes, raw text…"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          style={{ marginBottom: 0 }}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {chips.map((chip) => (
            <Pressable
              key={chip.key}
              onPress={() => setFilter(chip.key)}
              style={[styles.chip, filter === chip.key && styles.chipActive]}
            >
              <Text style={filter === chip.key ? styles.chipActiveText : styles.chipText}>
                {chip.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <SectionList
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Muted>{money(section.total)}</Muted>
          </View>
        )}
        renderItem={({ item }) => <TxRow tx={item} />}
        ListEmptyComponent={
          <Centered>
            <Muted>No transactions yet.</Muted>
          </Centered>
        }
        stickySectionHeadersEnabled={false}
      />
    </View>
  );
}

function TxRow({ tx }: { tx: TransactionRow }) {
  const { money } = usePrivacy();
  const styles = useStyles();
  return (
    <Link href={{ pathname: '/(tabs)/transactions/[id]', params: { id: tx.id } }} asChild>
      <Pressable style={styles.row}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.merchant} numberOfLines={1}>
            {tx.merchant ?? tx.raw_text.slice(0, 48)}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Muted>
              {formatTime(tx.occurred_at)}
              {tx.card_last4 ? `  ·  •${tx.card_last4}` : ''}
            </Muted>
            {tx.parse_status === 'needs_review' ? <Badge label="review" tone="warning" /> : null}
            {tx.notes ? <Badge label="note" /> : null}
          </View>
        </View>
        <Text style={styles.amount}>{money(tx.amount === null ? null : Number(tx.amount), tx.currency)}</Text>
      </Pressable>
    </Link>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  searchWrap: { padding: 12, maxWidth: 720, width: '100%', alignSelf: 'center' },
  content: { paddingHorizontal: 12, paddingBottom: 24, maxWidth: 720, width: '100%', alignSelf: 'center' },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: { fontWeight: '700', color: colors.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  merchant: { fontWeight: '600', color: colors.text },
  amount: { fontWeight: '700', color: colors.text },
  chipRow: { marginTop: 10, flexGrow: 0 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: colors.card,
    marginRight: 8,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 13 },
  chipActiveText: { color: colors.onPrimary, fontWeight: '600', fontSize: 13 },
}));
