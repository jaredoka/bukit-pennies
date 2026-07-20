import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, Chip, Muted, PickerSheet, Title, WheelPicker } from '@/components/ui';
import { themedStyles, useTheme } from '@/lib/theme';
import { CURRENCY_OPTIONS, usePrimaryCurrency } from '@/lib/primaryCurrency';

const SCHEME_OPTIONS = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
] as const;

const CURRENCY_LABELS = CURRENCY_OPTIONS.map((o) => o.label);

export default function Appearance() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { preference, setPreference } = useTheme();
  const { currency, setCurrency } = usePrimaryCurrency();
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);

  const currencyIndex = CURRENCY_OPTIONS.findIndex((o) => o.code === currency);
  const selectedIndex = currencyIndex >= 0 ? currencyIndex : 0;

  return (
    <>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card>
          <Title>Appearance</Title>
          <Muted>Choose a look, or follow your phone's setting.</Muted>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            {SCHEME_OPTIONS.map((opt) => (
              <Chip
                key={opt.key}
                label={opt.label}
                active={preference === opt.key}
                onPress={() => setPreference(opt.key)}
              />
            ))}
          </View>
        </Card>

        <Card>
          <Title>Primary currency</Title>
          <Muted>
            The Dashboard donut shows only transactions in this currency. Other currencies are still
            recorded but excluded from the summary.
          </Muted>
          <Pressable
            style={[styles.dropdownRow, { borderColor: colors.border, backgroundColor: colors.bg }]}
            onPress={() => setCurrencyPickerOpen(true)}
          >
            <Text style={[styles.dropdownValue, { color: colors.text }]}>
              {CURRENCY_OPTIONS[selectedIndex]?.label ?? currency}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.muted} />
          </Pressable>
        </Card>
      </ScrollView>

      <PickerSheet
        visible={currencyPickerOpen}
        onClose={() => setCurrencyPickerOpen(false)}
        title="Primary currency"
      >
        <View key={currencyPickerOpen ? 'open' : 'closed'}>
          <WheelPicker
            items={CURRENCY_LABELS}
            selectedIndex={selectedIndex}
            onSelect={(i) => setCurrency(CURRENCY_OPTIONS[i]!.code)}
          />
        </View>
      </PickerSheet>
    </>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  dropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dropdownValue: { fontSize: 15, fontWeight: '500' },
}));
