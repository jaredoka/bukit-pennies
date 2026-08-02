import { Link } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
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

  // Not KeyboardAvoidingView, deliberately. `behavior="padding"` shrinks the
  // screen when the keyboard opens, and because the card is vertically centred
  // inside it, tapping a field slid the whole form upward. The other auth
  // screens (forgot-password, reset-password) never did this, so the form
  // appeared to move on some screens and not others. Now the card stays put
  // everywhere, the keyboard simply covers what it covers, and a tap on the
  // background puts it away again.
  return (
    <DismissKeyboardView style={styles.screen}>
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
    </DismissKeyboardView>
  );
}

const useStyles = themedStyles((colors) => ({
  // No background colour: the group's layout owns it, and painting it again
  // here would hide the shared coin field behind the stack.
  screen: { flex: 1 },
  inner: { flex: 1, justifyContent: 'center', padding: 20, maxWidth: 480, width: '100%', alignSelf: 'center' },
  brand: { position: 'absolute', top: 72, left: 0, right: 0, fontSize: 34, fontWeight: '800', color: colors.primary, textAlign: 'center' },
  error: { color: colors.danger, marginBottom: 8 },
  link: { color: colors.primary, textAlign: 'center', marginTop: 12 },
}));
