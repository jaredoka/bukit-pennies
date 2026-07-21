import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { themedStyles } from '@/lib/theme';

// Gateway page: the first screen a signed-out user sees. One screen, no
// carousel; its only job is context and trust before the auth forms.
export default function Landing() {
  const styles = useStyles();
  const router = useRouter();

  return (
    <View style={styles.screen}>
      <Text style={styles.brand}>Bukit Pennies</Text>
      <View style={styles.inner}>
        <Text style={styles.pitch}>
          Your bank notification texts, turned into a spending dashboard automatically and privately.
        </Text>
        <View style={{ gap: 10, marginTop: 28 }}>
          <Button label="Create account" onPress={() => router.push('/(auth)/sign-up')} />
          <Button label="Log in" variant="secondary" onPress={() => router.push('/(auth)/sign-in')} />
        </View>
      </View>
    </View>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, justifyContent: 'center', padding: 24, maxWidth: 480, width: '100%', alignSelf: 'center' },
  brand: { position: 'absolute', top: 72, left: 0, right: 0, fontSize: 34, fontWeight: '800', color: colors.primary, textAlign: 'center' },
  pitch: { fontSize: 17, lineHeight: 25, color: colors.text, marginBottom: 4 },
}));
