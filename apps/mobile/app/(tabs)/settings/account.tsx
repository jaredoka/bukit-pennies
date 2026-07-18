import { ScrollView, View } from 'react-native';
import { Button, Card, Muted, Title } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { themedStyles } from '@/lib/theme';

export default function Account() {
  const styles = useStyles();
  const { session } = useSession();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Title>Account</Title>
        <Muted>{session?.user.email ?? ''}</Muted>
        <View style={{ marginTop: 12 }}>
          <Button label="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />
        </View>
      </Card>
    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
}));
