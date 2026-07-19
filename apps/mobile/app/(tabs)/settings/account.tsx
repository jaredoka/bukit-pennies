import { useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { Button, Card, Muted, Title } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { themedStyles } from '@/lib/theme';

export default function Account() {
  const styles = useStyles();
  const { session } = useSession();
  const router = useRouter();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Title>Account</Title>
        <Muted>{session?.user.email ?? ''}</Muted>
        <View style={{ marginTop: 12 }}>
          <Button label="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />
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
