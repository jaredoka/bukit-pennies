import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { themedStyles, useTheme } from '@/lib/theme';

// Gateway page: the first screen a signed-out user sees. One screen, no
// carousel; its only job is context and trust before the auth forms.
export default function Landing() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <View style={styles.screen}>
      <View style={styles.inner}>
        <Text style={styles.brand}>Bukit Pennies</Text>
        <Text style={styles.pitch}>
          Your bank already texts you every time you spend. Bukit Pennies turns those messages
          into a spending dashboard, automatically.
        </Text>
        <View style={[styles.trustBox, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '40' }]}>
          <Text style={[styles.trustText, { color: colors.text }]}>
            Never connects to your bank. No passwords, no account linking. It only reads
            notification text.
          </Text>
        </View>
        <View style={{ gap: 10, marginTop: 28 }}>
          <Button label="Create account" onPress={() => router.push('/(auth)/sign-up')} />
          <Button label="Log in" variant="secondary" onPress={() => router.push('/(auth)/sign-in')} />
        </View>
        <Text style={[styles.footnote, { color: colors.muted }]}>Free. Made for Brunei.</Text>
      </View>
    </View>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, justifyContent: 'center', padding: 24, maxWidth: 480, width: '100%', alignSelf: 'center' },
  brand: { fontSize: 34, fontWeight: '800', color: colors.primary },
  pitch: { fontSize: 17, lineHeight: 25, color: colors.text, marginTop: 12 },
  trustBox: { marginTop: 20, padding: 14, borderRadius: 10, borderWidth: 1 },
  trustText: { fontSize: 14, lineHeight: 20 },
  footnote: { textAlign: 'center', marginTop: 16, fontSize: 13 },
}));
