import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Card, Centered, DateField, Field, Muted, Title } from '@/components/ui';
import { bruneiDayKey, formatDayDate } from '@/lib/format';
import { usePrivacy } from '@/lib/privacy';
import {
  useAddSavingsGoalEntry,
  useDeleteSavingsGoal,
  useDeleteSavingsGoalEntry,
  useSavingsGoalEntries,
  useSavingsGoals,
  useUpdateSavingsGoal,
} from '@/lib/queries';
import { themedStyles, useTheme } from '@/lib/theme';
import type { SavingsGoalEntryRow, SavingsGoalWithProgress } from '@/lib/types';

export default function GoalDetail() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const goals = useSavingsGoals();

  if (goals.isLoading) {
    return (
      <Centered>
        <ActivityIndicator size="large" />
      </Centered>
    );
  }

  const goal = goals.data?.find((g) => g.id === id);
  if (!goal) {
    return (
      <Centered>
        <Muted>That goal no longer exists.</Muted>
      </Centered>
    );
  }

  return <Detail goal={goal} />;
}

function Detail({ goal }: { goal: SavingsGoalWithProgress }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { money } = usePrivacy();
  const entries = useSavingsGoalEntries(goal.id);
  const update = useUpdateSavingsGoal();
  const addEntry = useAddSavingsGoalEntry();
  const removeGoal = useDeleteSavingsGoal();

  const [name, setName] = useState(goal.name);
  const [target, setTarget] = useState(String(Number(goal.target_amount)));
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Withdrawal form. Separate from the card's Add row on purpose: taking money
  // out is the rarer, more deliberate action.
  const [outAmount, setOutAmount] = useState('');
  const [outDate, setOutDate] = useState(bruneiDayKey(Date.now()));
  const [outNote, setOutNote] = useState('');

  const targetAmt = Number(goal.target_amount);
  const ratio = targetAmt > 0 ? Math.min(goal.saved / targetAmt, 1) : 0;

  const targetNum = Number(target);
  const detailsDirty = name.trim() !== goal.name || targetNum !== targetAmt;
  const detailsValid = name.trim() !== '' && Number.isFinite(targetNum) && targetNum > 0;

  function saveDetails() {
    if (!detailsValid) {
      setError('A goal needs a name and a target above zero.');
      return;
    }
    setError(null);
    update.mutate(
      { id: goal.id, patch: { name: name.trim(), target_amount: targetNum } },
      { onError: (e) => setError(e.message) },
    );
  }

  const outNum = Number(outAmount);
  const outValid = Number.isFinite(outNum) && outNum > 0;

  function withdraw() {
    if (!outValid) return;
    setError(null);
    addEntry.mutate(
      // Stored negative: one signed column means the total is just a sum.
      { goalId: goal.id, amount: -outNum, occurredOn: outDate, note: outNote },
      {
        onSuccess: () => { setOutAmount(''); setOutNote(''); },
        onError: (e) => setError(e.message),
      },
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: goal.name }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card>
          <View style={styles.amountsRow}>
            <Text style={styles.amounts}>
              {money(goal.saved, goal.currency)} / {money(targetAmt, goal.currency)}
            </Text>
            <Muted>{ratio >= 1 ? 'Goal reached 🎉' : `${Math.round(ratio * 100)}% there`}</Muted>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: colors.primary }]} />
          </View>
          {goal.saved > targetAmt ? (
            <Muted>{`You are ${money(goal.saved - targetAmt, goal.currency)} over your target.`}</Muted>
          ) : null}
        </Card>

        <Card>
          <Title>Details</Title>
          <View style={{ marginTop: 8 }}>
            <Field label="Goal" value={name} onChangeText={setName} placeholder="Goal name" />
            <Field
              label={`Target (${goal.currency})`}
              value={target}
              onChangeText={setTarget}
              placeholder="e.g. 3000"
              keyboardType="decimal-pad"
            />
          </View>
          {/* Fixed at creation (HANDOFF §17), so it is stated rather than offered. */}
          <Muted>{`Tracked in ${goal.currency}. A goal's currency cannot be changed after it is created.`}</Muted>
          {detailsDirty ? (
            <Button label="Save changes" onPress={saveDetails} busy={update.isPending} />
          ) : null}
        </Card>

        <Card>
          <Title>Take money out</Title>
          <Muted>
            For money you have taken back out of this pot. To fix a mistake, delete the entry below
            instead — that restores the exact figure.
          </Muted>
          <View style={{ marginTop: 12 }}>
            <Field
              label={`Amount (${goal.currency})`}
              value={outAmount}
              onChangeText={setOutAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />
            <DateField label="Date" value={outDate} onChange={setOutDate} clearable={false} sheetTitle="Date" />
            <Field
              label="Note (optional)"
              value={outNote}
              onChangeText={setOutNote}
              placeholder="e.g. paid for flights"
              maxLength={200}
            />
          </View>
          <Button
            label="Withdraw"
            variant="secondary"
            onPress={withdraw}
            disabled={!outValid}
            busy={addEntry.isPending}
          />
        </Card>

        <Card>
          <Title>History</Title>
          {entries.isLoading ? (
            <ActivityIndicator />
          ) : (entries.data ?? []).length === 0 ? (
            <Muted>Nothing logged yet. Amounts you add appear here.</Muted>
          ) : (
            (entries.data ?? []).map((e) => (
              <EntryRow key={e.id} entry={e} currency={goal.currency} />
            ))
          )}
        </Card>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Two taps in place rather than a dialog: a second Modal over a screen
            that may already have one is the freeze in HANDOFF §28. */}
        {confirmingDelete ? (
          <Card>
            <Title>Delete this goal?</Title>
            <Muted>
              {`"${goal.name}" and its ${goal.entry_count} logged ${
                goal.entry_count === 1 ? 'entry' : 'entries'
              } are removed permanently. Your transactions are not affected.`}
            </Muted>
            <Button
              label="Yes, delete it"
              variant="danger"
              onPress={() =>
                removeGoal.mutate(goal.id, {
                  onSuccess: () => router.back(),
                  onError: (e) => setError(e.message),
                })
              }
              busy={removeGoal.isPending}
            />
            <Button label="Keep it" variant="secondary" onPress={() => setConfirmingDelete(false)} />
          </Card>
        ) : (
          <Button label="Delete goal" variant="danger" onPress={() => setConfirmingDelete(true)} />
        )}
      </ScrollView>
    </>
  );
}

