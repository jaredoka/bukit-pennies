import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Card, Chip, Muted, Sheet, Title, WheelPicker } from '@/components/ui';
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
  const { currency, setCurrency, convertOthers, setConvertOthers } = usePrimaryCurrency();
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
            Dashboard totals are shown in this currency. Other currencies are recorded but left
            out of the totals unless conversion is turned on below.
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

        <Card>
          <Title>Convert other currencies</Title>
          <Muted>
            Include transactions in other currencies in the Dashboard and Insights, converted into
            your primary currency at monthly reference rates.
          </Muted>
          <View style={styles.switchRow}>
            <Text style={[styles.dropdownValue, { color: colors.text }]}>
              Include converted spending
            </Text>
            <Switch
              value={convertOthers}
              onValueChange={setConvertOthers}
              accessibilityLabel="Include spending in other currencies, converted"
            />
          </View>
          <Muted>
            These are estimates: a monthly average will not match what your card was charged to
            the cent. Rows keep their original amount, with an approximate converted figure
            alongside.
          </Muted>
        </Card>
      </ScrollView>

      <Sheet
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
      </Sheet>
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 8,
    paddingVertical: 4,
  },
}));
