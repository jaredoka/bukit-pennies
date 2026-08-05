import { Platform, ScrollView } from 'react-native';
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
          note="Almost automatic capture of bank SMS on iPhone"
        />
        {/* Android only. The listener module is designed but deferred until
            after iOS testing, so on iPhone this row was a
            settings entry promising a feature the device will never run — and
            placeholder "coming in a later phase" content is exactly what App
            Review objects to. The screen stays routable (its Stack.Screen is
            still declared) because it becomes reachable on its own the moment
            an Android build ships; this is a platform gate, not the orphaned
            `href: null` mistake that stranded Review. */}
        {Platform.OS === 'android' ? (
          <NavRow
            href="/(tabs)/settings/android-capture"
            icon="logo-android"
            label="Android capture"
            note="Automatic capture from bank notifications"
          />
        ) : null}
      </Card>
    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
}));
