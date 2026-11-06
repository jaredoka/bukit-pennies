import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import { Button, Card, Field, Muted, Title } from '@/components/ui';
import { ToggleRow } from '@/components/toggle';
import { APP_VERSION, VERSION_LABEL } from '@/lib/buildInfo';
import { buildDiagnostics } from '@/lib/diagnostics';
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
  // Per-report diagnostics are on by default. This is separate from the global
  // automatic crash-report switch: submitting a report with this visible toggle
  // on is the consent for this payload, and turning it off sends nothing.
  const [withDiagnostics, setWithDiagnostics] = useState(true);

  const userId = session?.user.id ?? '';
  const shortId = userId
    ? `${userId.slice(0, 4).toUpperCase()}-${userId.slice(4, 8).toUpperCase()}`
    : '';

  function toggleDiagnostics(on: boolean) {
    setWithDiagnostics(on);
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
          <ToggleRow
            label="Attach diagnostics"
            description="Build, screen, device model and recent screens. Never amounts, merchants, notes or SMS text."
            value={withDiagnostics}
            onValueChange={toggleDiagnostics}
            accessibilityLabel="Attach diagnostics to this report"
            style={{ marginBottom: 16 }}
          />
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
  version: { textAlign: 'center', fontSize: 12, marginTop: 12 },
}));
