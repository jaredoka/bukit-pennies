import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Button, Card, Centered, Field, Muted, Title } from '@/components/ui';
import { useAddSavingsGoalEntry, useSavingsGoals } from '@/lib/queries';
import { usePrivacy } from '@/lib/privacy';
import { themedStyles, useTheme } from '@/lib/theme';
import type { SavingsGoalWithProgress } from '@/lib/types';

export default function GoalsTab() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { data, isLoading } = useSavingsGoals();

  if (isLoading) {
    return (
      <Centered>
        <ActivityIndicator size="large" />
      </Centered>
    );
  }

  const goals = data ?? [];

  return (
    <>
      <Stack.Screen
        options={{
          // `+` is the only header action: editing is reached by tapping the
          // goal itself, which is what removed the old pencil edit-mode.
          headerRight: () => (
            <Pressable
              hitSlop={8}
              onPress={() => router.push('/(tabs)/goals/new')}
              accessibilityLabel="Add goal"
            >
              <Ionicons name="add-circle-outline" size={26} color={colors.primary} />
            </Pressable>
          ),
        }}
      />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {goals.length === 0 ? (
          <Card>
            <Title>No goals yet</Title>
            <Muted>
              Tap + to set your first one — a target to save toward, and a place to log money as
              you put it aside.
            </Muted>
          </Card>
        ) : (
          goals.map((g) => <GoalCard key={g.id} goal={g} />)
        )}
      </ScrollView>
    </>
  );
}

function GoalCard({ goal }: { goal: SavingsGoalWithProgress }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { money } = usePrivacy();
  const addEntry = useAddSavingsGoalEntry();
  const [amount, setAmount] = useState('');
  const amountNum = Number(amount);
  const valid = Number.isFinite(amountNum) && amountNum > 0;

  const targetAmt = Number(goal.target_amount);
  const ratio = targetAmt > 0 ? Math.min(goal.saved / targetAmt, 1) : 0;

  const open = () =>
    router.push({ pathname: '/(tabs)/goals/edit', params: { id: goal.id } });

  return (
    <Card>
      {/* Only the heading and progress open the detail screen. The amount field
          and Add button sit outside this Pressable deliberately: wrapping the
          whole card would swallow taps meant for them. */}
      <Pressable onPress={open} style={styles.cardHead}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Title>{goal.name}</Title>
          <View style={styles.amountsRow}>
            <Text style={styles.goalAmounts}>
              {money(goal.saved, goal.currency)} / {money(targetAmt, goal.currency)}
            </Text>
            <Muted>{ratio >= 1 ? 'Goal reached 🎉' : `${Math.round(ratio * 100)}% there`}</Muted>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
      <Pressable onPress={open}>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: colors.primary }]} />
        </View>
      </Pressable>
      <View style={styles.addRow}>
        <View style={{ flex: 1, height: 41 }}>
          <Field
            value={amount}
            onChangeText={setAmount}
            placeholder="Amount to add"
            keyboardType="decimal-pad"
            style={{ marginBottom: 0, height: 41 }}
          />
        </View>
        <Button
          label="Add"
          onPress={() =>
            addEntry.mutate(
              { goalId: goal.id, amount: amountNum },
              { onSuccess: () => setAmount('') },
            )
          }
          disabled={!valid}
          busy={addEntry.isPending}
          style={styles.inlineBtn}
        />
      </View>
      {addEntry.error ? <Text style={styles.error}>{addEntry.error.message}</Text> : null}
    </Card>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  cardHead: { flexDirection: 'row', alignItems: 'center' },
  error: { color: colors.danger, marginTop: 8 },
  amountsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  goalAmounts: { color: colors.muted, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] as const },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden', marginVertical: 8 },
  fill: { height: '100%', borderRadius: 4 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 10, height: 53 },
  inlineBtn: { marginVertical: 0, paddingVertical: 0, height: 41, justifyContent: 'center' },
}));
