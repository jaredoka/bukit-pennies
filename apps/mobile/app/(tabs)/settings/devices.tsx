import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Badge, Button, Card, Centered, colors, Field, Muted, Title } from '@/components/ui';
import { useCreateIngestToken, useDevices, useRevokeDevice } from '@/lib/queries';
import type { TxSource } from '@/lib/types';

const KINDS: TxSource[] = ['ios_shortcut', 'paste', 'share', 'android_listener'];

export default function Devices() {
  const { data, isLoading } = useDevices();
  const create = useCreateIngestToken();
  const revoke = useRevokeDevice();

  const [name, setName] = useState('');
  const [kind, setKind] = useState<TxSource>('ios_shortcut');
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  function createToken() {
    create.mutate(
      { name: name.trim(), kind },
      {
        onSuccess: (token) => {
          setRevealed(token);
          setCopiedToken(false);
          setName('');
        },
      },
    );
  }

  if (isLoading) {
    return (
      <Centered>
        <ActivityIndicator size="large" />
      </Centered>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Title>New capture device</Title>
        <Muted>
          Each capture path (iPhone Shortcut, this app's paste screen, …) gets its own token. The
          token is shown once — store it in the Shortcut, then it can only be revoked, never read
          again.
        </Muted>
        <View style={{ marginTop: 12 }}>
          <Field label="Device name" value={name} onChangeText={setName} placeholder="e.g. Jared's iPhone Shortcut" />
          <Text style={styles.kindLabel}>Kind</Text>
          <View style={styles.chips}>
            {KINDS.map((k) => (
              <Pressable
                key={k}
                onPress={() => setKind(k)}
                style={[styles.chip, kind === k && styles.chipActive]}
              >
                <Text style={kind === k ? styles.chipActiveText : styles.chipText}>{k}</Text>
              </Pressable>
            ))}
          </View>
          <Button label="Create token" onPress={createToken} disabled={!name.trim()} busy={create.isPending} />
          {create.error ? <Text style={styles.error}>{create.error.message}</Text> : null}
        </View>
      </Card>

      {revealed ? (
        <Card style={{ borderColor: colors.primary, borderWidth: 1 }}>
          <Title>Your new token — copy it now</Title>
          <Muted>This is the only time it will be shown.</Muted>
          <Text selectable style={styles.token}>
            {revealed}
          </Text>
          <Button
            label={copiedToken ? 'Copied ✓' : 'Copy token'}
            onPress={async () => {
              await Clipboard.setStringAsync(revealed);
              setCopiedToken(true);
            }}
          />
          <View style={{ height: 8 }} />
          <Button label="Done — I stored it" variant="secondary" onPress={() => setRevealed(null)} />
        </Card>
      ) : null}

      <Card>
        <Title>Devices</Title>
        {(data ?? []).length === 0 ? <Muted>No devices yet.</Muted> : null}
        {(data ?? []).map((d) => (
          <View key={d.id} style={styles.deviceRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.deviceName}>{d.name}</Text>
              <Muted>
                {d.kind}
                {d.last_seen_at ? `  ·  last used ${d.last_seen_at.slice(0, 10)}` : '  ·  never used'}
              </Muted>
            </View>
            {d.revoked_at ? (
              <Badge label="revoked" tone="danger" />
            ) : (
              <Button label="Revoke" variant="danger" onPress={() => revoke.mutate(d.id)} busy={revoke.isPending} />
            )}
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  kindLabel: { color: colors.muted, fontSize: 13, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text },
  chipActiveText: { color: '#fff', fontWeight: '600' },
  token: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.bg,
    padding: 12,
    borderRadius: 8,
    marginVertical: 12,
  },
  error: { color: colors.danger, marginTop: 8 },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  deviceName: { fontWeight: '600', color: colors.text },
});
