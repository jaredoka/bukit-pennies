import { Link } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { HexBackground } from '@/components/HexBackground';
import { KeyboardGlide } from '@/components/KeyboardGlide';
import { Button, Card, DismissKeyboardView, Field, Title } from '@/components/ui';
import { describeRequestError, withNetworkRetry } from '@/lib/netError';
import { supabase } from '@/lib/supabase';
import { themedStyles } from '@/lib/theme';

export default function SignIn() {
  const styles = useStyles();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const { error } = await withNetworkRetry(() =>
      supabase.auth.signInWithPassword({ email: email.trim(), password }),
    );
    if (error) setError(describeRequestError(error.message));
    setBusy(false);
    // On success the AuthGate redirects to the tabs.
  }

  // Centred layout: the brand and card sit as one vertically-centred group (the
  // PayPal/Revolut look). When the keyboard opens, KeyboardGlide glides the
  // group up to rest just above it and back down on dismiss — the whole block
  // lifting is intentional-looking, unlike shrinking a centred container, which
  // re-centres in the leftover space and reads as the page being pushed up. The
  // ScrollView is the safety net for short screens where the card is taller
  // than the space the keyboard leaves; `handled` keeps field and button taps
  // working while the keyboard is up, and a tap on the background still
  // dismisses it via DismissKeyboardView.
  return (
    <DismissKeyboardView style={styles.screen}>
      <HexBackground />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <KeyboardGlide style={styles.glide}>
          <Text style={styles.brand}>Bukit Pennies</Text>
          <Card>
              <Title>Sign in</Title>
              <Field
                label="Email"
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
              />
              <Field
                label="Password"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                onSubmitEditing={submit}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button label="Sign in" onPress={submit} busy={busy} disabled={!email || !password} />
              <Link href="/(auth)/forgot-password" style={styles.link}>
                Forgot password?
              </Link>
              <Link href="/(auth)/sign-up" style={styles.link}>
                No account? Sign up
              </Link>
            </Card>
          </KeyboardGlide>
        </ScrollView>
      </DismissKeyboardView>
    );
  }

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { flexGrow: 1, padding: 20 },
  glide: { flexGrow: 1, justifyContent: 'center' },
  brand: { fontSize: 34, fontWeight: '800', color: colors.primary, textAlign: 'center', marginBottom: 24 },
  error: { color: colors.danger, marginBottom: 8 },
  link: { color: colors.primary, textAlign: 'center', marginTop: 12 },
}));
