import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, Stack } from 'expo-router';
import { Pressable } from 'react-native';
import { useStackTheme, useTheme } from '@/lib/theme';
// ui import removed by theme codemod

export default function TransactionsLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={useStackTheme()}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Transactions',
          headerRight: () => (
            <Link href="/(tabs)/transactions/new" asChild>
              <Pressable hitSlop={8} accessibilityLabel="Add transaction manually">
                <Ionicons name="add-circle-outline" size={26} color={colors.primary} />
              </Pressable>
            </Link>
          ),
        }}
      />
      <Stack.Screen name="[id]" options={{ title: 'Transaction' }} />
      <Stack.Screen name="new" options={{ title: 'Add transaction' }} />
    </Stack>
  );
}
