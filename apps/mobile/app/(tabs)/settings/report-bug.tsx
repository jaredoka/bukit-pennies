import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { Button, Card, Field, Muted, Title } from '@/components/ui';
import { useSubmitBugReport } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { themedStyles, useTheme } from '@/lib/theme';

export default function ReportBug() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { session } = useSession();
  const submit = useSubmitBugReport();
  const [description, setDescription] = useState('');
  const [sent, setSent] = useState(false);

  const userId = session?.user.id ?? '';
  const shortId = userId
    ? `${userId.slice(0, 4).toUpperCase()}-${userId.slice(4, 8).toUpperCase()}`
    : '—';
  const appVersion = Constants.expoConfig?.version ?? '—';

  async function handleSubmit() {
    if (!description.trim()) return;
    submit.mutate(
      { short_id: shortId, app_version: appVersion, description: description.trim() },
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
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
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
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Title>Report a bug</Title>
        <Muted>
          Describe what happened, what you expected, and any steps to reproduce. Your User ID and
          app version are attached automatically.
        </Muted>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Text style={[styles.metaLabel, { color: colors.muted }]}>User ID</Text>
            <Text style={[styles.metaValue, { color: colors.text }]}>{shortId}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={[styles.metaLabel, { color: colors.muted }]}>Version</Text>
            <Text style={[styles.metaValue, { color: colors.text }]}>v{appVersion}</Text>
          </View>
        </View>

        <Field
          label="What went wrong?"
          multiline
          value={description}
          onChangeText={setDescription}
          placeholder="I tapped … and then …"
          style={{ minHeight: 120, textAlignVertical: 'top' }}
        />
        <Button
          label="Submit report"
          onPress={handleSubmit}
          busy={submit.isPending}
          disabled={!description.trim()}
        />
      </Card>
    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 16,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaItem: { flex: 1 },
  metaLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  metaValue: { fontSize: 14, fontWeight: '600' },
}));
