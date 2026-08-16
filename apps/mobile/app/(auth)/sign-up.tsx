import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Linking as RNLinking, Platform, ScrollView, Text, View } from 'react-native';
import { HexBackground } from '@/components/HexBackground';
import { Button, Card, DismissKeyboardView, Field, Title } from '@/components/ui';
import { PRIVACY_POLICY_URL, TERMS_URL } from '@/lib/env';
import { describeRequestError, withNetworkRetry } from '@/lib/netError';
import {
  breachWarning,
  checkPasswordBreached,
  isPasswordLongEnough,
  PASSWORD_HINT,
} from '@/lib/password';
import { supabase } from '@/lib/supabase';
import { themedStyles } from '@/lib/theme';

export default function SignUp() {
  const styles = useStyles();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);

    // Breach screening before the account is created. Fails open by design:
    // an inconclusive lookup lets the signup through.
    const breach = await checkPasswordBreached(password);
    if (breach.breached) {
      setError(breachWarning(breach.count));
      setBusy(false);
      return;
    }

    const { data, error } = await withNetworkRetry(() =>
      supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: displayName.trim() || email.trim() } },
      }),
    );
    if (error) setError(describeRequestError(error.message));
    else if (!data.session) setInfo('Check your email to confirm your account, then sign in.');
    setBusy(false);
  }

  // Same keyboard treatment as sign-in: the card sits below the brand in the
  // upper part of the screen, so the keyboard covers empty space and the
  // top-anchored layout does not shift when it appears. Sign-up is the tallest
  // auth card, so its ScrollView is the safety net on short screens — it
  // scrolls rather than clips.
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
              <Title>Create account</Title>
              <Field label="Display name" value={displayName} onChangeText={setDisplayName} placeholder="Your name" />
              <Field
                label="Email"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
              />
              <Field
                label={`Password (${PASSWORD_HINT})`}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                onSubmitEditing={submit}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {info ? (
                <View style={styles.verifyWrap}>
                  <Text style={styles.info}>{info}</Text>
                </View>
              ) : null}
              {!info ? <Button label="Sign up" onPress={submit} busy={busy} disabled={!email || !isPasswordLongEnough(password)} /> : null}
              <Text style={styles.legal}>
                By signing up you agree to the{' '}
                <Text style={styles.legalLink} onPress={() => RNLinking.openURL(TERMS_URL)}>
                  Terms of Service
                </Text>{' '}
                and{' '}
                <Text style={styles.legalLink} onPress={() => RNLinking.openURL(PRIVACY_POLICY_URL)}>
                  Privacy Policy
                </Text>
                .
              </Text>
              <Link href="/(auth)/sign-in" style={styles.link}>
                Have an account? Sign in
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
  verifyWrap: { alignItems: 'center', gap: 12, marginVertical: 8 },
  info: { color: colors.primary, textAlign: 'center', lineHeight: 20 },
  link: { color: colors.primary, textAlign: 'center', marginTop: 12 },
  legal: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 10, lineHeight: 17 },
  legalLink: { color: colors.primary, textDecorationLine: 'underline' },
}));
