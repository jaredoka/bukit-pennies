import { ScrollView, StyleSheet } from 'react-native';
import { Card, Muted, Title } from '@/components/ui';
import { themedStyles } from '@/lib/theme';

export default function AndroidCapture() {
  const styles = useStyles();
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Title>Automatic capture on Android</Title>
        <Muted>
          On Android, Bukit Pennies will use a notification listener to capture bank SMS and
          bank-app notifications automatically, with no manual steps per message. This module ships in
          a later phase; until then, use the Capture tab to paste messages.
        </Muted>
      </Card>
      <Card>
        <Title>What it will (and won't) do</Title>
        <Muted>
          The listener reads only the notification text of allowlisted bank apps and SMS apps, on
          your device, and forwards it to your private ingest endpoint. It never connects to your
          bank, never reads other notifications, and you can revoke its token at any time from
          Capture devices.
        </Muted>
      </Card>
    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
}));
