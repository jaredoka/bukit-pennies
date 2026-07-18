import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Muted, Title } from '@/components/ui';
import { exportTransactionsCsv } from '@/lib/exportCsv';
import { themedStyles, useTheme } from '@/lib/theme';

function Row({ href, icon, label, note }: { href: Href; icon: keyof typeof Ionicons.glyphMap; label: string; note: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Link href={href} asChild>
      <Pressable style={styles.row}>
        <Ionicons name={icon} size={22} color={colors.primary} style={{ marginRight: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Muted>{note}</Muted>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
    </Link>
  );
}

export default function Spending() {
  const styles = useStyles();
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);

  async function exportCsv() {
    setExporting(true);
    setExportNote(null);
    try {
      const count = await exportTransactionsCsv();
      setExportNote(`Exported ${count} transaction${count === 1 ? '' : 's'}.`);
    } catch (e) {
      setExportNote(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Title>Spending & data</Title>
        <Row
          href="/(tabs)/settings/budgets"
          icon="pie-chart"
          label="Set category budgets"
          note="Set per-category limits shown on the dashboard"
        />
        <Row
          href="/(tabs)/settings/weekly-summary"
          icon="notifications"
          label="Weekly summary"
          note="Weekly update on money spent, and percent of money used so far in the month"
        />
        <View style={{ marginTop: 12 }}>
          <Button label="Export transactions (CSV)" variant="secondary" onPress={exportCsv} busy={exporting} />
          {exportNote ? <Muted>{exportNote}</Muted> : null}
        </View>
      </Card>
    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: { fontWeight: '600', color: colors.text },
}));
