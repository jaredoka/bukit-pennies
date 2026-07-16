import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, type Href } from 'expo-router';
import { useState } from 'react';
import {
  Linking as RNLinking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, Card, colors, Muted, Title } from '@/components/ui';
import { PRIVACY_POLICY_URL, SUPPORT_EMAIL, TERMS_URL } from '@/lib/env';
import { exportTransactionsCsv } from '@/lib/exportCsv';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

function Row({ href, icon, label, note }: { href: Href; icon: keyof typeof Ionicons.glyphMap; label: string; note: string }) {
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

export default function Settings() {
  const { session } = useSession();
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
        <Title>Account</Title>
        <Muted>{session?.user.email ?? ''}</Muted>
        <View style={{ marginTop: 12 }}>
          <Button label="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />
        </View>
        <Row
          href="/(tabs)/settings/delete-account"
          icon="trash"
          label="Delete account"
          note="Permanently remove your account and all data"
        />
      </Card>

      <Card>
        <Title>Help</Title>
        <Row
          href="/(tabs)/settings/guide"
          icon="book"
          label="How Bukit Pennies works"
          note="Using the app, and where your data is stored"
        />
      </Card>

      <Card>
        <Title>Spending & data</Title>
        <Row
          href="/(tabs)/settings/budgets"
          icon="pie-chart"
          label="Monthly budgets"
          note="Set per-category limits shown on the dashboard"
        />
        <View style={{ marginTop: 12 }}>
          <Button label="Export transactions (CSV)" variant="secondary" onPress={exportCsv} busy={exporting} />
          {exportNote ? <Muted>{exportNote}</Muted> : null}
        </View>
      </Card>

      <Card>
        <Title>Capture</Title>
        <Row
          href="/(tabs)/settings/devices"
          icon="key"
          label="Capture devices & tokens"
          note="Create, reveal once, and revoke ingest tokens"
        />
        <Row
          href="/(tabs)/settings/shortcut-setup"
          icon="logo-apple"
          label="iOS Shortcut setup"
          note="Near-automatic capture of bank SMS on iPhone"
        />
        <Row
          href="/(tabs)/settings/android-capture"
          icon="logo-android"
          label="Android capture"
          note="Notification listener (coming in a later phase)"
        />
      </Card>

      <Card>
        <Title>About</Title>
        <Muted>
          Bukit Pennies logs card spending by parsing bank notification text. It never connects to
          your bank apps or accounts — no credentials, no open banking, only the text you (or your
          phone) hand it.
        </Muted>
        <View style={styles.aboutLinks}>
          <Text style={styles.aboutLink} onPress={() => RNLinking.openURL(PRIVACY_POLICY_URL)}>
            Privacy Policy
          </Text>
          <Text style={styles.aboutLink} onPress={() => RNLinking.openURL(TERMS_URL)}>
            Terms of Service
          </Text>
          <Text style={styles.aboutLink} onPress={() => RNLinking.openURL(`mailto:${SUPPORT_EMAIL}`)}>
            Contact support
          </Text>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  aboutLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 },
  aboutLink: { color: colors.primary, textDecorationLine: 'underline', fontSize: 13 },
});
