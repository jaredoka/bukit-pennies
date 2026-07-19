import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Button, Card, Centered, Field, Muted, Title } from '@/components/ui';
import {
  useAddToSavingsGoal,
  useCreateSavingsGoal,
  useDeleteSavingsGoal,
  useSavingsGoals,
} from '@/lib/queries';
import { usePrivacy } from '@/lib/privacy';
import { themedStyles, useTheme } from '@/lib/theme';
import type { SavingsGoalRow } from '@/lib/types';

export default function GoalsTab() {
  const styles = useStyles();
  const { data, isLoading } = useSavingsGoals();
  const create = useCreateSavingsGoal();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const targetNum = Number(target);
  const valid = name.trim() !== '' && Number.isFinite(targetNum) && targetNum > 0;

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
        <Title>New goal</Title>
        <Muted>Set a target and add to it whenever you put money aside.</Muted>
        <View style={{ marginTop: 12 }}>
          <Field label="Goal" value={name} onChangeText={setName} placeholder="e.g. Investments, Holidays, new gadget" />
          <Field
            label="Target ($)"
            value={target}
            onChangeText={setTarget}
            placeholder="e.g. 3000"
            keyboardType="decimal-pad"
          />
          <Button
            label="Create goal"
            onPress={() =>
              create.mutate(
                { name: name.trim(), target: targetNum },
                { onSuccess: () => { setName(''); setTarget(''); } },
              )
            }
            disabled={!valid}
            busy={create.isPending}
          />
          {create.error ? <Text style={styles.error}>{create.error.message}</Text> : null}
        </View>
      </Card>

      {(data ?? []).length === 0 ? (
        <Card>
          <Muted>No goals yet. Create your first one above.</Muted>
        </Card>
      ) : (
        (data ?? []).map((g) => <GoalCard key={g.id} goal={g} />)
      )}
    </ScrollView>
  );
}

function GoalCard({ goal }: { goal: SavingsGoalRow }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { money } = usePrivacy();
  const addTo = useAddToSavingsGoal();
  const remove = useDeleteSavingsGoal();
  const [amount, setAmount] = useState('');
  const amountNum = Number(amount);
  const valid = Number.isFinite(amountNum) && amountNum > 0;

  const saved = Number(goal.saved_amount);
  const targetAmt = Number(goal.target_amount);
  const ratio = targetAmt > 0 ? Math.min(saved / targetAmt, 1) : 0;

  return (
    <Card>
      <View style={styles.goalHeader}>
        <Title>{goal.name}</Title>
        <Text style={styles.goalAmounts}>
          {money(saved)} / {money(targetAmt)}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: colors.primary }]} />
      </View>
      {ratio >= 1 ? <Muted>Goal reached 🎉</Muted> : <Muted>{`${Math.round(ratio * 100)}% there`}</Muted>}
      <View style={styles.addRow}>
        <View style={{ flex: 1 }}>
          <Field
            value={amount}
            onChangeText={setAmount}
            placeholder="Amount to add"
            keyboardType="decimal-pad"
            style={{ marginBottom: 0 }}
          />
        </View>
        <Button
          label="Add"
          onPress={() => addTo.mutate({ goal, amount: amountNum }, { onSuccess: () => setAmount('') })}
          disabled={!valid}
          busy={addTo.isPending}
        />
      </View>
      <Button label="Delete goal" variant="danger" onPress={() => remove.mutate(goal.id)} busy={remove.isPending} />
    </Card>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  error: { color: colors.danger, marginTop: 8 },
  goalHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  goalAmounts: { color: colors.text, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden', marginVertical: 8 },
  fill: { height: '100%', borderRadius: 4 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 10 },
}));
