import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
// ui import removed by theme codemod
import { useRealtimeTransactions } from '@/lib/queries';
import { useTheme } from '@/lib/theme';

export default function TabsLayout() {
  const { colors } = useTheme();
  useRealtimeTransactions();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.card },
        headerTitleStyle: { fontWeight: '700', color: colors.text },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transactions',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="list" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="goals"
        options={{
          title: 'Goals',
          tabBarIcon: ({ color, size }) => <Ionicons name="flag" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="review"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="capture"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="settings" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
