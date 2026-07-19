import { Stack } from 'expo-router';
import { useStackTheme } from '@/lib/theme';

export default function SettingsLayout() {
  return (
    <Stack screenOptions={useStackTheme()}>
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="account" options={{ title: 'Account' }} />
      <Stack.Screen name="appearance" options={{ title: 'Appearance' }} />
      <Stack.Screen name="budget" options={{ title: 'Monthly limit' }} />
      <Stack.Screen name="spending" options={{ title: 'Spending & data' }} />
      <Stack.Screen name="capture" options={{ title: 'Capture' }} />
      <Stack.Screen name="about" options={{ title: 'About' }} />
      <Stack.Screen name="coffee" options={{ title: 'Buy me a coffee!' }} />
      <Stack.Screen name="guide" options={{ title: 'How it works' }} />
      <Stack.Screen name="budgets" options={{ title: 'Monthly budgets' }} />
      <Stack.Screen name="weekly-summary" options={{ title: 'Weekly summary' }} />
      <Stack.Screen name="goals" options={{ title: 'Savings goals' }} />
      <Stack.Screen name="devices" options={{ title: 'Capture devices' }} />
      <Stack.Screen name="shortcut-setup" options={{ title: 'iOS Shortcut setup' }} />
      <Stack.Screen name="shortcut-visual-guide" options={{ title: 'Visual guide' }} />
      <Stack.Screen name="android-capture" options={{ title: 'Android capture' }} />
      <Stack.Screen name="delete-account" options={{ title: 'Delete account' }} />
    </Stack>
  );
}
