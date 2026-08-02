import { Link } from 'expo-router';
import { useState } from 'react';
import { Linking as RNLinking, Text, View } from 'react-native';
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
    // an inconclusive lookup lets the signup through (HANDOFF §18).
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

  // Not KeyboardAvoidingView — see the note on sign-in: `padding` behaviour
  // shrank the screen under a vertically-centred card, so focusing a field slid
  // the whole form up. The keyboard overlays instead. This is the tallest auth
  // card, so it is also the one whose button the keyboard can reach on a short
  // screen: tap the background to dismiss, or just press return in the password
  // field, which submits.
  return (
    <DismissKeyboardView style={styles.screen}>
      <Text style={styles.brand}>Bukit Pennies</Text>
      <View style={styles.inner}>
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
    </DismissKeyboardView>
  );
}

const useStyles = themedStyles((colors) => ({
  // See sign-in: the group's layout owns the background.
  screen: { flex: 1 },
  inner: { flex: 1, justifyContent: 'center', padding: 20, maxWidth: 480, width: '100%', alignSelf: 'center' },
  brand: { position: 'absolute', top: 72, left: 0, right: 0, fontSize: 34, fontWeight: '800', color: colors.primary, textAlign: 'center' },
  error: { color: colors.danger, marginBottom: 8 },
  verifyWrap: { alignItems: 'center', gap: 12, marginVertical: 8 },
  info: { color: colors.primary, textAlign: 'center', lineHeight: 20 },
  link: { color: colors.primary, textAlign: 'center', marginTop: 12 },
  legal: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 10, lineHeight: 17 },
  legalLink: { color: colors.primary, textDecorationLine: 'underline' },
}));
