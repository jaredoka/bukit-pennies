import Ionicons from '@expo/vector-icons/Ionicons';
import { parseBankMessage, splitBankMessages } from '@bukit/parsers';
import { useQueryClient } from '@tanstack/react-query';
import { Link, Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Badge, Button, Centered, Field, Muted } from '@/components/ui';
import { bruneiDayKey, formatDayHeading, formatMoney, formatTime } from '@/lib/format';
import { postIngest, postIngestMany, type BulkItemResult, type IngestResponse } from '@/lib/ingest';
import { useCategories, usePullToRefresh, useTransactions } from '@/lib/queries';
import type { CategoryRow, TransactionRow } from '@/lib/types';
import { themedStyles, useTheme } from '@/lib/theme';
import { usePrivacy } from '@/lib/privacy';

const BANK_LABELS: Record<string, string> = {
  baiduri: 'Baiduri Bank',
  bibd: 'Bank Islam Brunei Darussalam',
  scb: 'Standard Chartered Bank',
  unknown: 'Other',
};

const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type SheetKey = 'bank' | 'card' | 'category' | 'currency' | 'date' | 'direction' | 'recipient';

interface TxFilters {
  direction: 'all' | 'incoming' | 'outgoing';
  currencies: string[];
  dateFrom: string;
  dateTo: string;
  recipient: string;
  banks: string[];
  categoryIds: (string | null)[];
  cards: string[];
}

const DEFAULT_FILTERS: TxFilters = {
  direction: 'all',
  currencies: [],
  dateFrom: '',
  dateTo: '',
  recipient: '',
  banks: [],
  categoryIds: [],
  cards: [],
};

function toggleItem<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

function applyFilters(tx: TransactionRow, f: TxFilters, search: string): boolean {
  if (search) {
    const q = search.toUpperCase();
    if (
      !tx.merchant_normalized?.toUpperCase().includes(q) &&
      !tx.raw_text.toUpperCase().includes(q) &&
      !tx.notes?.toUpperCase().includes(q)
    )
      return false;
  }
  const amt = Number(tx.amount ?? 0);
  if (f.direction === 'outgoing' && amt <= 0) return false;
  if (f.direction === 'incoming' && amt > 0) return false;
  if (f.currencies.length > 0 && !f.currencies.includes(tx.currency)) return false;
  if (f.dateFrom && tx.occurred_at) {
    if (tx.occurred_at < new Date(f.dateFrom + 'T00:00:00+08:00').toISOString()) return false;
  }
  if (f.dateTo && tx.occurred_at) {
    if (tx.occurred_at > new Date(f.dateTo + 'T23:59:59+08:00').toISOString()) return false;
  }
  if (f.recipient.trim()) {
    const rq = f.recipient.trim().toUpperCase();
    if (
      !tx.merchant_normalized?.toUpperCase().includes(rq) &&
      !tx.merchant?.toUpperCase().includes(rq)
    )
      return false;
  }
  if (f.banks.length > 0 && !f.banks.includes(tx.bank)) return false;
  if (f.categoryIds.length > 0 && !f.categoryIds.includes(tx.category_id)) return false;
  if (f.cards.length > 0 && (!tx.card_last4 || !f.cards.includes(tx.card_last4))) return false;
  return true;
}

// ---- Shared sheet wrapper --------------------------------------------------

