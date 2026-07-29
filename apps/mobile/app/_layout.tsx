import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { ActivityIndicator } from 'react-native';
import { Centered } from '@/components/ui';
import { initSentry, Sentry } from '@/lib/sentry';
import { SessionProvider, useSession } from '@/lib/session';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { PrivacyProvider } from '@/lib/privacy';
import { PrimaryCurrencyProvider } from '@/lib/primaryCurrency';
import { kvGet, kvSet } from '@/lib/kvStore';
import { onboardedKey } from '@/lib/onboarding';
import { supabase } from '@/lib/supabase';

initSentry();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});

function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const heuristicRunFor = useRef<string | null>(null);
  // undefined = nothing seen yet, so the first session is not a "change".
  const lastUserId = useRef<string | null | undefined>(undefined);

  // The QueryClient is module-scoped and outlives sign-out, so without this
  // the next account to sign in on this device renders the previous account's
  // cached transactions, profile and goals until every query refetches. Same
  // family of leak as the device-global ingest token (HANDOFF §18, SEC-1).
  useEffect(() => {
    if (loading) return;
    const uid = session?.user.id ?? null;
    if (lastUserId.current !== undefined && lastUserId.current !== uid) {
      queryClient.clear();
      heuristicRunFor.current = null;
    }
    lastUserId.current = uid;
  }, [session?.user.id, loading]);

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
      //
      // Once per session, not once per navigation. This effect re-runs on
      // every segment change, so a user with no transactions yet — exactly the
      // new user who is on a phone in a mall carpark — was firing a round trip
      // on every single tap between tabs.
      if (!onboarded && heuristicRunFor.current !== session.user.id) {
        heuristicRunFor.current = session.user.id;
        const { data } = await supabase.from('transactions').select('id').limit(1);
        if (data?.length) {
          await kvSet(onboardedKey(session.user.id), '1');
          onboarded = true;
        }
      }
      if (!live) return;
      if (inAuthGroup && !onResetScreen) {
        // First run still lands on /welcome for the paste-your-SMS hero; from
        // there the user is free to move around the app.
        router.replace(onboarded ? '/(tabs)' : '/welcome');
      }
      // Deliberately no redirect into the setup guide. Capture setup is the
      // point of the app, but it is promoted by a dismissible dashboard card
      // and a permanent Settings entry, not enforced by a gate that a user who
      // cannot finish it has no way past (HANDOFF §22).
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
