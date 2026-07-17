import { Stack } from 'expo-router';
import { useStackTheme } from '@/lib/theme';

export default function SettingsLayout() {
  return (
    <Stack screenOptions={useStackTheme()}>
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="guide" options={{ title: 'How it works' }} />
      <Stack.Screen name="budgets" options={{ title: 'Monthly budgets' }} />
      <Stack.Screen name="devices" options={{ title: 'Capture devices' }} />
      <Stack.Screen name="shortcut-setup" options={{ title: 'iOS Shortcut setup' }} />
      <Stack.Screen name="android-capture" options={{ title: 'Android capture' }} />
      <Stack.Screen name="delete-account" options={{ title: 'Delete account' }} />
    </Stack>
  );
}
