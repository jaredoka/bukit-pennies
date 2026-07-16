import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { Button, Card, colors, Field, Muted, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export default function SignUp() {
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
        <Muted>Email + password only — no bank logins, ever.</Muted>
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
          <Link href="/(auth)/sign-in" style={styles.link}>
            Have an account? Sign in
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
  info: { color: colors.primary, marginBottom: 8 },
  link: { color: colors.primary, textAlign: 'center', marginTop: 12 },
});
