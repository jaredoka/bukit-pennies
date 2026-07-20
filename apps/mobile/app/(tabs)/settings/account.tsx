import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Button, Card, Field, Muted, Title } from '@/components/ui';
import { useProfile, useUpdateProfile } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { themedStyles, useTheme } from '@/lib/theme';

export default function Account() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { session } = useSession();
  const router = useRouter();
  const profile = useProfile();
  const updateProfile = useUpdateProfile();
  const [displayName, setDisplayName] = useState('');
  const [copiedId, setCopiedId] = useState(false);

  // Seed the field once profile loads, but don't overwrite mid-edit.
  useEffect(() => {
    if (profile.data?.display_name != null && displayName === '') {
      setDisplayName(profile.data.display_name);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.data?.display_name]);

  async function resetPassword() {
    const email = session?.user.email;
    if (!email) return;
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
        `A password reset link has been sent to ${email}. Tap it on this device to choose a new password.`,
      );
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    // AuthGate redirects to landing once session clears.
  }

  async function switchAccount() {
    await supabase.auth.signOut();
  }

  // Short user-facing ID derived from the auth UUID — first 8 hex chars,
  // formatted as XXXX-XXXX. Long enough to be unique; short enough to read.
  const userId = session?.user.id;
  const shortId = userId
    ? `${userId.slice(0, 4).toUpperCase()}-${userId.slice(4, 8).toUpperCase()}`
    : '—';

  async function copyId() {
    if (!userId) return;
    await Clipboard.setStringAsync(shortId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1500);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>

      {/* ── Profile ── */}
      <Card>
        <Title>Profile</Title>
        <Muted>{session?.user.email ?? ''}</Muted>

        {/* User ID chip */}
        <Pressable style={styles.idRow} onPress={copyId} accessibilityLabel="Copy user ID">
          <Text style={[styles.idLabel, { color: colors.muted }]}>User ID</Text>
          <Text style={[styles.idValue, { color: colors.text }]}>{shortId}</Text>
          <Text style={[styles.idCopy, { color: copiedId ? colors.primary : colors.muted }]}>
            {copiedId ? '✓ Copied' : 'Copy'}
          </Text>
        </Pressable>

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
          We'll email a reset link to {session?.user.email ?? 'your account email'}. Open the link
          on this device to choose a new password.
        </Muted>
        <View style={{ marginTop: 12 }}>
          <Button label="Send reset link" variant="secondary" onPress={resetPassword} />
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
  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    gap: 8,
  },
  idLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  idValue: {
    flex: 1,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 1,
  },
  idCopy: { fontSize: 13, fontWeight: '600' },
}));
