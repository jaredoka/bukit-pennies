import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
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

  // Seed the field once profile loads, but don't overwrite mid-edit.
  useEffect(() => {
    if (profile.data?.display_name != null && displayName === '') {
      setDisplayName(profile.data.display_name);
    }
  }, [profile.data?.display_name]);

  async function resetPassword() {
    const email = session?.user.email;
    if (!email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Email sent', `A password reset link has been sent to ${email}. Open it on this device to choose a new password.`);
    }
  }

  async function signInToOtherAccount() {
    await supabase.auth.signOut();
    // AuthGate redirects to landing once session clears.
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Title>Account</Title>
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
        <View style={{ marginTop: 12, gap: 8 }}>
          <Button label="Reset password" variant="secondary" onPress={resetPassword} />
          <Button label="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />
          <Button
            label="Sign in to a different account"
            variant="secondary"
            onPress={() =>
              Alert.alert(
                'Sign in to a different account',
                'You will be signed out of this account first.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Continue', onPress: signInToOtherAccount },
                ],
              )
            }
          />
        </View>
      </Card>

      <Card>
        <Title>Danger zone</Title>
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
