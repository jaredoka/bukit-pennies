import { ScrollView, Text } from 'react-native';
import { Card } from '@/components/ui';
import { themedStyles } from '@/lib/theme';

export default function Coffee() {
  const styles = useStyles();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Text style={styles.emoji}>☕🚫</Text>
        <Text style={styles.shout}>WHAT ARE YOU DOING?</Text>
        <Text style={styles.shout}>DO NOT BUY ME COFFEE!</Text>
        <Text style={styles.body}>
          SAVE YOUR MONEY AND SEND IT TO YOUR SAVINGS OR INVESTMENT ACCOUNTS!
        </Text>
        <Text style={styles.footnote}>
          This app exists to help you keep your pennies. Keeping them is the whole point.
        </Text>
      </Card>
    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  emoji: { fontSize: 48, textAlign: 'center', marginBottom: 12 },
  shout: { fontSize: 22, fontWeight: '800', color: colors.danger, textAlign: 'center' },
  body: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginTop: 12,
  },
  footnote: { textAlign: 'center', marginTop: 16, color: colors.muted, fontSize: 13 },
}));
