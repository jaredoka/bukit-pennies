import { ScrollView } from 'react-native';
import { Card, NavRow, Title } from '@/components/ui';
import { themedStyles } from '@/lib/theme';

export default function Capture() {
  const styles = useStyles();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Title>Capture</Title>
        <NavRow
          href="/(tabs)/settings/devices"
          icon="key"
          label="Capture devices & tokens"
          note="Create, reveal once, and revoke ingest tokens"
        />
        <NavRow
          href="/(tabs)/settings/shortcut-setup"
          icon="logo-apple"
          label="iOS Shortcut setup"
          note="Near-automatic capture of bank SMS on iPhone"
        />
        <NavRow
          href="/(tabs)/settings/android-capture"
          icon="logo-android"
          label="Android capture"
          note="Notification listener (coming in a later phase)"
        />
      </Card>
    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
}));
