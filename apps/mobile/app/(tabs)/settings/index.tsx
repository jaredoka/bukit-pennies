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
import { Button, Card, Chip, Field, Muted, Title } from '@/components/ui';
import { useProfile, useUpdateProfile } from '@/lib/queries';
import { PRIVACY_POLICY_URL, SUPPORT_EMAIL, TERMS_URL } from '@/lib/env';
import { exportTransactionsCsv } from '@/lib/exportCsv';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
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

const SCHEME_OPTIONS = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
] as const;

export default function Settings() {
  const styles = useStyles();
  const { session } = useSession();
  const { preference, setPreference } = useTheme();
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
        <Title>Appearance</Title>
        <Muted>Choose a look, or follow your phone’s setting.</Muted>
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
        <Title>Help</Title>
        <Row
          href="/(tabs)/settings/guide"
          icon="book"
          label="How Bukit Pennies works"
          note="Using the app, and where your data is stored"
        />
      </Card>

      <IncomeCard />

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

function IncomeCard() {
  const profile = useProfile();
  const update = useUpdateProfile();
  const [draft, setDraft] = useState<string | null>(null);
  const saved = profile.data?.monthly_income == null ? '' : String(Number(profile.data.monthly_income));
  const value = draft ?? saved;
  const parsed = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed > 0;

  return (
    <Card>
      <Title>Monthly income</Title>
      <Muted>
        The dashboard measures spending against this amount and shows what’s left each month.
        One figure, applied every month — edit it anytime.
      </Muted>
      <View style={{ marginTop: 12 }}>
        <Field
          label="Amount (BND)"
          value={value}
          onChangeText={setDraft}
          placeholder="e.g. 2500"
          keyboardType="decimal-pad"
        />
        <Button
          label={update.isSuccess && draft === null ? 'Saved ✓' : 'Save income'}
          onPress={() => {
            update.mutate({ monthly_income: parsed }, { onSuccess: () => setDraft(null) });
          }}
          disabled={!valid || value === saved}
          busy={update.isPending}
        />
        {update.error ? <Muted>{update.error.message}</Muted> : null}
      </View>
    </Card>
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
  aboutLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 },
  aboutLink: { color: colors.primary, textDecorationLine: 'underline', fontSize: 13 },
}));
