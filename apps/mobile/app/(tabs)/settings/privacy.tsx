import { useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { Card, Muted, Title } from '@/components/ui';
import { BUILD_NUMBER, GIT_SHA, VERSION_LABEL } from '@/lib/buildInfo';
import { getDiagnosticsConsent, setDiagnosticsConsent } from '@/lib/diagnostics';
import { themedStyles, useTheme } from '@/lib/theme';

// The consent switch for everything diagnostic: Sentry crash reports and the
// diagnostics attached to a bug report. Default is off. The screen spells out
// the allowlist because "we collect some technical data" is not something a
// user can meaningfully agree to.
export default function Privacy() {
  const styles = useStyles();
  const { colors } = useTheme();
  const [enabled, setEnabled] = useState(getDiagnosticsConsent());

  function toggle(on: boolean) {
    setEnabled(on);
    setDiagnosticsConsent(on);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Title>Privacy & diagnostics</Title>
        <Muted>
          Diagnostics help fix crashes and bugs. They are off by default and only ever sent
          while this switch is on.
        </Muted>
        <Pressable
          style={styles.switchRow}
          onPress={() => toggle(!enabled)}
          accessibilityRole="switch"
          accessibilityState={{ checked: enabled }}
          accessibilityLabel="Send crash and diagnostic reports"
        >
          <Text style={[styles.switchLabel, { color: colors.text }]}>Send diagnostics</Text>
          <Switch
            value={enabled}
            onValueChange={toggle}
            trackColor={{ false: colors.switchOff, true: colors.primary }}
            ios_backgroundColor={colors.switchOff}
          />
        </Pressable>
      </Card>

      <Card>
        <Title>What is collected</Title>
        <Muted>
          When something crashes, or when you attach diagnostics to a bug report:
        </Muted>
        <View style={styles.list}>
          <Text style={[styles.item, { color: colors.text }]}>• The screen you were on and recent screens</Text>
          <Text style={[styles.item, { color: colors.text }]}>• App version, build number and commit</Text>
          <Text style={[styles.item, { color: colors.text }]}>• Device model, OS version, locale and screen size</Text>
          <Text style={[styles.item, { color: colors.text }]}>• The error and where in the code it happened</Text>
        </View>
      </Card>

      <Card>
        <Title>What is never collected</Title>
        <View style={styles.list}>
          <Text style={[styles.item, { color: colors.text }]}>• Amounts, balances or budgets</Text>
          <Text style={[styles.item, { color: colors.text }]}>• Merchant names, notes or tags</Text>
          <Text style={[styles.item, { color: colors.text }]}>• Raw SMS text or message contents</Text>
          <Text style={[styles.item, { color: colors.text }]}>• Card or account numbers</Text>
        </View>
        <Muted>
          Your email address is not attached. Turning the switch off stops new reports and clears
          the screens held on this device.
        </Muted>
      </Card>

      <Card>
        <Title>This build</Title>
        <Muted>Version {VERSION_LABEL}</Muted>
        <Muted>Build {BUILD_NUMBER}</Muted>
        <Muted>Commit {GIT_SHA}</Muted>
      </Card>
    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center', gap: 16 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBg,
  },
  switchLabel: { fontSize: 15, fontWeight: '500' },
  list: { marginTop: 12, gap: 6 },
  item: { fontSize: 14, lineHeight: 20 },
}));
