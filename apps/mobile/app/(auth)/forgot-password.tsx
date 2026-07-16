import * as Linking from 'expo-linking';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Button, Card, colors, Field, Muted, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const redirectTo =
      Platform.OS === 'web'
        ? `${globalThis.location.origin}/reset-password`
        : Linking.createURL('reset-password');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error) setError(error.message);
    else setSent(true);
    setBusy(false);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.inner}>
        <Text style={styles.brand}>Bukit Pennies</Text>
        <Card style={{ marginTop: 24 }}>
          <Title>Reset password</Title>
          {sent ? (
            <Muted>
              If an account exists for that email, a reset link is on its way. Open it on this
              device to choose a new password.
            </Muted>
          ) : (
            <>
              <Muted>Enter your account email and we'll send a reset link.</Muted>
              <View style={{ marginTop: 12 }}>
                <Field
                  label="Email"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  onSubmitEditing={submit}
                />
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button label="Send reset link" onPress={submit} busy={busy} disabled={!email.trim()} />
            </>
          )}
          <Link href="/(auth)/sign-in" style={styles.link}>
            Back to sign in
          </Link>
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, justifyContent: 'center', padding: 20, maxWidth: 480, width: '100%', alignSelf: 'center' },
  brand: { fontSize: 28, fontWeight: '800', color: colors.primary },
  error: { color: colors.danger, marginBottom: 8 },
  link: { color: colors.primary, textAlign: 'center', marginTop: 12 },
});
