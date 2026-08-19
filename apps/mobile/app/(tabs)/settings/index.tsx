import { useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useScrollToTop } from 'expo-router';
import { NavRow } from '@/components/ui';
import { themedStyles, useTheme } from '@/lib/theme';
import Constants from 'expo-constants';

export default function Settings() {
  const styles = useStyles();
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  // Re-tapping the active Settings tab returns to the top.
  useScrollToTop(scrollRef);
  const version = Constants.expoConfig?.version ?? '—';

  return (
    <ScrollView ref={scrollRef} style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.group}>
        <NavRow
          inset
          href="/(tabs)/settings/account"
          icon="person"
          label="Account"
          note="Sign out, reset password, manage your account"
        />
        <NavRow
          inset
          href="/(tabs)/settings/appearance"
          icon="color-palette"
          label="Appearance"
          note="Light, dark, or follow system theme"
        />
        <NavRow
          inset
          href="/(tabs)/settings/budget"
          icon="wallet"
          label="Monthly limit"
          note="Set the amount the dashboard measures against"
        />
        <NavRow
          inset
          href="/(tabs)/settings/spending"
          icon="pie-chart"
          label="Spending & data"
          note="Category budgets, subscriptions, export"
        />
        <NavRow
          inset
          href="/(tabs)/settings/notifications"
          icon="notifications"
          label="Notifications"
          note="Weekly summary and spending alerts"
        />
        <NavRow
          inset
          href="/(tabs)/settings/capture"
          icon="clipboard"
          label="Capture"
          note="Devices and capture setup"
        />
        <NavRow
          inset
          href="/(tabs)/settings/guide"
          icon="help-circle"
          label="How the app works"
          note="Using the app and where your data is stored"
        />
        <NavRow
          inset
          href="/(tabs)/settings/report-bug"
          icon="bug"
          label="Report a bug"
          note="Let us know if something isn't working"
        />
        <NavRow
          inset
          href="/(tabs)/settings/feature-request"
          icon="bulb"
          label="Request a feature"
          note="Tell us what you'd like the app to do"
        />
        <NavRow
          inset
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
  versionNote: { textAlign: 'center', fontSize: 12 },
}));
