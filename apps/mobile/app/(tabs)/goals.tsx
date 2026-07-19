import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Button, Card, Centered, Field, Muted, Title } from '@/components/ui';
import {
  useAddToSavingsGoal,
  useCreateSavingsGoal,
  useDeleteSavingsGoal,
  useSavingsGoals,
} from '@/lib/queries';
import { usePrivacy } from '@/lib/privacy';
import { usePrimaryCurrency } from '@/lib/primaryCurrency';
import { themedStyles, useTheme } from '@/lib/theme';
import type { SavingsGoalRow } from '@/lib/types';

const DELETE_PHRASE = 'DELETE';

export default function GoalsTab() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { currency: primaryCurrency } = usePrimaryCurrency();
  const { data, isLoading } = useSavingsGoals();
  const create = useCreateSavingsGoal();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [editing, setEditing] = useState(false);
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
    <>
      <Stack.Screen
        options={{
          headerRight: () =>
            (data ?? []).length > 0 ? (
              <Pressable onPress={() => setEditing((e) => !e)} hitSlop={8}>
                <Ionicons
                  name={editing ? 'checkmark' : 'pencil'}
                  size={22}
                  color={colors.primary}
                />
              </Pressable>
            ) : null,
        }}
      />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card>
          <Title>New goal</Title>
          <Muted>Set a target and add to it whenever you put money aside.</Muted>
          <Muted>{`New goals are tracked in your primary currency (${primaryCurrency}). To use a different currency, change it in Settings > Appearance before creating the goal.`}</Muted>
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
                  { name: name.trim(), target: targetNum, currency: primaryCurrency },
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
          (data ?? []).map((g) => <GoalCard key={g.id} goal={g} editing={editing} />)
        )}
      </ScrollView>
    </>
  );
}

function GoalCard({ goal, editing }: { goal: SavingsGoalRow; editing: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { money } = usePrivacy();
  const addTo = useAddToSavingsGoal();
  const remove = useDeleteSavingsGoal();
  const [amount, setAmount] = useState('');
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const amountNum = Number(amount);
  const valid = Number.isFinite(amountNum) && amountNum > 0;

  const saved = Number(goal.saved_amount);
  const targetAmt = Number(goal.target_amount);
  const ratio = targetAmt > 0 ? Math.min(saved / targetAmt, 1) : 0;

  function handleDelete() {
    if (confirmText !== DELETE_PHRASE) return;
    remove.mutate(goal.id, { onSuccess: () => setConfirmVisible(false) });
  }

  return (
    <Card>
      <Title>{goal.name}</Title>
      <View style={styles.amountsRow}>
        <Text style={styles.goalAmounts}>{money(saved, goal.currency)} / {money(targetAmt, goal.currency)}</Text>
        <Muted>{ratio >= 1 ? 'Goal reached 🎉' : `${Math.round(ratio * 100)}% there`}</Muted>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: colors.primary }]} />
      </View>
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
          onPress={() => addTo.mutate({ goal, amount: amountNum }, { onSuccess: () => setAmount('') })}
          disabled={!valid}
          busy={addTo.isPending}
          style={styles.inlineBtn}
        />
      </View>

      {editing ? (
        <Button
          label="Delete goal"
          variant="danger"
          onPress={() => { setConfirmText(''); setConfirmVisible(true); }}
          busy={remove.isPending}
        />
      ) : null}

      {/* Delete confirmation modal */}
      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setConfirmVisible(false)}>
          <Pressable style={styles.modalBox} onPress={() => {}}>
            <Text style={styles.modalTitle}>Delete "{goal.name}"?</Text>
            <Muted>This will permanently delete the goal and all saved progress. Type DELETE to confirm.</Muted>
            <Field
              placeholder={DELETE_PHRASE}
              value={confirmText}
              onChangeText={setConfirmText}
              autoCapitalize="characters"
              autoFocus
              style={{ marginTop: 12, marginBottom: 4 }}
            />
            <Button
              label="Delete permanently"
              variant="danger"
              onPress={handleDelete}
              disabled={confirmText !== DELETE_PHRASE}
              busy={remove.isPending}
            />
            <Button label="Cancel" variant="secondary" onPress={() => setConfirmVisible(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </Card>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  error: { color: colors.danger, marginTop: 8 },
  amountsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  goalAmounts: { color: colors.muted, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] as const },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden', marginVertical: 8 },
  fill: { height: '100%', borderRadius: 4 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 10, height: 53 },
  inlineBtn: { marginVertical: 0, paddingVertical: 0, height: 41, justifyContent: 'center' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 6 },
}));
