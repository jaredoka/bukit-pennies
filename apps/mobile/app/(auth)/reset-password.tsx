import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Button, Card, colors, Field, Muted, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';

/**
 * Landing screen for the password-recovery email link. On web the supabase
 * client exchanges the ?code= itself (detectSessionInUrl); on native we get
 * the code from the deep-link URL and exchange it here.
 */
export default function ResetPassword() {
  const url = Linking.useURL();
  const [ready, setReady] = useState(Platform.OS === 'web');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' || !url) return;
    const code = Linking.parse(url).queryParams?.code;
    if (typeof code !== 'string') return;
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) setError(error.message);
      else setReady(true);
    });
  }, [url]);

  async function submit() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    router.replace('/(tabs)');
  }

  return (
    <View style={styles.screen}>
      <View style={styles.inner}>
        <Text style={styles.brand}>Bukit Pennies</Text>
        <Card style={{ marginTop: 24 }}>
          <Title>Choose a new password</Title>
          {!ready && !error ? <Muted>Verifying your reset link…</Muted> : null}
          {ready ? (
            <>
              <Field
                label="New password (min 8 characters)"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                onSubmitEditing={submit}
              />
              <Button
                label="Set new password"
                onPress={submit}
                busy={busy}
                disabled={password.length < 8}
              />
            </>
          ) : null}
          {error ? (
            <Text style={styles.error}>
              {error} — request a new link from the sign-in screen.
            </Text>
          ) : null}
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, justifyContent: 'center', padding: 20, maxWidth: 480, width: '100%', alignSelf: 'center' },
  brand: { fontSize: 28, fontWeight: '800', color: colors.primary },
  error: { color: colors.danger, marginTop: 8 },
});
