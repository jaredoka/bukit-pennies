import { useState } from 'react';
import { Alert, ScrollView, Switch, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import { Button, Card, Field, Muted, Title } from '@/components/ui';
import { APP_VERSION, VERSION_LABEL } from '@/lib/buildInfo';
import {
  buildDiagnostics,
  getDiagnosticsConsent,
  setDiagnosticsConsent,
} from '@/lib/diagnostics';
import { MAX_FEEDBACK_DESCRIPTION, useSubmitBugReport } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { themedStyles, useTheme } from '@/lib/theme';

export default function ReportBug() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { session } = useSession();
  const pathname = usePathname();
  const submit = useSubmitBugReport();
  const [description, setDescription] = useState('');
  const [sent, setSent] = useState(false);
  // Mirrors the device preference. Turning it on here is a real opt-in — the
  // same switch lives in Settings > Privacy & diagnostics.
  const [withDiagnostics, setWithDiagnostics] = useState(getDiagnosticsConsent());

  const userId = session?.user.id ?? '';
  const shortId = userId
    ? `${userId.slice(0, 4).toUpperCase()}-${userId.slice(4, 8).toUpperCase()}`
    : '';

  function toggleDiagnostics(on: boolean) {
    setWithDiagnostics(on);
    setDiagnosticsConsent(on);
  }

  async function handleSubmit() {
    if (!description.trim()) return;
    submit.mutate(
      {
        short_id: shortId,
        app_version: APP_VERSION,
        description: description.trim(),
        diagnostics: withDiagnostics ? buildDiagnostics(pathname) : null,
      },
      {
        onSuccess: () => {
          setSent(true);
          setDescription('');
        },
        onError: (err) => Alert.alert('Error', err.message),
      },
    );
  }

  if (sent) {
    return (
      <ScrollView
          style={styles.screen}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
        <Card>
          <Title>Thank you</Title>
          <Muted>
            Your report has been submitted. We'll look into it as soon as possible.
          </Muted>
          <View style={{ marginTop: 12 }}>
            <Button label="Submit another report" variant="secondary" onPress={() => setSent(false)} />
          </View>
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView
          style={styles.screen}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
      <Card>
        <Title>Report a bug</Title>
        <Muted>
          Describe what happened, what you expected, and any steps to reproduce.
        </Muted>
        <View style={{ marginTop: 12 }}>
          <Field
            label="What went wrong?"
            multiline
            value={description}
            onChangeText={setDescription}
            placeholder="I tapped … and then …"
            maxLength={MAX_FEEDBACK_DESCRIPTION}
            style={{ minHeight: 120, textAlignVertical: 'top' }}
          />
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.toggleLabel, { color: colors.text }]}>Attach diagnostics</Text>
              <Muted>
                Build, screen, device model and recent screens. Never amounts, merchants, notes or
                SMS text.
              </Muted>
            </View>
            <Switch
              value={withDiagnostics}
              onValueChange={toggleDiagnostics}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>
          <Button
            label="Submit report"
            onPress={handleSubmit}
            busy={submit.isPending}
            disabled={!description.trim()}
          />
          <Text style={[styles.version, { color: colors.muted }]}>Version {VERSION_LABEL}</Text>
        </View>
      </Card>
    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 4,
  },
  toggleLabel: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  version: { textAlign: 'center', fontSize: 12, marginTop: 12 },
}));
