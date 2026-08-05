import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Badge, Button, Card, Centered, Field, Muted, Title } from '@/components/ui';
import { useCreateIngestToken, useDeleteDevice, useDevices, useRevokeDevice } from '@/lib/queries';
import type { TxSource } from '@/lib/types';
import { themedStyles, useTheme } from '@/lib/theme';

const KINDS: { value: TxSource; label: string }[] = [
  { value: 'ios_shortcut', label: 'iOS Shortcut' },
  { value: 'android_listener', label: 'Android Listener' },
];

// Mirrors create_ingest_token in migration 15: a device that has actually
// captured something counts against a tight cap, one that never has against a
// loose one (abandoned Shortcut setups are the common case). The function is
// still the one that enforces this — these constants exist so the screen can
// show the count coming rather than surface a raw Postgres exception.
const USED_CAP = 10;
const UNUSED_CAP = 20;

export default function Devices() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { data, isLoading } = useDevices();
  const create = useCreateIngestToken();
  const revoke = useRevokeDevice();
  const remove = useDeleteDevice();

  const [name, setName] = useState('');
  const [kind, setKind] = useState<TxSource>('ios_shortcut');
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  // Which row a mutation is running for, so only that row shows a spinner.
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Removal is offered only on already-revoked devices, so it can never be
  // mistaken for "stop this token working" — that is what Revoke is for. The
  // warning is about the audit trail: last_seen_at on a revoked token is the
  // evidence of when it was last used, which matters most in exactly the case
  // you revoked for.
  function confirmRemove(id: string, name: string) {
    Alert.alert(
      'Remove this device?',
      `"${name}" is already revoked and cannot log anything. Removing it also erases its record of when it was last used. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setPendingId(id);
            remove.mutate(id, { onSettled: () => setPendingId(null) });
          },
        },
      ],
    );
  }

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

  // Revoked devices are free — the caps count what is still live.
  const active = (data ?? []).filter((d) => !d.revoked_at);
  const usedCount = active.filter((d) => d.last_seen_at).length;
  const unusedCount = active.length - usedCount;
  const usedFull = usedCount >= USED_CAP;
  const unusedFull = unusedCount >= UNUSED_CAP;
  const atCap = usedFull || unusedFull;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Title>New capture device</Title>
        <Muted>
          Each capture path gets its own token. The token is shown once. Store it in the Shortcut
          or listener config, then it can only be revoked, never read again.
        </Muted>
        <View style={{ marginTop: 12 }}>
          <Field label="Device name" value={name} onChangeText={setName} placeholder="e.g. Jared's iPhone Shortcut" />
          <Text style={styles.kindLabel}>Kind</Text>
          <View style={styles.chips}>
            {KINDS.map((k) => (
              <Pressable
                key={k.value}
                onPress={() => setKind(k.value)}
                style={[styles.chip, kind === k.value && styles.chipActive]}
              >
                <Text style={kind === k.value ? styles.chipActiveText : styles.chipText}>{k.label}</Text>
              </Pressable>
            ))}
          </View>
          <Button
            label="Create token"
            onPress={createToken}
            disabled={!name.trim() || atCap}
            busy={create.isPending}
          />
          {atCap ? (
            <Text style={styles.error}>
              {usedFull
                ? `You have ${usedCount} of ${USED_CAP} capture devices in use. Revoke one you no longer use to create another.`
                : `You have ${unusedCount} of ${UNUSED_CAP} devices still awaiting their first capture. Revoke the ones you never finished setting up to create another.`}
            </Text>
          ) : null}
          {create.error ? <Text style={styles.error}>{create.error.message}</Text> : null}
        </View>
      </Card>

      {revealed ? (
        <Card style={{ borderColor: colors.primary, borderWidth: 1 }}>
          <Title>Your new token. Copy it now</Title>
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
          <Button label="Done, I stored it" variant="secondary" onPress={() => setRevealed(null)} />
        </Card>
      ) : null}

      <Card>
        <Title>Devices</Title>
        {(data ?? []).length === 0 ? (
          <Muted>No devices yet.</Muted>
        ) : (
          <Muted>
            {`${usedCount} of ${USED_CAP} devices in use`}
            {unusedCount > 0 ? `  ·  ${unusedCount} of ${UNUSED_CAP} awaiting first capture` : ''}
          </Muted>
        )}
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
              <View style={styles.revokedActions}>
                <Badge label="revoked" tone="danger" />
                <Button
                  label="Remove"
                  variant="secondary"
                  onPress={() => confirmRemove(d.id, d.name)}
                  busy={remove.isPending && pendingId === d.id}
                />
              </View>
            ) : (
              <Button
                label="Revoke"
                variant="danger"
                onPress={() => {
                  setPendingId(d.id);
                  revoke.mutate(d.id, { onSettled: () => setPendingId(null) });
                }}
                busy={revoke.isPending && pendingId === d.id}
              />
            )}
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
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
  // Same weight in both states — see transactions/new.tsx: bolding the
  // selected label widens the pill and re-wraps the row.
  chipActiveText: { color: colors.onPrimary },
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
  revokedActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
}));
