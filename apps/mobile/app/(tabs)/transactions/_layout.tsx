import { Stack } from 'expo-router';

export default function TransactionsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Transactions' }} />
      <Stack.Screen name="[id]" options={{ title: 'Transaction' }} />
    </Stack>
  );
}
