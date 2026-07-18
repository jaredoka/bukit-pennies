import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, Muted, Title } from '@/components/ui';
import { themedStyles, useTheme } from '@/lib/theme';

function Row({ href, icon, label, note }: { href: Href; icon: keyof typeof Ionicons.glyphMap; label: string; note: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Link href={href} asChild>
      <Pressable style={styles.row}>
        <Ionicons name={icon} size={22} color={colors.primary} style={{ marginRight: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Muted>{note}</Muted>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
    </Link>
  );
}

export default function Capture() {
  const styles = useStyles();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Title>Capture</Title>
        <Row
          href="/(tabs)/settings/devices"
          icon="key"
          label="Capture devices & tokens"
          note="Create, reveal once, and revoke ingest tokens"
        />
        <Row
          href="/(tabs)/settings/shortcut-setup"
          icon="logo-apple"
          label="iOS Shortcut setup"
          note="Near-automatic capture of bank SMS on iPhone"
        />
        <Row
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: { fontWeight: '600', color: colors.text },
}));
