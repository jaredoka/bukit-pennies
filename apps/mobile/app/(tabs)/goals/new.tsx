import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Button, Card, Field, Muted, Title } from '@/components/ui';
import { useCreateSavingsGoal } from '@/lib/queries';
import { usePrimaryCurrency } from '@/lib/primaryCurrency';
import { themedStyles } from '@/lib/theme';

export default function NewGoal() {
  const styles = useStyles();
  const { currency: primaryCurrency } = usePrimaryCurrency();
  const create = useCreateSavingsGoal();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');

  const targetNum = Number(target);
  const valid = name.trim() !== '' && Number.isFinite(targetNum) && targetNum > 0;

  function submit() {
    if (!valid) return;
    create.mutate(
      { name: name.trim(), target: targetNum, currency: primaryCurrency },
      { onSuccess: () => router.back() },
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Title>New goal</Title>
        <Muted>Set a target and add to it whenever you put money aside.</Muted>
        <View style={{ marginTop: 12 }}>
          <Field
            label="Goal"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Investments, Holidays, new gadget"
            autoFocus
          />
          <Field
            label={`Target (${primaryCurrency})`}
            value={target}
            onChangeText={setTarget}
            placeholder="e.g. 3000"
            keyboardType="decimal-pad"
          />
        </View>
        {/* A goal's currency is fixed when it is created and never changes,
            so the choice has to be made before saving. */}
        <Muted>{`Tracked in your primary currency (${primaryCurrency}), which is fixed once the goal is created. To use a different one, change it in Settings > Appearance first.`}</Muted>
      </Card>

      {create.error ? <Text style={styles.error}>{create.error.message}</Text> : null}
      <Button label="Create goal" onPress={submit} disabled={!valid} busy={create.isPending} />
    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center', paddingBottom: 32 },
  error: { color: colors.danger, marginBottom: 8 },
}));
