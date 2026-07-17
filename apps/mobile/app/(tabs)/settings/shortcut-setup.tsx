import { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Button, Card, Muted, Title } from '@/components/ui';
import { SHORTCUT_DOWNLOAD_URL } from '@/lib/env';
import { themedStyles } from '@/lib/theme';

function CopyRow({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  const [copied, setCopied] = useState(false);
  return (
    <Pressable
      style={styles.copyRow}
      onPress={async () => {
        await Clipboard.setStringAsync(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.copyLabel}>{label}</Text>
        <Text style={styles.copyValue}>{value}</Text>
      </View>
      <Text style={styles.copyHint}>{copied ? 'Copied ✓' : 'Copy'}</Text>
    </Pressable>
  );
}

export default function ShortcutSetup() {
  const styles = useStyles();
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Title>Near-automatic capture on iPhone</Title>
        <Muted>
          iOS apps cannot read SMS, so a ready-made iOS Shortcut forwards bank messages to your
          private endpoint. Download it below — the only thing you type is one paste of your
          capture token.
        </Muted>
      </Card>

      <Card>
        <Title>Step 1 — get your token</Title>
        <Text style={styles.step}>
          Go to Settings → Capture devices → create a device of kind “ios_shortcut”, and copy the
          bp_… token it shows you (shown once).
        </Text>
      </Card>

      <Card>
        <Title>Step 2 — download the ready-made Shortcut</Title>
        <Text style={styles.step}>
          Tap the button, open the downloaded file, and iOS adds the “Bukit Pennies Capture”
          shortcut. Open it once in the Shortcuts app and replace the PASTE-YOUR-TOKEN-HERE text
          with your token. That is the only edit.
        </Text>
        <View style={{ marginTop: 10 }}>
          <Button label="Download the Shortcut" onPress={() => Linking.openURL(SHORTCUT_DOWNLOAD_URL)} />
        </View>
      </Card>

      <Card>
        <Title>Step 3 — make it run on bank SMS</Title>
        <Text style={styles.step}>
          In the Shortcuts app: Automation tab → “+” → Message. Leave “Sender” empty (bank sender
          IDs like Baiduri/BIBD are not phone numbers, so iOS cannot pick them). Set “Message
          Contains” using a template below with your card’s digits appended — this ties the
          automation to one specific card. Pick “Run Immediately” if offered, and set the action
          to “Run Shortcut → Bukit Pennies Capture”.
        </Text>
        <CopyRow label="Baiduri — Message Contains (add your card, e.g. 4x0213)" value="Card No.: " />
        <CopyRow label="BIBD — Message Contains (add your last 4, e.g. 0298)" value="card ending with " />
        <Text style={[styles.step, { marginTop: 10 }]}>
          Add one automation per card you want tracked. Important: if a card is replaced (expiry,
          loss), its digits change and capture silently stops — update the automation. To capture
          every card of a bank with one automation instead, use the template without any digits.
        </Text>
      </Card>

      <Card>
        <Title>Optional — a “Logged …” confirmation</Title>
        <Text style={styles.step}>
          To get a notification like “Logged 5.10 at HUA HO DEPARTME” each time a spend is
          captured, add these actions to the end of the shortcut (after Get Contents of URL):
        </Text>
        <Text style={styles.code}>
          {'1. Get Dictionary Value — key: transaction\n' +
            '   (from: Contents of URL)\n' +
            '2. Get Dictionary Value — key: merchant\n' +
            '   (from: the value from step 1)\n' +
            '3. Get Dictionary Value — key: amount\n' +
            '   (from: the value from step 1)\n' +
            '4. Show Notification — title: Bukit Pennies\n' +
            '   body: Logged [step 3] at [step 2]'}
        </Text>
        <Text style={styles.step}>
          The [bracketed] parts are variable chips you insert from the bar above the keyboard —
          not typed text. Tip: rename the step-2 and step-3 variables to “Merchant” and “Amount”
          so they are easy to tell apart.
        </Text>
      </Card>

      <Card>
        <Title>Test it</Title>
        <Text style={styles.step}>
          Run the shortcut manually on a copied bank message, or wait for a real spend — the
          transaction appears in the app within seconds. If iOS asks for a confirmation tap before
          running, that is an iOS setting, not an error.
        </Text>
      </Card>
    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  step: { color: colors.text, lineHeight: 20 },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  copyLabel: { color: colors.muted, fontSize: 12 },
  copyValue: {
    color: colors.text,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 14,
    marginTop: 2,
  },
  copyHint: { color: colors.primary, fontWeight: '600' },
  code: {
    color: colors.text,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
    lineHeight: 18,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    marginVertical: 10,
  },
}));
