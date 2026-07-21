import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { Centered } from '@/components/ui';
import { initSentry, Sentry } from '@/lib/sentry';
import { SessionProvider, useSession } from '@/lib/session';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { PrivacyProvider } from '@/lib/privacy';
import { PrimaryCurrencyProvider } from '@/lib/primaryCurrency';
import { kvGet, kvSet } from '@/lib/kvStore';
import { isSetupDeferred, onboardedKey } from '@/lib/onboarding';
import { supabase } from '@/lib/supabase';

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
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/landing');
      return;
    }
    if (!session) return;
    // Re-read the flag on every navigation: shortcut-setup flips it when the
    // user completes onboarding, and a stale cached value would bounce them
    // back into setup forever.
    let live = true;
    (async () => {
      let onboarded = (await kvGet(onboardedKey(session.user.id))) === '1';
      // Returning-user heuristic: if the flag was never written but the user
      // already has transactions (e.g. completed setup on a previous install,
      // or pressed "I'll do it later" after the pipeline was already working),
      // stamp them as onboarded so they are never re-prompted.
      if (!onboarded) {
        const { data } = await supabase.from('transactions').select('id').limit(1);
        if (data?.length) {
          await kvSet(onboardedKey(session.user.id), '1');
          onboarded = true;
        }
      }
      if (!live) return;
      const onWelcome = segments[0] === 'welcome';
      const onSetupScreen = (segments as string[]).includes('shortcut-setup');
      if (inAuthGroup && !onResetScreen) {
        router.replace(onboarded ? '/(tabs)' : '/welcome');
      } else if (!onboarded && !onWelcome && !onSetupScreen && !isSetupDeferred()) {
        // Users who haven't completed setup are sent to the guide. "I'll do
        // it later" defers for this launch only — next open re-prompts.
        router.replace('/(tabs)/settings/shortcut-setup');
      }
    })();
    return () => {
      live = false;
    };
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
          <PrimaryCurrencyProvider>
            <PrivacyProvider>
              <ThemedApp />
            </PrivacyProvider>
          </PrimaryCurrencyProvider>
        </ThemeProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}

export default Sentry.wrap(RootLayout);
