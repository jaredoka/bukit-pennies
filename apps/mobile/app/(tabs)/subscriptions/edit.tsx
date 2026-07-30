import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Card, Centered, Chip, Field, Muted, Title } from '@/components/ui';
import { bruneiDayKey } from '@/lib/format';
import { CURRENCY_OPTIONS } from '@/lib/primaryCurrency';
import {
  useCategories,
  useDeleteSubscription,
  useSaveSubscription,
  useSubscriptions,
  useTransactionFacets,
  type SubscriptionInput,
} from '@/lib/queries';
import { CYCLE_OPTIONS, cycleLabel, parseDayKey } from '@/lib/subscriptions';
import { themedStyles } from '@/lib/theme';
import type { SubscriptionCycle, SubscriptionRow, SubscriptionStatus } from '@/lib/types';

export default function EditSubscription() {
  const params = useLocalSearchParams<{
    id?: string;
    name?: string;
    amount?: string;
    currency?: string;
    merchant?: string;
  }>();
  const subs = useSubscriptions();

  // The form's state is seeded once from its initial values, so it may only
  // mount after the row it is editing has arrived.
  if (params.id && subs.isLoading) {
    return (
      <Centered>
        <ActivityIndicator size="large" />
      </Centered>
    );
  }

  const existing = params.id ? subs.data?.find((s) => s.id === params.id) : undefined;

  if (params.id && !existing) {
    return (
      <Centered>
        <Muted>That subscription no longer exists.</Muted>
      </Centered>
    );
  }

  return <Form existing={existing} prefill={params} />;
}

