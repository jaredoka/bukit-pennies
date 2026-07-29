import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import Constants from 'expo-constants';
import { Button, Card, Chip, Field, Muted, Title } from '@/components/ui';
import { MAX_FEEDBACK_DESCRIPTION, useSubmitFeatureRequest } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { themedStyles } from '@/lib/theme';

const AREAS = [
  'Capture',
  'Transactions',
  'Budgets & goals',
  'Insights',
  'Notifications',
  'Something else',
] as const;

export default function FeatureRequest() {
  const styles = useStyles();
  const { session } = useSession();
  const submit = useSubmitFeatureRequest();
  const [area, setArea] = useState<string>(AREAS[0]);
  const [description, setDescription] = useState('');
  const [sent, setSent] = useState(false);

  const userId = session?.user.id ?? '';
  const shortId = userId
    ? `${userId.slice(0, 4).toUpperCase()}-${userId.slice(4, 8).toUpperCase()}`
    : '';
  const appVersion = Constants.expoConfig?.version ?? '';

  function handleSubmit() {
    if (!description.trim()) return;
    submit.mutate(
      { short_id: shortId, app_version: appVersion, area, description: description.trim() },
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
            Your request has been sent. We read every one — it helps us decide what to build next.
          </Muted>
          <View style={{ marginTop: 12 }}>
            <Button
              label="Request another feature"
              variant="secondary"
              onPress={() => setSent(false)}
            />
          </View>
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Title>Request a feature</Title>
        <Muted>
          Tell us what you wish the app could do. The more you say about how you'd use it, the
          better.
        </Muted>
        <View style={{ marginTop: 12 }}>
          <Muted>Which part of the app?</Muted>
          <View style={styles.chips}>
            {AREAS.map((a) => (
              <Chip key={a} label={a} active={area === a} onPress={() => setArea(a)} />
            ))}
          </View>
          <Field
            label="What would you like to see?"
            multiline
            value={description}
            onChangeText={setDescription}
            placeholder="It would help if the app could …"
            maxLength={MAX_FEEDBACK_DESCRIPTION}
            style={{ minHeight: 120, textAlignVertical: 'top' }}
          />
          <Button
            label="Send request"
            onPress={handleSubmit}
            busy={submit.isPending}
            disabled={!description.trim()}
          />
        </View>
      </Card>
    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 16 },
}));
