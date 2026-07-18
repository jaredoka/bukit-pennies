import { parseBankMessage, splitBankMessages } from '@bukit/parsers';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, Field, Muted, Title } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { postIngest } from '@/lib/ingest';
import { kvGet, kvSet } from '@/lib/kvStore';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { themedStyles } from '@/lib/theme';

export function onboardedKey(userId: string): string {
  return `onboarded:${userId}`;
}

// First-run moment (HANDOFF §16.4): paste your last bank SMS, see it parse
// instantly, and it becomes your first transaction. Skippable; shown once.
export default function Welcome() {
  const styles = useStyles();
  const router = useRouter();
  const { session } = useSession();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userId = session?.user.id;

  // Returning users (existing transactions, e.g. fresh install) skip straight in.
  useEffect(() => {
    if (!userId) return;
    let live = true;
    (async () => {
      if ((await kvGet(onboardedKey(userId))) === '1') {
        if (live) router.replace('/(tabs)');
        return;
      }
      const { data } = await supabase.from('transactions').select('id').limit(1);
      if (data?.length) {
        await kvSet(onboardedKey(userId), '1');
        if (live) router.replace('/(tabs)');
      }
    })();
    return () => {
      live = false;
    };
  }, [userId, router]);

  const message = useMemo(() => splitBankMessages(text)[0] ?? '', [text]);
  const preview = useMemo(() => (message ? parseBankMessage(message) : null), [message]);

  async function finish() {
    if (userId) await kvSet(onboardedKey(userId), '1');
    router.replace('/(tabs)');
  }

  async function saveAndFinish() {
    setBusy(true);
    setError(null);
    try {
      const res = await postIngest(message, 'paste');
      if (res.status === 'error') {
        setError(res.error ?? 'Something went wrong — try again or skip for now.');
        return;
      }
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['monthly_totals'] });
      qc.invalidateQueries({ queryKey: ['merchant_totals'] });
      await finish();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.hello}>Welcome to Bukit Pennies 👋</Text>
      <Muted>
        Your bank already texts you every time you spend. Paste your last bank SMS below and watch
        it become your first logged transaction — no bank logins, ever. Bukit Pennies only reads
        the text you give it.
      </Muted>

      <Card>
        <Title>Try it with your last bank SMS</Title>
        <Field
          multiline
          value={text}
          onChangeText={setText}
          placeholder="Card No.: 4x0213 Amount: BND 21.00 Merchant: … Date: …"
          style={{ minHeight: 110, marginTop: 12, textAlignVertical: 'top' }}
          autoCapitalize="none"
        />
        {preview?.tx ? (
          <View style={{ marginTop: 12 }}>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
              <Badge label={preview.tx.bank} />
              {preview.tx.confidence < 0.75 || preview.tx.amount === null ? (
                <Badge label="will need review" tone="warning" />
              ) : (
                <Badge label="looks good" tone="success" />
              )}
            </View>
            <PreviewRow label="Amount" value={formatMoney(preview.tx.amount, preview.tx.currency)} />
            <PreviewRow label="Merchant" value={preview.tx.merchant ?? '—'} />
            <PreviewRow label="Date" value={preview.tx.occurredAt ?? '—'} />
            <PreviewRow label="Card" value={preview.tx.cardLast4 ? `•${preview.tx.cardLast4}` : '—'} />
          </View>
        ) : preview ? (
          <Muted>
            {preview.isTransactional
              ? 'Could not extract a transaction from this text — you can still save it and fix it in Review.'
              : 'This does not look like a purchase message (OTP, promo, or balance alert).'}
          </Muted>
        ) : null}
        <Button
          label="Save my first transaction"
          onPress={saveAndFinish}
          disabled={!message || preview?.isTransactional === false}
          busy={busy}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Card>

      <Button label="Skip for now" variant="secondary" onPress={finish} />
      <Muted>
        You can always paste messages later from the Capture tab, or set up the iOS Shortcut in
        Settings for near-automatic logging.
      </Muted>
    </ScrollView>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.previewRow}>
      <Text style={styles.previewLabel}>{label}</Text>
      <Text style={styles.previewValue}>{value}</Text>
    </View>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, paddingTop: 72, gap: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  hello: { fontSize: 26, fontWeight: '800', color: colors.text },
  error: { color: colors.danger, marginTop: 8 },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  previewLabel: { color: colors.muted },
  previewValue: { color: colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
}));