function Form({
  existing,
  prefill,
}: {
  existing: SubscriptionRow | undefined;
  prefill: { name?: string; amount?: string; currency?: string; merchant?: string };
}) {
  const styles = useStyles();
  const router = useRouter();
  const categories = useCategories();
  const facets = useTransactionFacets();
  const save = useSaveSubscription();
  const remove = useDeleteSubscription();

  const [name, setName] = useState(existing?.name ?? prefill.name ?? '');
  const [amount, setAmount] = useState(
    existing ? String(Number(existing.amount)) : (prefill.amount ?? ''),
  );
  const [currency, setCurrency] = useState(existing?.currency ?? prefill.currency ?? 'BND');
  const [cycle, setCycle] = useState<SubscriptionCycle>(existing?.cycle ?? 'monthly');
  const [cycleDays, setCycleDays] = useState(existing?.cycle_days ? String(existing.cycle_days) : '');
  const [nextDue, setNextDue] = useState(existing?.next_due_on ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(existing?.category_id ?? null);
  const [cardLast4, setCardLast4] = useState(existing?.card_last4 ?? '');
  const [trialEnds, setTrialEnds] = useState(existing?.trial_ends_on ?? '');
  const [startedOn, setStartedOn] = useState(existing?.started_on ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [status, setStatus] = useState<SubscriptionStatus>(existing?.status ?? 'active');
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const merchantLink = existing?.merchant_normalized ?? prefill.merchant ?? null;
  const knownCards = [
    ...new Set((facets.data ?? []).map((f) => f.card_last4).filter((c): c is string => !!c)),
  ];

  function validate(): string | null {
    if (!name.trim()) return 'Name is required.';
    if (name.trim().length > 80) return 'Name must be 80 characters or fewer.';
    const amt = Number(amount);
    if (!amount.trim() || !Number.isFinite(amt) || amt <= 0) return 'Amount must be a positive number.';
    if (cycle === 'custom') {
      const days = Number(cycleDays);
      if (!cycleDays.trim() || !Number.isInteger(days) || days < 1 || days > 3650) {
        return 'A custom cycle needs a length between 1 and 3650 days.';
      }
    }
    for (const [label, value] of [
      ['Next payment date', nextDue],
      ['Trial end date', trialEnds],
      ['Start date', startedOn],
    ] as const) {
      if (value.trim() && !parseDayKey(value)) return `${label} must be a real date, as YYYY-MM-DD.`;
    }
    if (cardLast4.trim() && !/^\d{4}$/.test(cardLast4.trim())) {
      return 'Card must be the last 4 digits.';
    }
    if (notes.length > 500) return 'Notes must be 500 characters or fewer.';
    return null;
  }

  function submit() {
    const problem = validate();
    setError(problem);
    if (problem) return;
    const input: SubscriptionInput = {
      ...(existing ? { id: existing.id } : {}),
      name: name.trim(),
      amount: Math.round(Number(amount) * 100) / 100,
      currency,
      cycle,
      cycle_days: cycle === 'custom' ? Number(cycleDays) : null,
      next_due_on: nextDue.trim() || null,
      category_id: categoryId,
      card_last4: cardLast4.trim() || null,
      merchant_normalized: merchantLink,
      trial_ends_on: trialEnds.trim() || null,
      started_on: startedOn.trim() || null,
      notes: notes.trim() || null,
      status,
    };
    save.mutate(input, {
      onSuccess: () => router.back(),
      onError: (e) => setError(e instanceof Error ? e.message : String(e)),
    });
  }

  return (
    <>
      <Stack.Screen options={{ title: existing ? 'Edit subscription' : 'Add subscription' }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card>
          <Title>{existing ? 'Edit subscription' : 'New subscription'}</Title>
          <Muted>
            What you are paying for and when it renews. Recorded for your reference only — the
            charge itself is counted when your bank message arrives.
          </Muted>
          <View style={{ marginTop: 12 }}>
            <Field label="Name" placeholder="e.g. Netflix" value={name} onChangeText={setName} maxLength={80} />
            <Field
              label="Amount per billing period"
              placeholder="0.00"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
            <Text style={styles.label}>Currency</Text>
            <View style={styles.chips}>
              {CURRENCY_OPTIONS.map((c) => (
                <Chip
                  key={c.code}
                  label={c.code}
                  active={currency === c.code}
                  onPress={() => setCurrency(c.code)}
                />
              ))}
            </View>
          </View>
        </Card>

        <Card>
          <Title>Billing cycle</Title>
          <View style={styles.chips}>
            {CYCLE_OPTIONS.map((c) => (
              <Chip key={c} label={cycleLabel(c, null)} active={cycle === c} onPress={() => setCycle(c)} />
            ))}
          </View>
          {cycle === 'custom' ? (
            <View style={{ marginTop: 12 }}>
              <Field
                label="Bills every … days"
                placeholder="e.g. 45"
                value={cycleDays}
                onChangeText={setCycleDays}
                keyboardType="number-pad"
              />
            </View>
          ) : null}
          <View style={{ marginTop: 12 }}>
            <Field
              label="Next payment date (optional)"
              placeholder="YYYY-MM-DD"
              value={nextDue}
              onChangeText={setNextDue}
              autoCapitalize="none"
            />
            <Muted>
              Set it once and the app rolls it forward by the cycle on its own — you will not have
              to come back and update it.
            </Muted>
            <Pressable onPress={() => setNextDue(bruneiDayKey(Date.now()))} hitSlop={8}>
              <Text style={styles.linkish}>Use today</Text>
            </Pressable>
          </View>
        </Card>

        <Card>
          <Title>Category</Title>
          <View style={styles.chips}>
            {(categories.data ?? []).map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                active={categoryId === c.id}
                onPress={() => setCategoryId(categoryId === c.id ? null : c.id)}
              />
            ))}
          </View>
        </Card>

        <Card>
          <Title>Details</Title>
          <Field
            label="Billed to card (optional)"
            placeholder="0213"
            value={cardLast4}
            onChangeText={setCardLast4}
            keyboardType="number-pad"
            maxLength={4}
          />
          {knownCards.length > 0 ? (
            <View style={styles.chips}>
              {knownCards.map((c) => (
                <Chip
                  key={c}
                  label={`•${c}`}
                  active={cardLast4 === c}
                  onPress={() => setCardLast4(cardLast4 === c ? '' : c)}
                />
              ))}
            </View>
          ) : null}
          <View style={{ marginTop: 12 }}>
            <Field
              label="Free trial ends (optional)"
              placeholder="YYYY-MM-DD"
              value={trialEnds}
              onChangeText={setTrialEnds}
              autoCapitalize="none"
            />
            <Field
              label="Started on (optional)"
              placeholder="YYYY-MM-DD"
              value={startedOn}
              onChangeText={setStartedOn}
              autoCapitalize="none"
            />
            <Field
              label="Notes (optional)"
              placeholder="e.g. shared with family, cancel before renewal"
              value={notes}
              onChangeText={setNotes}
              multiline
              maxLength={500}
            />
          </View>
          {merchantLink ? (
            <Muted>{`Matched to "${merchantLink}" in your transactions, so its real charges show up against this subscription.`}</Muted>
          ) : (
            <Muted>
              Charges are matched by name, so keep the name close to how it appears on your bank
              message.
            </Muted>
          )}
        </Card>

        <Card>
          <Title>Status</Title>
          <View style={styles.chips}>
            <Chip label="Active" active={status === 'active'} onPress={() => setStatus('active')} />
            <Chip
              label="Cancelled"
              active={status === 'cancelled'}
              onPress={() => setStatus('cancelled')}
            />
          </View>
          <Muted>
            Cancelled subscriptions drop out of your monthly total but stay on the list, so the app
            does not keep suggesting the thing you just cancelled.
          </Muted>
        </Card>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label={existing ? 'Save changes' : 'Add subscription'}
          onPress={submit}
          busy={save.isPending}
        />

        {existing ? (
          // Two taps in place rather than a confirmation dialog: a second Modal
          // over a screen that may already have one is the freeze in HANDOFF §28.
          confirmingDelete ? (
            <>
              <Muted>Delete this subscription? Your transactions are not affected.</Muted>
              <Button
                label="Yes, delete it"
                variant="danger"
                onPress={() =>
                  remove.mutate(existing.id, {
                    onSuccess: () => router.back(),
                    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
                  })
                }
                busy={remove.isPending}
              />
              <Button label="Keep it" variant="secondary" onPress={() => setConfirmingDelete(false)} />
            </>
          ) : (
            <Button label="Delete subscription" variant="danger" onPress={() => setConfirmingDelete(true)} />
          )
        ) : null}
      </ScrollView>
    </>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center', paddingBottom: 32 },
  label: { color: colors.muted, fontSize: 13, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  linkish: { color: colors.primary, fontWeight: '600', fontSize: 13, marginTop: 6 },
  error: { color: colors.danger, marginBottom: 8 },
}));
