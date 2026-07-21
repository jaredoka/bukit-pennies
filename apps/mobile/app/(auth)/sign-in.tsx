import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { HexBackground } from '@/components/HexBackground';
import { Button, Card, Field, Title } from '@/components/ui';
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
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(error.message);
    setBusy(false);
    // On success the AuthGate redirects to the tabs.
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <HexBackground />
      <Text style={styles.brand}>Bukit Pennies</Text>
      <View style={styles.inner}>
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
            placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
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
    </KeyboardAvoidingView>

  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, justifyContent: 'center', padding: 20, maxWidth: 480, width: '100%', alignSelf: 'center' },
  brand: { position: 'absolute', top: 72, left: 0, right: 0, fontSize: 34, fontWeight: '800', color: colors.primary, textAlign: 'center' },
  error: { color: colors.danger, marginBottom: 8 },
  link: { color: colors.primary, textAlign: 'center', marginTop: 12 },
}));
