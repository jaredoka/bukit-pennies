import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, View } from 'react-native';
import { Button, Card, Field, Muted, Title } from '@/components/ui';
import { useProfile, useUpdateProfile } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { themedStyles } from '@/lib/theme';

export default function Account() {
  const styles = useStyles();
  const { session } = useSession();
  const router = useRouter();
  const profile = useProfile();
  const updateProfile = useUpdateProfile();
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    if (profile.data?.display_name != null && displayName === '') {
      setDisplayName(profile.data.display_name);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.data?.display_name]);

  const [resetBusy, setResetBusy] = useState(false);

  async function resetPassword() {
    const email = session?.user.email;
    if (!email) return;
    setResetBusy(true);
    try {
      await supabase.auth.signOut({ scope: 'local' });
      const redirectTo =
        Platform.OS === 'web'
          ? `${globalThis.location.origin}/reset-password`
          : Linking.createURL('reset-password');
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) {
        Alert.alert('Error', error.message);
      } else {
        Alert.alert(
          'Check your email',
          `A reset link has been sent to ${email}. Tap it on this device to choose a new password.`,
        );
      }
    } finally {
      setResetBusy(false);
    }
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) Alert.alert('Error', error.message);
  }

  async function switchAccount() {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) Alert.alert('Error', error.message);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>

      {/* ── Profile ── */}
      <Card>
        <Title>Profile</Title>
        <Muted>{session?.user.email ?? ''}</Muted>
        <View style={{ marginTop: 16 }}>
          <Field
            label="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={() =>
              updateProfile.mutate({ display_name: displayName.trim() || null })
            }
          />
          <Button
            label="Save"
            onPress={() => updateProfile.mutate({ display_name: displayName.trim() || null })}
            busy={updateProfile.isPending}
            disabled={displayName.trim() === (profile.data?.display_name ?? '')}
          />
        </View>
      </Card>

      {/* ── Password ── */}
      <Card>
        <Title>Password</Title>
        <Muted>
          We'll email a reset link to {session?.user.email ?? 'your account email'}. Tap it on
          this device to choose a new password. You'll be signed out first.
        </Muted>
        <View style={{ marginTop: 12 }}>
          <Button label="Send reset link" variant="secondary" onPress={resetPassword} busy={resetBusy} />
        </View>
      </Card>

      {/* ── Session ── */}
      <Card>
        <Title>Session</Title>
        <View style={{ gap: 8 }}>
          <Button label="Sign out" variant="secondary" onPress={signOut} />
          <Button
            label="Sign in to a different account"
            variant="secondary"
            onPress={() =>
              Alert.alert(
                'Sign in to a different account',
                'You will be signed out of this account first.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Continue', onPress: switchAccount },
                ],
              )
            }
          />
        </View>
      </Card>

      {/* ── Close account ── */}
      <Card>
        <Title>Close account</Title>
        <Muted>Permanently remove your account and all data. This cannot be undone.</Muted>
        <View style={{ marginTop: 12 }}>
          <Button
            label="Delete account"
            variant="danger"
            onPress={() => router.push('/(tabs)/settings/delete-account')}
          />
        </View>
      </Card>

    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
}));
