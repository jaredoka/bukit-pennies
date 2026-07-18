import { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Button, Card, Muted } from '@/components/ui';
import { SHORTCUT_DOWNLOAD_URL } from '@/lib/env';
import { themedStyles, useTheme } from '@/lib/theme';

// ─── Reusable sub-components ────────────────────────────────────────────────

function StepHeader({ number, title }: { number: number; title: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.stepHeader}>
      <View style={[styles.stepBadge, { backgroundColor: colors.primary }]}>
        <Text style={styles.stepBadgeText}>{number}</Text>
      </View>
      <Text style={styles.stepTitle}>{title}</Text>
    </View>
  );
}

function Instruction({ children }: { children: string }) {
  const styles = useStyles();
  return <Text style={styles.instruction}>{children}</Text>;
}

function Tip({ children }: { children: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[styles.tipBox, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <Text style={[styles.tipLabel, { color: colors.primary }]}>Tip  </Text>
      <Text style={[styles.tipText, { color: colors.muted }]}>{children}</Text>
    </View>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);
  return (
    <Pressable
      style={[styles.copyRow, { borderColor: colors.border, backgroundColor: colors.bg }]}
      onPress={async () => {
        await Clipboard.setStringAsync(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      accessibilityLabel={`Copy ${label}`}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.copyLabel, { color: colors.muted }]}>{label}</Text>
        <Text style={[styles.copyValue, { color: colors.text }]}>{value}</Text>
      </View>
      <Text style={[styles.copyHint, { color: copied ? colors.primary : colors.muted }]}>
        {copied ? '✓ Copied' : 'Copy'}
      </Text>
    </Pressable>
  );
}

function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 12 }} />;
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function ShortcutSetup() {
  const styles = useStyles();
  const { colors } = useTheme();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>

      {/* Intro */}
      <Card>
        <Text style={styles.heroTitle}>Near-automatic capture</Text>
        <Muted>
          iOS cannot read SMS for you, so a ready-made Shortcut watches for bank messages and
          forwards them automatically — no copy-pasting needed after setup.
        </Muted>
        <View style={[styles.timePill, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}>
          <Text style={[styles.timePillText, { color: colors.primary }]}>⏱ About 5 minutes to set up</Text>
        </View>
      </Card>

      {/* Step 1 */}
      <Card>
        <StepHeader number={1} title="Create a capture token" />
        <Instruction>
          Go to Settings → Capture → Capture devices & tokens, then tap "Add device". Choose the
          kind "iOS Shortcut" and give it a name (e.g. "My iPhone"). Copy the bp_… token shown —
          it is only displayed once.
        </Instruction>
        <Tip>Store the token somewhere safe (Notes, password manager) before leaving that screen.</Tip>
      </Card>

      {/* Step 2 */}
      <Card>
        <StepHeader number={2} title="Download the Shortcut" />
        <Instruction>
          Tap the button below to download the Bukit Pennies Capture shortcut. iOS will ask to add
          it — tap Add Shortcut. You do not need to edit anything inside it yet.
        </Instruction>
        <View style={{ marginTop: 12 }}>
          <Button
            label="Download the Shortcut"
            onPress={() => Linking.openURL(SHORTCUT_DOWNLOAD_URL)}
          />
        </View>
      </Card>

      {/* Step 3 */}
      <Card>
        <StepHeader number={3} title="Paste your token into the Shortcut" />
        <Instruction>
          Open the Shortcuts app, find "Bukit Pennies Capture", and tap the three-dot (•••) menu
          to edit it. Find the line that says PASTE-YOUR-TOKEN-HERE and replace it with the bp_…
          token you copied in Step 1. That is the only change you need to make.
        </Instruction>
      </Card>

      {/* Step 4 */}
      <Card>
        <StepHeader number={4} title="Create an automation to run it on bank SMS" />
        <Instruction>
          In the Shortcuts app, go to the Automation tab and tap +. Choose "Message", leave
          Sender empty (bank IDs like Baiduri/BIBD are not phone numbers), then set Message
          Contains using one of the templates below — ideally with your card digits added so only
          your card triggers it.
        </Instruction>

        <Divider />
        <CopyRow
          label="Baiduri — paste this, then add your card number (e.g. 4x0213)"
          value="Card No.: "
        />
        <CopyRow
          label="BIBD — paste this, then add your last 4 digits (e.g. 0298)"
          value="card ending with "
        />
        <Divider />

        <Instruction>
          After setting the trigger, choose Run Immediately (if offered) then set the action to
          Run Shortcut → Bukit Pennies Capture.
        </Instruction>
        <Tip>Add one automation per card. If your card is ever replaced, update the digits here — otherwise capture quietly stops.</Tip>
      </Card>

      {/* Step 5 — Optional notification */}
      <Card>
        <StepHeader number={5} title="Optional — get a logged confirmation" />
        <Instruction>
          To see a "Logged BND 5.10 at HUA HO" notification every time a spend is captured, add
          these four actions to the end of the shortcut (after the Get Contents of URL action):
        </Instruction>
        <View style={[styles.codeBlock, { backgroundColor: colors.bg, borderColor: colors.border }]}>
          <Text style={[styles.codeText, { color: colors.text }]}>
            {'1.  Get Dictionary Value\n    Key: transaction  ←  from Contents of URL\n\n' +
              '2.  Get Dictionary Value\n    Key: merchant  ←  from step 1\n\n' +
              '3.  Get Dictionary Value\n    Key: amount  ←  from step 1\n\n' +
              '4.  Show Notification\n    Title: Bukit Pennies\n    Body: Logged [amount] at [merchant]'}
          </Text>
        </View>
        <Tip>The [bracketed] items are variable chips — tap the variable bar above the keyboard to insert them, do not type the brackets.</Tip>
      </Card>

      {/* Good to know */}
      <Card>
        <Text style={[styles.sectionLabel, { color: colors.muted }]}>Good to know</Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>✓</Text>
          <Text style={[styles.infoText, { color: colors.text }]}>
            <Text style={{ fontWeight: '700' }}>Duplicates are ignored.</Text>
            {'  '}If the same SMS arrives twice, only the first is stored — spending is never double-counted.
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>✓</Text>
          <Text style={[styles.infoText, { color: colors.text }]}>
            <Text style={{ fontWeight: '700' }}>Confirmation tap.</Text>
            {'  '}iOS may ask you to confirm before the automation runs — that is an iOS security setting, not an error.
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>✓</Text>
          <Text style={[styles.infoText, { color: colors.text }]}>
            <Text style={{ fontWeight: '700' }}>Test it now.</Text>
            {'  '}Run the shortcut manually on a copied bank message — the transaction should appear in the app within seconds.
          </Text>
        </View>
      </Card>

    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center' },

  heroTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 8 },
  timePill: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  timePillText: { fontSize: 13, fontWeight: '600' },

  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepBadgeText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  stepTitle: { fontSize: 16, fontWeight: '700', color: colors.text, flex: 1 },

  instruction: { color: colors.text, lineHeight: 22, fontSize: 14 },

  tipBox: {
    flexDirection: 'row',
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  tipLabel: { fontWeight: '700', fontSize: 13 },
  tipText: { flex: 1, fontSize: 13, lineHeight: 18 },

  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  copyLabel: { fontSize: 11, marginBottom: 2 },
  copyValue: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 14,
  },
  copyHint: { fontWeight: '600', fontSize: 13 },

  codeBlock: {
    marginVertical: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  codeText: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
    lineHeight: 20,
  },

  sectionLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  infoRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  infoIcon: { fontSize: 16, color: colors.primary, lineHeight: 22 },
  infoText: { flex: 1, fontSize: 14, lineHeight: 22 },
}));
