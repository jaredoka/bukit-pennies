import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { Pressable } from 'react-native';
import { useStackTheme, useTheme } from '@/lib/theme';

// Reached from the dashboard card and from Settings > Spending & data, so the
// index has to stay underneath a deep push to the form.
export const unstable_settings = { initialRouteName: 'index' };

/**
 * Subscriptions is a tab route hidden with `href: null` and reached by pushing,
 * so its index is the *root* of this Stack — and a stack root draws no back
 * button. Since the screen is only ever arrived at from somewhere else, that
 * left it as the one place you could navigate into and not back out of except
 * via the tab bar. `edit` sits on top of the index and gets its back button
 * from the navigator as usual.
 *
 * `canGoBack` is checked because a deep link can land here with nothing behind
 * it; the dashboard is the sensible floor.
 */
function BackButton() {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
      hitSlop={12}
      accessibilityLabel="Go back"
      // Mirrors the trailing inset useStackTheme gives headerRight on web,
      // where the JS header has no native chrome to supply one.
      style={{ paddingLeft: 16, paddingRight: 8 }}
    >
      <Ionicons name="chevron-back" size={26} color={colors.primary} />
    </Pressable>
  );
}

export default function SubscriptionsLayout() {
  return (
    <Stack screenOptions={useStackTheme()}>
      <Stack.Screen
        name="index"
        options={{ title: 'Subscriptions', headerLeft: () => <BackButton /> }}
      />
      <Stack.Screen name="edit" options={{ title: 'Subscription' }} />
    </Stack>
  );
}
