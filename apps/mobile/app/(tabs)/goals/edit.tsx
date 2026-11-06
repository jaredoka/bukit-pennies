import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Card, Centered, Chip, DateField, Field, Muted, Title } from '@/components/ui';
import { bruneiDayKey, formatDayDate } from '@/lib/format';
import { usePrivacy } from '@/lib/privacy';
import {
  useAddSavingsGoalEntry,
  useDeleteSavingsGoal,
  useDeleteSavingsGoalEntry,
  useSavingsGoalEntries,
  useUpdateSavingsGoalEntry,
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
  const { money, pair } = usePrivacy();
  const entries = useSavingsGoalEntries(goal.id);
  const update = useUpdateSavingsGoal();
  const addEntry = useAddSavingsGoalEntry();
  const removeGoal = useDeleteSavingsGoal();

  const [name, setName] = useState(goal.name);
  const [target, setTarget] = useState(String(Number(goal.target_amount)));
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // One control for both directions. Money going in and money coming out are
  // the same event with opposite signs, so presenting them as two unrelated
  // forms — a one-line Add row on the list card, a three-field withdrawal form
  // here — made the rarer one look like a different kind of operation.
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [logAmount, setLogAmount] = useState('');
  const [logDate, setLogDate] = useState(bruneiDayKey(Date.now()));
  const [logNote, setLogNote] = useState('');
  // Both have sensible defaults (today, no note), so they stay out of the way
  // until asked for.
  const [showExtras, setShowExtras] = useState(false);

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

  /**
   * Collapsing puts the date and note back to their defaults rather than
   * keeping them out of sight. Otherwise closing the section after picking
   * last Tuesday would log against last Tuesday with nothing on screen saying
   * so — a hidden value that still counts is worse than losing a note you
   * chose to hide.
   */
  function collapseExtras() {
    setLogDate(bruneiDayKey(Date.now()));
    setLogNote('');
    setShowExtras(false);
  }

  const logNum = Number(logAmount);
  const logValid = Number.isFinite(logNum) && logNum > 0;

  function logMoney() {
    if (!logValid) return;
    setError(null);
    addEntry.mutate(
      // The sign is the only difference: one signed column means the total is
      // just a sum.
      {
        goalId: goal.id,
        amount: direction === 'out' ? -logNum : logNum,
        occurredOn: logDate,
        note: logNote,
      },
      {
        onSuccess: () => { setLogAmount(''); setLogNote(''); },
        onError: (e) => setError(e.message),
      },
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: goal.name }} />
      <ScrollView
          style={styles.screen}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
        <Card>
          <View style={styles.amountsRow}>
            <Text style={styles.amounts} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
              {pair(goal.saved, targetAmt, goal.currency)}
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
          {/* Fixed at creation, so it is stated rather than offered. */}
          <Muted>{`Tracked in ${goal.currency}. A goal's currency cannot be changed after it is created.`}</Muted>
          {detailsDirty ? (
            <Button label="Save changes" onPress={saveDetails} busy={update.isPending} />
          ) : null}
        </Card>

        <Card>
          <Title>Log money</Title>
          <View style={styles.chips}>
            <Chip label="Money in" active={direction === 'in'} onPress={() => setDirection('in')} />
            <Chip label="Money out" active={direction === 'out'} onPress={() => setDirection('out')} />
          </View>
          <Muted>
            {direction === 'in'
              ? 'Money you are putting aside for this goal.'
              : 'Money you have taken back out of this goal.'}
          </Muted>
          <View style={styles.logRow}>
            <View style={{ flex: 1, height: 41 }}>
              <Field
                value={logAmount}
                onChangeText={setLogAmount}
                placeholder={`Amount (${goal.currency})`}
                keyboardType="decimal-pad"
                style={{ marginBottom: 0, height: 41 }}
              />
            </View>
            <Button
              label="Log"
              onPress={logMoney}
              disabled={!logValid}
              busy={addEntry.isPending}
              style={styles.inlineBtn}
            />
          </View>
          {showExtras ? (
            <View>
              <DateField label="Date" value={logDate} onChange={setLogDate} clearable={false} sheetTitle="Date" />
              <Field
                label="Note (optional)"
                value={logNote}
                onChangeText={setLogNote}
                placeholder={direction === 'out' ? 'e.g. paid for flights' : 'e.g. bonus'}
                maxLength={200}
              />
              <Pressable onPress={collapseExtras} hitSlop={8}>
                <Text style={styles.linkish}>− Hide date and note</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setShowExtras(true)} hitSlop={8}>
              <Text style={styles.linkish}>+ Add a date or note</Text>
            </Pressable>
          )}
        </Card>

        <Card>
          <Title>History</Title>
          {entries.isLoading ? (
            <ActivityIndicator />
          ) : (entries.data ?? []).length === 0 ? (
            <Muted>Nothing logged yet. Amounts you log appear here.</Muted>
          ) : (
            <>
              {/* The correction path belongs next to the Remove buttons, not
                  buried in the logging form where it competed with "money out"
                  for the same intention. The bottom padding keeps the sentence
                  clear of the first row's divider. */}
              <View style={styles.hint}>
                <Muted>Made a mistake? Remove an entry and the total goes back.</Muted>
              </View>
              {(entries.data ?? []).map((e) => (
                <EntryRow key={e.id} entry={e} currency={goal.currency} />
              ))}
            </>
          )}
        </Card>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Two taps in place rather than a dialog: a second Modal over a screen
            that may already have one is an iOS freeze. */}
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