function Sheet({
  visible,
  title,
  onClose,
  onClear,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onClear?: () => void;
  children: React.ReactNode;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <>
      {/* Overlay appears instantly — separate from the sliding panel */}
      <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
        <Pressable style={styles.overlay} onPress={onClose} />
      </Modal>
      {/* Sheet panel slides up */}
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={styles.overlaySlide}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{title}</Text>
              {onClear ? (
                <Pressable onPress={onClear} hitSlop={8}>
                  <Text style={{ color: colors.danger, fontWeight: '600' }}>Clear</Text>
                </Pressable>
              ) : null}
            </View>
            {children}
            <Button label="Done" onPress={onClose} />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

// ---- Selectable row (replaces chips) ---------------------------------------

function SelectRow({
  label,
  selected,
  onPress,
  dot,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  dot?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.selectRow}>
      {dot ? <View style={[styles.rowDot, { backgroundColor: dot }]} /> : null}
      <Text style={[styles.rowLabel, selected && { color: colors.primary, fontWeight: '600' }]}>
        {label}
      </Text>
      {selected ? (
        <Ionicons name="checkmark" size={18} color={colors.primary} />
      ) : (
        <View style={{ width: 18 }} />
      )}
    </Pressable>
  );
}

// ---- Calendar date-range picker -------------------------------------------

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function CalendarSheet({
  dateFrom,
  dateTo,
  onChange,
  onClose,
}: {
  dateFrom: string;
  dateTo: string;
  onChange: (patch: { dateFrom?: string; dateTo?: string }) => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const today = new Date();

  const initDate = dateFrom ? new Date(dateFrom + 'T12:00:00') : today;
  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());
  // 'start' = next tap sets dateFrom; 'end' = next tap sets dateTo
  const [picking, setPicking] = useState<'start' | 'end'>(dateFrom ? 'end' : 'start');

  const grid = useMemo(() => {
    const firstDow = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (number | null)[] = Array(firstDow).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  function handleDay(day: number) {
    const ds = toDateStr(viewYear, viewMonth, day);
    if (picking === 'start') {
      onChange({ dateFrom: ds, dateTo: '' });
      setPicking('end');
    } else {
      if (dateFrom && ds < dateFrom) {
        // tapped before current start → restart
        onChange({ dateFrom: ds, dateTo: '' });
        setPicking('end');
      } else {
        onChange({ dateTo: ds });
        setPicking('start');
      }
    }
  }

  function dayState(day: number): 'start' | 'end' | 'range' | 'today' | 'none' {
    const ds = toDateStr(viewYear, viewMonth, day);
    if (ds === dateFrom) return 'start';
    if (ds === dateTo) return 'end';
    if (dateFrom && dateTo && ds > dateFrom && ds < dateTo) return 'range';
    if (
      day === today.getDate() &&
      viewMonth === today.getMonth() &&
      viewYear === today.getFullYear()
    )
      return 'today';
    return 'none';
  }

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < grid.length; i += 7) weeks.push(grid.slice(i, i + 7));

  return (
    <Sheet
      visible
      title="Date range"
      onClose={onClose}
      onClear={() => { onChange({ dateFrom: '', dateTo: '' }); setPicking('start'); }}
    >
      {/* Month nav */}
      <View style={styles.calNav}>
        <Pressable onPress={prevMonth} hitSlop={12} style={styles.calNavBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.calNavTitle}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </Text>
        <Pressable onPress={nextMonth} hitSlop={12} style={styles.calNavBtn}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </Pressable>
      </View>

      {/* From / To columns */}
      <View style={styles.calRangeRow}>
        <Pressable
          style={[styles.calRangeCol, picking === 'start' && styles.calRangeColActive]}
          onPress={() => setPicking('start')}
        >
          <Text style={styles.calRangeLabel}>From</Text>
          <Text style={[styles.calRangeValue, !dateFrom && styles.calRangePlaceholder]}>
            {dateFrom || '—'}
          </Text>
        </Pressable>
        <View style={styles.calRangeDivider} />
        <Pressable
          style={[styles.calRangeCol, picking === 'end' && styles.calRangeColActive]}
          onPress={() => { if (dateFrom) setPicking('end'); }}
        >
          <Text style={styles.calRangeLabel}>To</Text>
          <Text style={[styles.calRangeValue, !dateTo && styles.calRangePlaceholder]}>
            {dateTo || '—'}
          </Text>
        </Pressable>
      </View>

      {/* Day-of-week headers */}
      <View style={styles.calRow}>
        {DAY_NAMES.map((d) => (
          <Text key={d} style={styles.calDayName}>{d}</Text>
        ))}
      </View>

      {/* Week rows */}
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.calRow}>
          {week.map((day, di) => {
            if (!day) return <View key={di} style={styles.calCell} />;
            const state = dayState(day);
            const isSelected = state === 'start' || state === 'end';
            const inRange = state === 'range';
            return (
              <Pressable
                key={di}
                onPress={() => handleDay(day)}
                style={[
                  styles.calCell,
                  inRange && { backgroundColor: colors.primary + '28' },
                ]}
              >
                <View
                  style={[
                    styles.calDayCircle,
                    isSelected && { backgroundColor: colors.primary },
                  ]}
                >
                  <Text
                    style={[
                      styles.calDayText,
                      isSelected && { color: colors.onPrimary, fontWeight: '700' },
                      state === 'today' && !isSelected && { color: colors.primary, fontWeight: '600' },
                    ]}
                  >
                    {day}
                  </Text>
                  {state === 'today' && !isSelected ? (
                    <View style={[styles.calTodayDot, { backgroundColor: colors.primary }]} />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={{ height: 12 }} />
    </Sheet>
  );
}

// ---- Per-filter sheets (row-based) -----------------------------------------

function DirectionSheet({
  value,
  onChange,
  onClose,
}: {
  value: TxFilters['direction'];
  onChange: (v: TxFilters['direction']) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible title="Direction" onClose={onClose} onClear={() => onChange('all')}>
      <View style={{ marginBottom: 8 }}>
        {(['all', 'incoming', 'outgoing'] as const).map((d) => (
          <SelectRow
            key={d}
            label={d === 'all' ? 'All' : d === 'incoming' ? 'Incoming' : 'Outgoing'}
            selected={value === d}
            onPress={() => onChange(d)}
          />
        ))}
      </View>
    </Sheet>
  );
}

function CurrencySheet({
  available,
  selected,
  onChange,
  onClose,
}: {
  available: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible title="Currency" onClose={onClose} onClear={() => onChange([])}>
      <View style={{ marginBottom: 8 }}>
        {[...available].sort().map((c) => (
          <SelectRow
            key={c}
            label={c}
            selected={selected.includes(c)}
            onPress={() => onChange(toggleItem(selected, c))}
          />
        ))}
      </View>
    </Sheet>
  );
}

function RecipientSheet({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible title="Recipient" onClose={onClose} onClear={() => onChange('')}>
      <View style={{ marginBottom: 16 }}>
        <Field
          placeholder="Search by merchant name…"
          value={value}
          onChangeText={onChange}
          autoCapitalize="none"
          autoFocus
        />
      </View>
    </Sheet>
  );
}

function BankSheet({
  available,
  selected,
  onChange,
  onClose,
}: {
  available: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  onClose: () => void;
}) {
  const sorted = [...available].sort((a, b) =>
    (BANK_LABELS[a] ?? a).localeCompare(BANK_LABELS[b] ?? b),
  );
  return (
    <Sheet visible title="Bank" onClose={onClose} onClear={() => onChange([])}>
      <View style={{ marginBottom: 8 }}>
        {sorted.map((b) => (
          <SelectRow
            key={b}
            label={BANK_LABELS[b] ?? b}
            selected={selected.includes(b)}
            onPress={() => onChange(toggleItem(selected, b))}
          />
        ))}
      </View>
    </Sheet>
  );
}

function CategorySheet({
  categories,
  selected,
  onChange,
  onClose,
}: {
  categories: CategoryRow[];
  selected: (string | null)[];
  onChange: (v: (string | null)[]) => void;
  onClose: () => void;
}) {
  const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Sheet visible title="Category" onClose={onClose} onClear={() => onChange([])}>
      <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
        <View style={{ marginBottom: 8 }}>
          <SelectRow
            label="Uncategorised"
            selected={selected.includes(null)}
            onPress={() => onChange(toggleItem<string | null>(selected, null))}
          />
          {sorted.map((c) => (
            <SelectRow
              key={c.id}
              label={c.name}
              dot={c.color ?? undefined}
              selected={selected.includes(c.id)}
              onPress={() => onChange(toggleItem<string | null>(selected, c.id))}
            />
          ))}
        </View>
      </ScrollView>
    </Sheet>
  );
}

function CardSheet({
  available,
  selected,
  onChange,
  onClose,
}: {
  available: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible title="Card" onClose={onClose} onClear={() => onChange([])}>
      <View style={{ marginBottom: 8 }}>
        {[...available].sort().map((card) => (
          <SelectRow
            key={card}
            label={`•${card}`}
            selected={selected.includes(card)}
            onPress={() => onChange(toggleItem(selected, card))}
          />
        ))}
      </View>
    </Sheet>
  );
}

// ---- Filter bar chip -------------------------------------------------------

function FBarChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} style={[styles.fbarChip, active && styles.fbarChipActive]}>
      <Text style={[styles.fbarChipText, active && styles.fbarChipTextActive]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

// ---- Main screen -----------------------------------------------------------

export default function TransactionsList() {
  const { money } = usePrivacy();
  const styles = useStyles();
  const { colors } = useTheme();
  const { data, isLoading, error } = useTransactions();
  const categories = useCategories();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<TxFilters>(DEFAULT_FILTERS);
  const [activeSheet, setActiveSheet] = useState<SheetKey | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const { refreshing, onRefresh } = usePullToRefresh();

  function patch(p: Partial<TxFilters>) {
    setFilters((prev) => ({ ...prev, ...p }));
  }

  const availBanks = useMemo(
    () => [...new Set((data ?? []).filter((t) => t.bank && t.bank !== 'unknown').map((t) => t.bank))],
    [data],
  );
  // Cards are scoped to the selected banks so the card list stays relevant.
  const availCards = useMemo(() => {
    const pool = filters.banks.length > 0
      ? (data ?? []).filter((t) => filters.banks.includes(t.bank))
      : (data ?? []);
    return [...new Set(pool.filter((t) => t.card_last4).map((t) => t.card_last4!))];
  }, [data, filters.banks]);
  const availCurrencies = useMemo(
    () => [...new Set((data ?? []).map((t) => t.currency))],
    [data],
  );

  // Drop selected cards that no longer belong to the filtered bank set.
  useEffect(() => {
    const valid = filters.cards.filter((c) => availCards.includes(c));
    if (valid.length !== filters.cards.length) patch({ cards: valid });
  }, [availCards]); // eslint-disable-line react-hooks/exhaustive-deps

  // Chip labels
  const bankLabel =
    filters.banks.length === 1 ? (BANK_LABELS[filters.banks[0]!] ?? filters.banks[0]!)
    : filters.banks.length > 1 ? `${filters.banks.length} banks`
    : 'Bank';
  const cardLabel =
    filters.cards.length === 1 ? `•${filters.cards[0]}`
    : filters.cards.length > 1 ? `${filters.cards.length} cards`
    : 'Card';
  const catLabel =
    filters.categoryIds.length > 0
      ? `${filters.categoryIds.length} ${filters.categoryIds.length === 1 ? 'category' : 'categories'}`
      : 'Category';
  const currLabel = filters.currencies.length > 0 ? filters.currencies.join(', ') : 'Currency';
  const dateLabel =
    filters.dateFrom && filters.dateTo ? `${filters.dateFrom} – ${filters.dateTo}`
    : filters.dateFrom ? `From ${filters.dateFrom}`
    : filters.dateTo ? `To ${filters.dateTo}`
    : 'Date';
  const dirLabel =
    filters.direction === 'outgoing' ? 'Outgoing'
    : filters.direction === 'incoming' ? 'Incoming'
    : 'Direction';
  const recipLabel = filters.recipient.trim() || 'Recipient';

  const anyFilter =
    filters.direction !== 'all' ||
    filters.currencies.length > 0 ||
    !!(filters.dateFrom || filters.dateTo) ||
    !!filters.recipient.trim() ||
    filters.banks.length > 0 ||
    filters.categoryIds.length > 0 ||
    filters.cards.length > 0;

  const sections = useMemo(() => {
    const rows = (data ?? []).filter((tx) => applyFilters(tx, filters, search.trim()));
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
  }, [data, search, filters]);

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
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable hitSlop={8} onPress={() => setShowAdd(true)} accessibilityLabel="Add transaction">
              <Ionicons name="add-circle-outline" size={26} color={colors.primary} />
            </Pressable>
          ),
        }}
      />
      <View style={styles.screen}>
        {/* Search + filter bar header — overflow visible so pills aren't clipped */}
        <View style={styles.stickyHeader}>
          <View style={styles.searchWrap}>
            <Field
              placeholder="Search merchant, notes, raw text…"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              style={{ marginBottom: 0 }}
            />
          </View>

          {/* Swipeable filter bar — alphabetical order */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.fbar}
            contentContainerStyle={styles.fbarContent}
            keyboardShouldPersistTaps="handled"
          >
          {availBanks.length > 0 ? (
            <FBarChip label={bankLabel} active={filters.banks.length > 0} onPress={() => setActiveSheet('bank')} />
          ) : null}
          {availCards.length > 0 ? (
            <FBarChip label={cardLabel} active={filters.cards.length > 0} onPress={() => setActiveSheet('card')} />
          ) : null}
          {(categories.data?.length ?? 0) > 0 ? (
            <FBarChip label={catLabel} active={filters.categoryIds.length > 0} onPress={() => setActiveSheet('category')} />
          ) : null}
          {availCurrencies.length > 1 ? (
            <FBarChip label={currLabel} active={filters.currencies.length > 0} onPress={() => setActiveSheet('currency')} />
          ) : null}
          <FBarChip label={dateLabel} active={!!(filters.dateFrom || filters.dateTo)} onPress={() => setActiveSheet('date')} />
          <FBarChip label={dirLabel} active={filters.direction !== 'all'} onPress={() => setActiveSheet('direction')} />
          <FBarChip label={recipLabel} active={!!filters.recipient.trim()} onPress={() => setActiveSheet('recipient')} />
          {anyFilter ? (
            <>
              <View style={styles.fbarDivider} />
              <FBarChip label="Reset all" active={false} onPress={() => setFilters(DEFAULT_FILTERS)} />
            </>
          ) : null}
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
              <Muted>{anyFilter || search ? 'No transactions match.' : 'No transactions yet.'}</Muted>
            </Centered>
          }
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
        />
      </View>

      {/* Per-filter sheets */}
      {showAdd ? <AddSheet onClose={() => setShowAdd(false)} /> : null}

      {activeSheet === 'bank' ? (
        <BankSheet available={availBanks} selected={filters.banks} onChange={(v) => patch({ banks: v })} onClose={() => setActiveSheet(null)} />
      ) : activeSheet === 'card' ? (
        <CardSheet available={availCards} selected={filters.cards} onChange={(v) => patch({ cards: v })} onClose={() => setActiveSheet(null)} />
      ) : activeSheet === 'category' ? (
        <CategorySheet categories={categories.data ?? []} selected={filters.categoryIds} onChange={(v) => patch({ categoryIds: v })} onClose={() => setActiveSheet(null)} />
      ) : activeSheet === 'currency' ? (
        <CurrencySheet available={availCurrencies} selected={filters.currencies} onChange={(v) => patch({ currencies: v })} onClose={() => setActiveSheet(null)} />
      ) : activeSheet === 'date' ? (
        <CalendarSheet dateFrom={filters.dateFrom} dateTo={filters.dateTo} onChange={(p) => patch(p)} onClose={() => setActiveSheet(null)} />
      ) : activeSheet === 'direction' ? (
        <DirectionSheet value={filters.direction} onChange={(v) => patch({ direction: v })} onClose={() => setActiveSheet(null)} />
      ) : activeSheet === 'recipient' ? (
        <RecipientSheet value={filters.recipient} onChange={(v) => patch({ recipient: v })} onClose={() => setActiveSheet(null)} />
      ) : null}
    </>
  );
}

// ---- Add sheet (Cash / Capture chooser) ------------------------------------

function AddSheet({ onClose }: { onClose: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const [showCapture, setShowCapture] = useState(false);

  if (showCapture) {
    return <CaptureSheet onClose={onClose} />;
  }

  return (
    <>
      <Modal visible transparent animationType="none" onRequestClose={onClose}>
        <Pressable style={styles.overlay} onPress={onClose} />
      </Modal>
      <Modal visible transparent animationType="slide" onRequestClose={onClose}>
        <View style={styles.overlaySlide}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add transaction manually</Text>
            <Pressable
              style={styles.addRow}
              onPress={() => { onClose(); router.push('/(tabs)/transactions/new'); }}
            >
              <View style={[styles.addIcon, { backgroundColor: colors.primary + '18' }]}>
                <Ionicons name="cash-outline" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.addRowTitle}>Cash</Text>
                <Muted>Manually enter a cash or card spend</Muted>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
            <Pressable style={styles.addRow} onPress={() => setShowCapture(true)}>
              <View style={[styles.addIcon, { backgroundColor: colors.primary + '18' }]}>
                <Ionicons name="clipboard-outline" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.addRowTitle}>Capture</Text>
                <Muted>Paste a bank SMS or notification text</Muted>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

// ---- Capture sheet ----------------------------------------------------------

const MAX_TEXT_BYTES = 4096;

type Outcome = 'created' | 'needs review' | 'duplicate' | 'ignored' | 'error';

function outcomeOf(res: IngestResponse): Outcome {
  if (res.status === 'created') return res.transaction?.parse_status === 'needs_review' ? 'needs review' : 'created';
  if (res.status === 'duplicate') return 'duplicate';
  if (res.status === 'ignored') return 'ignored';
  return 'error';
}

function CaptureSheet({ onClose }: { onClose: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [bulkResults, setBulkResults] = useState<BulkItemResult[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const messages = useMemo(() => splitBankMessages(text), [text]);
  const bulk = messages.length > 1;
  const preview = useMemo(() => (messages.length === 1 ? parseBankMessage(messages[0]!) : null), [messages]);
  const bulkPreview = useMemo(
    () => bulk ? messages.map((m) => ({
      text: m,
      parsed: parseBankMessage(m),
      oversized: new TextEncoder().encode(m).length > MAX_TEXT_BYTES,
    })) : [],
    [bulk, messages],
  );
  const transactionalCount = bulkPreview.filter((p) => p.parsed.tx !== null).length;

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['transactions'] });
    qc.invalidateQueries({ queryKey: ['monthly_totals'] });
    qc.invalidateQueries({ queryKey: ['merchant_totals'] });
  }
  function reset() { setResult(null); setBulkResults(null); setProgress(null); setCaptureError(null); }

  async function submitSingle() {
    setBusy(true); reset();
    try {
      const res = await postIngest(messages[0] ?? text.trim(), 'paste');
      setResult(res);
      if (res.status === 'created') { setText(''); invalidate(); }
    } catch (e) { setCaptureError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function submitBulk() {
    setBusy(true); reset();
    setProgress({ done: 0, total: messages.length });
    try {
      const results = await postIngestMany(messages, 'paste', (done, total) => setProgress({ done, total }));
      setBulkResults(results); invalidate();
    } catch (e) { setCaptureError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); setProgress(null); }
  }

  const captureResultText = result
    ? result.status === 'created' ? '✓ Transaction saved.'
    : result.status === 'duplicate' ? 'Already recorded — this exact message was captured before.'
    : result.status === 'ignored' ? `Ignored: not a transaction message${result.reason ? ` (${result.reason})` : ''}.`
    : `Error: ${result.error ?? 'unknown'}`
    : null;
  const captureResultColor = result
    ? result.status === 'created' ? colors.primary : result.status === 'error' ? colors.danger : colors.warning
    : colors.text;

  return (
    <>
      <Modal visible transparent animationType="none" onRequestClose={onClose}>
        <Pressable style={styles.overlay} onPress={onClose} />
      </Modal>
      <Modal visible transparent animationType="slide" onRequestClose={onClose}>
        <View style={styles.overlaySlide}>
          <ScrollView
            style={styles.sheet}
            contentContainerStyle={{ paddingBottom: 36 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Capture</Text>
            </View>
            <Muted>Paste bank SMS text — one message or a whole conversation at once.</Muted>
            <Field
              multiline
              value={text}
              onChangeText={(t) => { setText(t); reset(); }}
              placeholder="Card No.: 4x0213 Amount: BND 21.00 Merchant: … Date: …"
              style={{ minHeight: 100, marginTop: 12, textAlignVertical: 'top' }}
              autoCapitalize="none"
            />
            <Button
              label={bulk ? `Save ${messages.length} messages` : 'Save transaction'}
              onPress={bulk ? submitBulk : submitSingle}
              disabled={messages.length === 0}
              busy={busy}
            />
            {progress ? <Text style={styles.captureBanner}>{`Saving ${progress.done} / ${progress.total}…`}</Text> : null}
            {captureError ? <Text style={[styles.captureBanner, { color: colors.danger }]}>{captureError}</Text> : null}
            {captureResultText ? <Text style={[styles.captureBanner, { color: captureResultColor }]}>{captureResultText}</Text> : null}
            {bulkResults ? (
              <View style={{ marginTop: 12 }}>
                {(() => {
                  const counts = new Map<Outcome, number>();
                  for (const r of bulkResults) { const o = outcomeOf(r.response); counts.set(o, (counts.get(o) ?? 0) + 1); }
                  return <Muted>{Array.from(counts.entries()).map(([o, n]) => `${n} ${o}`).join(' · ')}</Muted>;
                })()}
                {bulkResults.map((r, i) => {
                  const o = outcomeOf(r.response);
                  const tone = o === 'created' ? 'success' : o === 'error' ? 'danger' : o === 'ignored' ? 'muted' : 'warning';
                  return (
                    <View key={i} style={styles.captureBulkRow}>
                      <Text style={styles.captureBulkIndex}>{i + 1}</Text>
                      <Text style={[styles.captureBulkText, { flex: 1, marginRight: 8 }]} numberOfLines={1}>{r.text.slice(0, 60)}</Text>
                      <Badge label={o} tone={tone} />
                    </View>
                  );
                })}
                <Button label="Clear" variant="secondary" onPress={() => { setText(''); reset(); }} />
              </View>
            ) : null}
            {preview?.tx ? (
              <View style={{ marginTop: 12 }}>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                  <Badge label={preview.tx.bank} />
                  <Badge label={`${(preview.tx.confidence * 100).toFixed(0)}%`} tone={preview.tx.confidence >= 0.75 ? 'success' : 'warning'} />
                </View>
                {[['Amount', formatMoney(preview.tx.amount, preview.tx.currency)], ['Merchant', preview.tx.merchant ?? '—'], ['Date', preview.tx.occurredAt ?? '—'], ['Card', preview.tx.cardLast4 ? `•${preview.tx.cardLast4}` : '—']].map(([label, value]) => (
                  <View key={label} style={styles.capturePreviewRow}>
                    <Text style={{ color: colors.muted }}>{label}</Text>
                    <Text style={{ color: colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{value}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <Button label="Done" onPress={onClose} />
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

// ---- Transaction row --------------------------------------------------------

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
  stickyHeader: {
    backgroundColor: colors.bg,
    overflow: 'visible',
    zIndex: 10,
  },
  searchWrap: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  // Filter bar
  fbar: { flexGrow: 0 },
  fbarContent: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fbarDivider: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    backgroundColor: colors.border,
    marginHorizontal: 2,
  },
  fbarChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.card,
    flexShrink: 0,
  },
  fbarChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  fbarChipText: { color: colors.text, fontSize: 13, flexShrink: 0 },
  fbarChipTextActive: { color: colors.onPrimary, fontWeight: '600' },
  // Transaction list
  content: {
    paddingHorizontal: 12,
    paddingBottom: 24,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
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
  // Sheet
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  overlaySlide: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  // Select rows
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  rowLabel: { flex: 1, fontSize: 15, color: colors.text },
  // Calendar
  calNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  calNavBtn: { padding: 4 },
  calNavTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  calRangeRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    marginBottom: 12,
    overflow: 'hidden',
  },
  calRangeCol: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  calRangeColActive: { backgroundColor: colors.primary + '18' },
  calRangeDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  calRangeLabel: { fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  calRangeValue: { fontSize: 14, fontWeight: '600', color: colors.text },
  calRangePlaceholder: { color: colors.muted },
  calRow: { flexDirection: 'row', marginBottom: 2 },
  calDayName: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
    paddingVertical: 4,
  },
  calCell: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  calDayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calDayText: { fontSize: 14, color: colors.text },
  calTodayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    position: 'absolute',
    bottom: 3,
  },
  // Add sheet rows
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  addIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRowTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 2 },
  // Capture sheet
  captureBanner: { marginTop: 10, fontWeight: '600', color: colors.text },
  captureBulkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  captureBulkIndex: { width: 24, color: colors.muted, fontVariant: ['tabular-nums'] as const },
  captureBulkText: { color: colors.text, fontSize: 13 },
  capturePreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
}));
