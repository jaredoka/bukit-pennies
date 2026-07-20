import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Muted } from '@/components/ui';
import { themedStyles, useTheme } from '@/lib/theme';
import Constants from 'expo-constants';

function Row({ href, icon, label, note, danger }: { href: Href; icon: keyof typeof Ionicons.glyphMap; label: string; note: string; danger?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const iconColor = danger ? colors.danger : colors.primary;
  const labelStyle = danger ? [styles.rowLabel, { color: colors.danger }] : styles.rowLabel;
  return (
    <Link href={href} asChild>
      <Pressable style={styles.row}>
        <Ionicons name={icon} size={22} color={iconColor} style={{ marginRight: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={labelStyle}>{label}</Text>
          <Muted>{note}</Muted>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
    </Link>
  );
}

export default function Settings() {
  const styles = useStyles();
  const { colors } = useTheme();
  const version = Constants.expoConfig?.version ?? '—';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.group}>
        <Row
          href="/(tabs)/settings/account"
          icon="person"
          label="Account"
          note="Sign out, reset password, manage your account"
        />
        <Row
          href="/(tabs)/settings/appearance"
          icon="color-palette"
          label="Appearance"
          note="Light, dark, or follow system theme"
        />
        <Row
          href="/(tabs)/settings/budget"
          icon="wallet"
          label="Monthly limit"
          note="Set the amount the dashboard measures against"
        />
        <Row
          href="/(tabs)/settings/spending"
          icon="pie-chart"
          label="Spending & data"
          note="Category budgets, savings goals, export"
        />
        <Row
          href="/(tabs)/settings/notifications"
          icon="notifications"
          label="Notifications"
          note="Weekly summary and spending alerts"
        />
        <Row
          href="/(tabs)/settings/capture"
          icon="clipboard"
          label="Capture"
          note="Devices, iOS Shortcut, Android listener"
        />
        <Row
          href="/(tabs)/settings/guide"
          icon="help-circle"
          label="How the app works"
          note="Using the app and where your data is stored"
        />
        <Row
          href="/(tabs)/settings/coffee"
          icon="cafe"
          label="Buy me a coffee!"
          note="Support the developer"
        />
        <Row
          href="/(tabs)/settings/report-bug"
          icon="bug"
          label="Report a bug"
          note="Let us know if something isn't working"
        />
        <Row
          href="/(tabs)/settings/about"
          icon="information-circle"
          label="About"
          note="Privacy policy, terms, and support"
        />
      </View>

      <Text style={[styles.versionNote, { color: colors.muted }]}>
        Bukit Pennies v{version}
      </Text>
    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 24, maxWidth: 720, width: '100%', alignSelf: 'center', paddingBottom: 32 },
  group: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: { fontWeight: '600', color: colors.text },
  versionNote: { textAlign: 'center', fontSize: 12 },
}));
