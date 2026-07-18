import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { Centered } from '@/components/ui';
import { initSentry, Sentry } from '@/lib/sentry';
import { SessionProvider, useSession } from '@/lib/session';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { PrivacyProvider } from '@/lib/privacy';
import { kvGet } from '@/lib/kvStore';
import { onboardedKey } from './welcome';

initSentry();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});

function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();
  // null = unknown (still reading the device flag for this user)
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) {
      setOnboarded(null);
      return;
    }
    let live = true;
    kvGet(onboardedKey(userId)).then((v) => {
      if (live) setOnboarded(v === '1');
    });
    return () => {
      live = false;
    };
  }, [userId]);

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    // Recovery links sign the user in and land on reset-password — let them
    // finish choosing the new password before entering the app.
    const onResetScreen = (segments as string[]).includes('reset-password');
    if (!session && !inAuthGroup) router.replace('/(auth)/sign-in');
    if (session && inAuthGroup && !onResetScreen) {
      if (onboarded === null) return; // flag still loading — hold the redirect
      router.replace(onboarded ? '/(tabs)' : '/welcome');
    }
  }, [session, loading, segments, router, onboarded]);

  if (loading) {
    return (
      <Centered>
        <ActivityIndicator size="large" />
      </Centered>
    );
  }
  return <>{children}</>;
}

function ThemedApp() {
  const { colors, resolved } = useTheme();
  return (
    <AuthGate>
      <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}
      />
    </AuthGate>
  );
}

function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <ThemeProvider>
          <PrivacyProvider>
            <ThemedApp />
          </PrivacyProvider>
        </ThemeProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}

export default Sentry.wrap(RootLayout);
