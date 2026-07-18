import { Stack } from 'expo-router';
import { useStackTheme } from '@/lib/theme';

export default function TransactionsLayout() {
  return (
    <Stack screenOptions={useStackTheme()}>
      <Stack.Screen name="index" options={{ title: 'Transactions' }} />
      <Stack.Screen name="[id]" options={{ title: 'Transaction' }} />
      <Stack.Screen name="new" options={{ title: 'Add transaction' }} />
    </Stack>
  );
}
