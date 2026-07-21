import * as Linking from 'expo-linking';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { HexBackground } from '@/components/HexBackground';
import { Button, Card, Field, Muted, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { themedStyles } from '@/lib/theme';

export default function ForgotPassword() {
  const styles = useStyles();
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
      <HexBackground />
      <Text style={styles.brand}>Bukit Pennies</Text>
      <View style={styles.inner}>
        <Card>
          <Title>Reset password</Title>
          {sent ? (
            <Muted>
              If an account exists for that email, a reset link is on its way. Open it on this
              device to choose a new password.{'\n\n'}If you don't see it within a minute, check your spam or junk folder.
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

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, justifyContent: 'center', padding: 20, maxWidth: 480, width: '100%', alignSelf: 'center' },
  brand: { position: 'absolute', top: 72, left: 0, right: 0, fontSize: 34, fontWeight: '800', color: colors.primary, textAlign: 'center' },
  error: { color: colors.danger, marginBottom: 8 },
  link: { color: colors.primary, textAlign: 'center', marginTop: 12 },
}));
