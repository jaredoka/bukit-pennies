import { ScrollView, StyleSheet, Text } from 'react-native';
import { Card, colors, Muted, Title } from '@/components/ui';
import { INGEST_URL } from '@/lib/env';

const STEPS = [
  'Create a capture token: Settings → Capture devices → New capture device (kind: ios_shortcut). Copy the token — it is shown once.',
  'On your iPhone open the Shortcuts app → Automation tab → “+” → Message.',
  'Set the trigger: “When I get a message containing ‘Merchant:’ from Baiduri” (add one automation per bank sender). Choose “Run Immediately” if your iOS version offers it.',
  'Add the action “Get Contents of URL” and configure it:',
  'Repeat the automation for each bank sender ID (Baiduri, BIBD, StanChart) once real message formats are collected.',
];

export default function ShortcutSetup() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Title>Near-automatic capture on iPhone</Title>
        <Muted>
          iOS apps cannot read SMS, so Bukit Pennies uses an iOS Shortcuts automation that forwards
          bank messages to your private ingest endpoint. Depending on your iOS version and
          settings, iOS may ask for a confirmation tap before the Shortcut runs.
        </Muted>
      </Card>
      {STEPS.map((step, i) => (
        <Card key={i}>
          <Title>{`Step ${i + 1}`}</Title>
          <Text style={styles.step}>{step}</Text>
          {i === 3 ? (
            <Text style={styles.code}>
              {`URL:     ${INGEST_URL}\n` +
                `Method:  POST\n` +
                `Headers: Authorization: Bearer <your token>\n` +
                `         Content-Type: application/json\n` +
                `Body (JSON):\n` +
                `  text:   Shortcut input → Message content\n` +
                `  source: "ios_shortcut"\n` +
                `  sender: Shortcut input → Sender`}
            </Text>
          ) : null}
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  step: { color: colors.text, lineHeight: 20 },
  code: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: colors.text,
    backgroundColor: colors.bg,
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
  },
});
