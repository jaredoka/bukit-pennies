import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { HexBackground } from '@/components/HexBackground';
import { HornbillMascot } from '@/components/HornbillMascot';
import { Button } from '@/components/ui';
import { themedStyles } from '@/lib/theme';

const MASCOT = 40;
const FEET_Y = 91; // measured screen-y of the visible top of the lowercase "s" (fontSize 34)

// Gateway page: the first screen a signed-out user sees. One screen, no
// carousel; its only job is context and trust before the auth forms.
export default function Landing() {
  const styles = useStyles();
  const router = useRouter();
  const { width: screenW } = useWindowDimensions();

  // Two hidden measurers locate the final "s" precisely without splitting the
  // title (splitting breaks the layout when the title wraps on narrow screens).
  const [wFull, setWFull] = useState(0);
  const [wPrefix, setWPrefix] = useState(0);
  const titleLeft = (screenW - wFull) / 2; // brand is centred across the screen
  const sCenter = titleLeft + (wPrefix + wFull) / 2;
  const ready = wFull > 0 && wPrefix > 0 && wFull < screenW; // hide if the title would wrap

  return (
    <View style={styles.screen}>
      <HexBackground />
      <Text style={styles.brand} numberOfLines={1}>
        Bukit Pennies
      </Text>
      <Text style={styles.measure} onLayout={(e) => setWFull(e.nativeEvent.layout.width)}>
        Bukit Pennies
      </Text>
      <Text style={styles.measure} onLayout={(e) => setWPrefix(e.nativeEvent.layout.width)}>
        Bukit Pennie
      </Text>
      {ready ? (
        <View style={{ position: 'absolute', top: FEET_Y - MASCOT, left: sCenter - MASCOT / 2 }}>
          <HornbillMascot animation="tail" size={MASCOT} blinkChance={0.3} flip />
        </View>
      ) : null}
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
  measure: { position: 'absolute', top: 0, left: 0, opacity: 0, fontSize: 34, fontWeight: '800' },
  pitch: { fontSize: 17, lineHeight: 25, color: colors.text, marginBottom: 4 },
}));