/**
 * One ledger row in three states:
 *
 *   idle    → a "more" icon, which promises choices rather than one specific
 *             action (a pencil here would offer to edit and then only delete)
 *   actions → Edit / Remove / Keep, in place of the icon so the row keeps its
 *             height and the decision stays under the finger
 *   editing → amount, direction, date and note, so a wrong entry is corrected
 *             rather than deleted and logged again
 */
function EntryRow({ entry, currency }: { entry: SavingsGoalEntryRow; currency: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { money } = usePrivacy();
  const remove = useDeleteSavingsGoalEntry();
  const update = useUpdateSavingsGoalEntry();
  const [mode, setMode] = useState<'idle' | 'actions' | 'editing'>('idle');

  const amount = Number(entry.amount);
  const isOut = amount < 0;
  const label = `${isOut ? '−' : '+'}${money(Math.abs(amount), currency)}`;

  // Seeded when editing opens, discarded when it closes.
  const [editAmount, setEditAmount] = useState(String(Math.abs(amount)));
  const [editOut, setEditOut] = useState(isOut);
  const [editDate, setEditDate] = useState(entry.occurred_on);
  const [editNote, setEditNote] = useState(entry.note ?? '');
  const [rowError, setRowError] = useState<string | null>(null);

  function openEdit() {
    setEditAmount(String(Math.abs(amount)));
    setEditOut(isOut);
    setEditDate(entry.occurred_on);
    setEditNote(entry.note ?? '');
    setRowError(null);
    setMode('editing');
  }

  const editNum = Number(editAmount);
  // Zero is refused by the database (`amount <> 0`), so it is refused here too.
  const editValid = Number.isFinite(editNum) && editNum > 0;

  function save() {
    if (!editValid) return;
    update.mutate(
      {
        id: entry.id,
        patch: {
          amount: editOut ? -editNum : editNum,
          occurred_on: editDate,
          note: editNote.trim() || null,
        },
      },
      {
        onSuccess: () => setMode('idle'),
        onError: (e) => setRowError(e.message),
      },
    );
  }

  return (
    <View style={styles.entryRow}>
      <View style={styles.entryTop}>
        <View style={styles.entryMain}>
          <Text style={[styles.entryAmount, isOut && { color: colors.danger }]} numberOfLines={1}>
            {label}
          </Text>
          <Text style={styles.entrySub} numberOfLines={1}>
            {entry.note ? `${formatDayDate(entry.occurred_on)} · ${entry.note}` : formatDayDate(entry.occurred_on)}
          </Text>
        </View>

        {mode === 'actions' ? (
          // Remove sits furthest from Keep, with Edit between them: the
          // destructive button and the one people reach for to back out should
          // never be neighbours.
          <View style={styles.rowActions}>
            <Pressable
              onPress={() => remove.mutate(entry.id)}
              disabled={remove.isPending}
              style={({ pressed }) => [styles.rowBtn, styles.rowBtnDanger, pressed && { opacity: 0.6 }]}
              accessibilityLabel={`Remove entry ${label}`}
            >
              {remove.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.rowBtnDangerText}>Remove</Text>
              )}
            </Pressable>
            <Pressable
              onPress={openEdit}
              style={({ pressed }) => [styles.rowBtn, styles.rowBtnGhost, pressed && { opacity: 0.6 }]}
              accessibilityLabel={`Edit entry ${label}`}
            >
              <Text style={styles.rowBtnGhostText}>Edit</Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('idle')}
              style={({ pressed }) => [styles.rowBtn, styles.rowBtnGhost, pressed && { opacity: 0.6 }]}
              accessibilityLabel="Keep this entry"
            >
              <Text style={styles.rowBtnGhostText}>Keep</Text>
            </Pressable>
          </View>
        ) : mode === 'idle' ? (
          <Pressable
            onPress={() => setMode('actions')}
            hitSlop={10}
            style={styles.iconBtn}
            accessibilityLabel={`Options for entry ${label}`}
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => setMode('idle')}
            hitSlop={10}
            style={styles.iconBtn}
            accessibilityLabel="Cancel editing"
          >
            <Ionicons name="close" size={18} color={colors.text} />
          </Pressable>
        )}
      </View>

      {mode === 'editing' ? (
        <View style={styles.editBox}>
          <View style={styles.chips}>
            <Chip label="Money in" active={!editOut} onPress={() => setEditOut(false)} />
            <Chip label="Money out" active={editOut} onPress={() => setEditOut(true)} />
          </View>
          <Field
            label={`Amount (${currency})`}
            value={editAmount}
            onChangeText={setEditAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />
          <DateField label="Date" value={editDate} onChange={setEditDate} clearable={false} sheetTitle="Date" />
          <Field
            label="Note (optional)"
            value={editNote}
            onChangeText={setEditNote}
            placeholder="Add a note…"
            maxLength={200}
          />
          {rowError ? <Text style={styles.error}>{rowError}</Text> : null}
          <View style={styles.rowActions}>
            <Pressable
              onPress={save}
              disabled={!editValid || update.isPending}
              style={({ pressed }) => [
                styles.rowBtn,
                styles.rowBtnPrimary,
                (pressed || !editValid) && { opacity: 0.6 },
              ]}
            >
              {update.isPending ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Text style={styles.rowBtnPrimaryText}>Save</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => setMode('idle')}
              style={({ pressed }) => [styles.rowBtn, styles.rowBtnGhost, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.rowBtnGhostText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center', paddingBottom: 32 },
  // Same collision as the goals list, without a title to move the percentage
  // onto — the goal name is the nav bar title here. So the amounts take the
  // flexible slot instead: bounded width means they wrap when they get long
  // rather than running into the label beside them.
  amountsRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  amounts: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] as const },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden', marginVertical: 8 },
  fill: { height: '100%', borderRadius: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 10, height: 53 },
  inlineBtn: { marginVertical: 0, paddingVertical: 0, height: 41, justifyContent: 'center' },
  linkish: { color: colors.primary, fontWeight: '600', fontSize: 13, marginTop: 2 },
  // Clears the first row's divider so no descender sits on the line.
  hint: { paddingBottom: 10 },
  entryRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  entryTop: { flexDirection: 'row', alignItems: 'center' },
  entryAmount: { color: colors.text, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] as const },
  entryMain: { flex: 1, minWidth: 0, marginRight: 8 },
  entrySub: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  iconBtn: { padding: 6, borderRadius: 8 },
  // flexShrink 0 so the three buttons keep their size and the amount truncates
  // instead — three pills plus a long amount is tight on a 360pt screen.
  rowActions: { flexDirection: 'row', gap: 6, alignItems: 'center' as const, flexShrink: 0 },
  rowBtn: {
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 999,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  rowBtnDanger: { backgroundColor: colors.danger },
  // White, not onPrimary: onPrimary is tuned for the yellow/blue primary and is
  // near-black, which is unreadable on the red danger fill.
  rowBtnDangerText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  rowBtnGhost: { borderWidth: 1, borderColor: colors.border },
  rowBtnGhostText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  rowBtnPrimary: { backgroundColor: colors.primary, paddingHorizontal: 18 },
  rowBtnPrimaryText: { color: colors.onPrimary, fontWeight: '600', fontSize: 13 },
  editBox: { marginTop: 10 },
  error: { color: colors.danger, marginBottom: 8 },
}));
