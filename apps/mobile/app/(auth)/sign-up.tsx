import { Link } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking as RNLinking,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, Card, Field, Muted, Title } from '@/components/ui';
import { PRIVACY_POLICY_URL, TERMS_URL } from '@/lib/env';
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
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: displayName.trim() || email.trim() } },
    });
    if (error) setError(error.message);
    else if (!data.session) setInfo('Check your email to confirm your account, then sign in.');
    setBusy(false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.brand}>Bukit Pennies</Text>
        <Muted>Email and password only. No bank logins, ever.</Muted>
        <Card style={{ marginTop: 24 }}>
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
            label="Password (min 8 characters)"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            onSubmitEditing={submit}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {info ? <Text style={styles.info}>{info}</Text> : null}
          <Button label="Sign up" onPress={submit} busy={busy} disabled={!email || password.length < 8} />
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
    </KeyboardAvoidingView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, justifyContent: 'center', padding: 20, maxWidth: 480, width: '100%', alignSelf: 'center' },
  brand: { fontSize: 28, fontWeight: '800', color: colors.primary },
  error: { color: colors.danger, marginBottom: 8 },
  info: { color: colors.primary, marginBottom: 8 },
  link: { color: colors.primary, textAlign: 'center', marginTop: 12 },
  legal: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 10, lineHeight: 17 },
  legalLink: { color: colors.primary, textDecorationLine: 'underline' },
}));
