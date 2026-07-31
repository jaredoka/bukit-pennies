import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { HexBackground } from '@/components/HexBackground';
import { Button, Card, Field, Muted, Title } from '@/components/ui';
import {
  breachWarning,
  checkPasswordBreached,
  isPasswordLongEnough,
  PASSWORD_HINT,
} from '@/lib/password';
import { supabase } from '@/lib/supabase';
import { themedStyles } from '@/lib/theme';

/**
 * Landing screen for the password-recovery email link. On web the supabase
 * client exchanges the ?code= itself (detectSessionInUrl); on native we get
 * the code from the deep-link URL and exchange it here.
 */
export default function ResetPassword() {
  const styles = useStyles();
  const url = Linking.useURL();
  const [ready, setReady] = useState(Platform.OS === 'web');
  const [password, setPassword] = useState('');
  // Two distinct failures with different remedies: `linkError` means the
  // recovery link itself is bad (ask for a new one), `formError` means the
  // chosen password was rejected (pick another) — so they can't share copy.
  const [linkError, setLinkError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' || !url) return;
    const code = Linking.parse(url).queryParams?.code;
    if (typeof code !== 'string') return;
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) setLinkError(error.message);
      else setReady(true);
    });
  }, [url]);

  async function submit() {
    setBusy(true);
    setFormError(null);

    // Same breach screening as sign-up; fails open (HANDOFF §18).
    const breach = await checkPasswordBreached(password);
    if (breach.breached) {
      setFormError(breachWarning(breach.count));
      setBusy(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setFormError(error.message);
      setBusy(false);
      return;
    }

    // Revoke every OTHER session, keeping this one. GoTrue does not invalidate
    // sibling refresh tokens on a password change, so without this a token
    // captured from another device survives the reset.
    //
    // SEC-4 (HANDOFF §18) fixed only the signed-in path — Settings > Account
    // signs out globally before mailing the link. It left the path that
    // matters: someone whose account is compromised cannot sign in, so they
    // arrive here through "Forgot password" on the sign-in screen, where
    // nothing had been revoked at all.
    //
    // Failure is not surfaced. The password is already changed by this point,
    // and sending the user back to a form for a step that has succeeded would
    // be worse than the residual risk of a stale sibling session.
    const { error: revokeError } = await supabase.auth.signOut({ scope: 'others' });
    if (revokeError) console.warn('could not revoke other sessions:', revokeError.message);

    router.replace('/(tabs)');
  }

  return (
    <View style={styles.screen}>
      <HexBackground />
      <Text style={styles.brand}>Bukit Pennies</Text>
      <View style={styles.inner}>
        <Card>
          <Title>Choose a new password</Title>
          {!ready && !linkError ? <Muted>Verifying your reset link…</Muted> : null}
          {ready ? (
            <>
              <Field
                label={`New password (${PASSWORD_HINT})`}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                onSubmitEditing={submit}
              />
              <Button
                label="Set new password"
                onPress={submit}
                busy={busy}
                disabled={!isPasswordLongEnough(password)}
              />
            </>
          ) : null}
          {formError ? <Text style={styles.error}>{formError}</Text> : null}
          {linkError ? (
            <Text style={styles.error}>
              {linkError}. Request a new link from the sign-in screen.
            </Text>
          ) : null}
        </Card>
      </View>
    </View>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, justifyContent: 'center', padding: 20, maxWidth: 480, width: '100%', alignSelf: 'center' },
  brand: { position: 'absolute', top: 72, left: 0, right: 0, fontSize: 34, fontWeight: '800', color: colors.primary, textAlign: 'center' },
  error: { color: colors.danger, marginTop: 8 },
}));
