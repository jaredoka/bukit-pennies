import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { HexBackground } from '@/components/HexBackground';
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

  // Top-anchored layout: the card sits in the upper part of the screen below
  // the brand, so the keyboard covers empty space rather than the form. The
  // KeyboardAvoidingView (padding) shortens the ScrollView to the area above
  // the keyboard; because the card is anchored at the top this causes no
  // movement — the earlier version vertically centred the card, so shrinking
  // the container pushed the whole block up with the keyboard. Tall cards
  // (sign-up) scroll within the ScrollView instead of clipping. `handled`
  // keeps field and button taps working while the keyboard is up, and a tap on
  // the background still dismisses it via DismissKeyboardView.
  return (
    <DismissKeyboardView style={styles.screen}>
      <HexBackground />
      <Text style={styles.brand}>Bukit Pennies</Text>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.center}>
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
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </DismissKeyboardView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center' },
  scrollContent: { flexGrow: 1, padding: 20, paddingTop: 140 },
  center: { flex: 1 },
  brand: { position: 'absolute', top: 72, left: 0, right: 0, fontSize: 34, fontWeight: '800', color: colors.primary, textAlign: 'center' },
  error: { color: colors.danger, marginBottom: 8 },
  link: { color: colors.primary, textAlign: 'center', marginTop: 12 },
}));
