import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { Centered } from '@/components/ui';
import { initSentry, Sentry } from '@/lib/sentry';
import { SessionProvider, useSession } from '@/lib/session';

initSentry();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});

function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    // Recovery links sign the user in and land on reset-password — let them
    // finish choosing the new password before entering the app.
    const onResetScreen = (segments as string[]).includes('reset-password');
    if (!session && !inAuthGroup) router.replace('/(auth)/sign-in');
    if (session && inAuthGroup && !onResetScreen) router.replace('/(tabs)');
  }, [session, loading, segments, router]);

  if (loading) {
    return (
      <Centered>
        <ActivityIndicator size="large" />
      </Centered>
    );
  }
  return <>{children}</>;
}

function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <AuthGate>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }} />
        </AuthGate>
      </SessionProvider>
    </QueryClientProvider>
  );
}

export default Sentry.wrap(RootLayout);
