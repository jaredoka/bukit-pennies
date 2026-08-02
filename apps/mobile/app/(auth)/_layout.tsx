import { Stack } from 'expo-router';
import { View } from 'react-native';
import { HexBackground } from '@/components/HexBackground';
import { useTheme } from '@/lib/theme';

/**
 * The signed-out group draws its background once, here, and lets every screen
 * in the stack render over it.
 *
 * Each screen used to mount its own `<HexBackground />`. The coins' progress
 * was already continuous across that — the drivers are module-level — but the
 * field was inside the view the navigator animates, so a push slid the whole
 * background sideways along with the card. Up here it is outside the stack: the
 * card slides, the coins carry on drifting exactly where they were.
 *
 * This is why the screens below set no background colour of their own. The
 * colour lives on the View wrapping the stack, and `contentStyle` makes the
 * screens themselves transparent so it — and the coins — show through.
 */
export default function AuthLayout() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <HexBackground />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
    </View>
  );
}
