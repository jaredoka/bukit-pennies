import { Stack } from 'expo-router';
import { useStackTheme } from '@/lib/theme';

// Reached from the dashboard card and from Settings > Spending & data, so the
// index has to stay underneath a deep push to the form.
export const unstable_settings = { initialRouteName: 'index' };

export default function SubscriptionsLayout() {
  return (
    <Stack screenOptions={useStackTheme()}>
      <Stack.Screen name="index" options={{ title: 'Subscriptions' }} />
      <Stack.Screen name="edit" options={{ title: 'Subscription' }} />
    </Stack>
  );
}
