import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { Button, Card, colors, Field, Muted, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export default function SignIn() {
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
      <View style={styles.inner}>
        <Text style={styles.brand}>Bukit Pennies</Text>
        <Muted>Card spending, from bank notification text only.</Muted>
        <Card style={{ marginTop: 24 }}>
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
            placeholder="••••••••"
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, justifyContent: 'center', padding: 20, maxWidth: 480, width: '100%', alignSelf: 'center' },
  brand: { fontSize: 28, fontWeight: '800', color: colors.primary },
  error: { color: colors.danger, marginBottom: 8 },
  link: { color: colors.primary, textAlign: 'center', marginTop: 12 },
});
