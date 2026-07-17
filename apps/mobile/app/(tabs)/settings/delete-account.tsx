import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Button, Card, Field, Muted, Title } from '@/components/ui';
import { clearStoredToken } from '@/lib/tokenStore';
import { supabase } from '@/lib/supabase';
import { themedStyles } from '@/lib/theme';

export default function DeleteAccount() {
  const styles = useStyles();
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function deleteAccount() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('delete_account');
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    await clearStoredToken();
    await supabase.auth.signOut();
    // The auth gate redirects to sign-in once the session is gone.
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Title>Delete your account</Title>
        <Text style={styles.body}>
          This permanently deletes your account and every transaction, note, category, card, and
          capture token attached to it. There is no undo and no grace period — the rows are removed
          from the database immediately.
        </Text>
        <Muted>
          If you only want to stop a capture path, revoke its token under Capture devices instead.
        </Muted>
      </Card>
      <Card>
        <Field
          label={'Type DELETE to confirm'}
          value={confirmText}
          onChangeText={setConfirmText}
          autoCapitalize="characters"
          placeholder="DELETE"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label="Permanently delete my account"
          variant="danger"
          onPress={deleteAccount}
          disabled={confirmText.trim() !== 'DELETE'}
          busy={busy}
        />
      </Card>
    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  body: { color: colors.text, lineHeight: 20, marginBottom: 8 },
  error: { color: colors.danger, marginBottom: 8 },
}));
