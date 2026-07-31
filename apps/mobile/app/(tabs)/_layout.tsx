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
        headerTitleAlign: 'center',
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
        name="insights"
        options={{
          title: 'Insights',
          tabBarIcon: ({ color, size }) => <Ionicons name="trending-up" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="goals"
        options={{
          title: 'Goals',
          // The nested Stack draws the header, which also gives header actions
          // the standard 16pt trailing inset — the Tabs header put them flush
          // against the safe-area edge and needed headerRightContainerStyle to
          // compensate.
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="flag" color={color} size={size} />,
        }}
      />
      {/* Off the tab bar, reached from the dashboard banner and the Transactions
          header. It was hidden here with nothing linking to it at all for
          several releases, which left every low-confidence parse and every
          flagged duplicate somewhere no user could act on them. */}
      <Tabs.Screen
        name="review"
        options={{
          href: null,
        }}
      />
      {/* Reached from the dashboard card and Settings > Spending & data. Five
          tabs is already the comfortable maximum on a phone. */}
      <Tabs.Screen
        name="subscriptions"
        options={{
          href: null,
          // The nested Stack draws the header; without this the tab header
          // stacks a second, lowercased "subscriptions" bar above it.
          headerShown: false,
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
