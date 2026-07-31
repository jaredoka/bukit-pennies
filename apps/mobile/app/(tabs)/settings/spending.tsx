import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Card, Muted, NavRow, Title } from '@/components/ui';
import { exportTransactionsCsv } from '@/lib/exportCsv';
import { themedStyles } from '@/lib/theme';

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
        <Title>Spending &amp; data</Title>
        <NavRow
          href="/(tabs)/settings/budgets"
          icon="pie-chart"
          label="Set category budgets"
          note="Set per-category limits shown on the dashboard"
        />
        <NavRow
          href="/subscriptions"
          icon="repeat"
          label="Subscriptions"
          note="Record what you subscribe to and see what it costs per month"
        />
        <NavRow
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
}));
