import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Card, Field, Muted, Title } from '@/components/ui';
import { useProfile, useUpdateProfile } from '@/lib/queries';
import { themedStyles } from '@/lib/theme';

export default function Budget() {
  const styles = useStyles();
  const profile = useProfile();
  const update = useUpdateProfile();
  const [draft, setDraft] = useState<string | null>(null);
  const saved = profile.data?.monthly_income == null ? '' : String(Number(profile.data.monthly_income));
  const value = draft ?? saved;
  const parsed = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed > 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Title>Monthly limit</Title>
        <Muted>
          Set your monthly limit. This can be your income, a spending cap, or any figure you want
          to track against. The dashboard shows how much of it you&apos;ve used each month.
        </Muted>
        <View style={{ marginTop: 12 }}>
          <Field
            label="Amount ($)"
            value={value}
            onChangeText={setDraft}
            placeholder="e.g. 2500"
            keyboardType="decimal-pad"
          />
          <Button
            label={update.isSuccess && draft === null ? 'Saved ✓' : 'Set amount'}
            onPress={() => {
              update.mutate({ monthly_income: parsed }, { onSuccess: () => setDraft(null) });
            }}
            disabled={!valid || value === saved}
            busy={update.isPending}
          />
          {update.error ? <Muted>{update.error.message}</Muted> : null}
        </View>
      </Card>
    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
}));
