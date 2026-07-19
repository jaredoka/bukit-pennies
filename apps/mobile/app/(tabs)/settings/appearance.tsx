import { ScrollView, View } from 'react-native';
import { Card, Chip, Muted, Title } from '@/components/ui';
import { themedStyles, useTheme } from '@/lib/theme';
import { CURRENCY_OPTIONS, usePrimaryCurrency } from '@/lib/primaryCurrency';

const SCHEME_OPTIONS = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
] as const;

export default function Appearance() {
  const styles = useStyles();
  const { preference, setPreference } = useTheme();
  const { currency, setCurrency } = usePrimaryCurrency();

  return (
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
        <Muted>The Dashboard donut shows only transactions in this currency. Other currencies are still recorded but excluded from the summary.</Muted>
        <View style={{ gap: 8, marginTop: 12 }}>
          {CURRENCY_OPTIONS.map((opt) => (
            <Chip
              key={opt.code}
              label={opt.label}
              active={currency === opt.code}
              onPress={() => setCurrency(opt.code)}
            />
          ))}
        </View>
      </Card>
    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
}));
