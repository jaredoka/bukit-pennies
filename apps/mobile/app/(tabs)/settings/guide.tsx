import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, colors, Muted, Title } from '@/components/ui';

const SECTIONS: Array<{ title: string; body: string }> = [
  {
    title: 'What Bukit Pennies is',
    body:
      'It logs your card spending by reading the notification text your bank already sends ' +
      '(like Baiduri’s SMS) and turns it into a dashboard. It never connects to your bank — ' +
      'no passwords, no account linking. Only notification text you hand it is ever processed.',
  },
  {
    title: 'Capturing a spend',
    body:
      'Paste: copy the bank message, open Capture, and check the live preview before saving. ' +
      'iPhone: set up the Shortcuts automation (Settings → iOS Shortcut setup) and bank SMS ' +
      'are forwarded to your private inbox as they arrive. The same message never counts twice.',
  },
  {
    title: 'Review inbox',
    body:
      'Messages the parser wasn’t confident about wait in Review — nothing is guessed silently. ' +
      'Fill in the amount, merchant, or date and confirm; flagged near-duplicates can be merged ' +
      'away or kept.',
  },
  {
    title: 'Notes & categories',
    body:
      'Tap any transaction to add notes, pick a category (or create your own), re-parse it from ' +
      'the original text, or delete it. The original message always stays with the transaction.',
  },
  {
    title: 'Where your data lives',
    body:
      'Your transactions, notes, and categories are stored in a Supabase (Postgres) cloud project. ' +
      'Row-level security in the database means your account can only ever see its own rows. ' +
      'Your password is stored as a salted hash by Supabase Auth. Capture tokens are stored only ' +
      'as SHA-256 fingerprints — the plaintext is shown once, on your device. Your sign-in ' +
      'session lives in the device’s secure storage and is removed on sign-out. Bank credentials ' +
      'are stored nowhere, because they are never asked for.',
  },
  {
    title: 'Capture tokens',
    body:
      'Each capture path (Shortcut, paste, …) has its own bp_ token — create and revoke them in ' +
      'Settings → Capture devices. Revoking one path never affects the others.',
  },
];

export default function Guide() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Title>How Bukit Pennies works</Title>
        <Muted>The short version of the user guide. Full guide: docs/user-guide.md in the project repository.</Muted>
      </Card>
      {SECTIONS.map((s) => (
        <Card key={s.title}>
          <Title>{s.title}</Title>
          <Text style={styles.body}>{s.body}</Text>
        </Card>
      ))}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  body: { color: colors.text, lineHeight: 20 },
});