/** One ledger row, with an in-place two-tap delete — the correction path. */
function EntryRow({ entry, currency }: { entry: SavingsGoalEntryRow; currency: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { money } = usePrivacy();
  const remove = useDeleteSavingsGoalEntry();
  const [confirming, setConfirming] = useState(false);

  const amount = Number(entry.amount);
  const isOut = amount < 0;

  return (
    <View style={styles.entryRow}>
      <View style={{ flex: 1, marginRight: 8 }}>
        <Text style={[styles.entryAmount, isOut && { color: colors.danger }]}>
          {isOut ? '−' : '+'}
          {money(Math.abs(amount), currency)}
        </Text>
        <Muted>{entry.note ? `${formatDayDate(entry.occurred_on)} · ${entry.note}` : formatDayDate(entry.occurred_on)}</Muted>
      </View>
      {confirming ? (
        <View style={styles.entryActions}>
          <Pressable onPress={() => remove.mutate(entry.id)} hitSlop={8} disabled={remove.isPending}>
            <Text style={{ color: colors.danger, fontWeight: '600' }}>Delete</Text>
          </Pressable>
          <Pressable onPress={() => setConfirming(false)} hitSlop={8}>
            <Text style={{ color: colors.muted }}>Keep</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => setConfirming(true)}
          hitSlop={8}
          accessibilityLabel={`Delete entry of ${money(Math.abs(amount), currency)}`}
        >
          <Text style={{ color: colors.muted }}>Remove</Text>
        </Pressable>
      )}
    </View>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center', paddingBottom: 32 },
  amountsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  amounts: { color: colors.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] as const },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden', marginVertical: 8 },
  fill: { height: '100%', borderRadius: 4 },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  entryAmount: { color: colors.text, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] as const },
  entryActions: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  error: { color: colors.danger, marginBottom: 8 },
}));
