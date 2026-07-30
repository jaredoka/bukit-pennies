import { Stack } from 'expo-router';
import { useStackTheme } from '@/lib/theme';

// A tab hosting a Stack, like subscriptions/: the list is the tab and the
// create form is pushed on top of it.
export const unstable_settings = { initialRouteName: 'index' };

export default function GoalsLayout() {
  return (
    <Stack screenOptions={useStackTheme()}>
      <Stack.Screen name="index" options={{ title: 'Goals' }} />
      <Stack.Screen name="new" options={{ title: 'New goal' }} />
      {/* Title is set per-goal by the screen itself. */}
      <Stack.Screen name="edit" options={{ title: 'Goal' }} />
    </Stack>
  );
}
