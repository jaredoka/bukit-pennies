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
import { themedStyles, useTheme } from '@/lib/theme';

export function onboardedKey(userId: string): string {
  return `onboarded:${userId}`;
}

// ─── Step indicators ─────────────────────────────────────────────────────────

function Steps({ current }: { current: 1 | 2 }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      {[1, 2].map((n) => {
        const active = n === current;
        const done = n < current;
        return (
          <View key={n} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {n > 1 && (
              <View
                style={{
                  flex: 1,
                  height: 1,
                  width: 32,
                  backgroundColor: done || active ? colors.primary : colors.border,
                }}
              />
            )}
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: active || done ? colors.primary : colors.border,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{n}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── Page 1: paste-your-SMS ───────────────────────────────────────────────────

function PastePage({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const styles = useStyles();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const message = useMemo(() => splitBankMessages(text)[0] ?? '', [text]);
  const preview = useMemo(() => (message ? parseBankMessage(message) : null), [message]);

  async function saveAndContinue() {
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
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Steps current={1} />
      <Text style={styles.hello}>Welcome to Bukit Pennies 👋</Text>
      <Muted>
        Your bank texts you every time you spend. Paste your last bank SMS below — watch it
        become your first logged transaction in seconds. No bank logins, ever.
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
              ? 'Could not extract a transaction — you can still save it and fix it in Review.'
              : 'This does not look like a purchase message (OTP, promo, or balance alert).'}
          </Muted>
        ) : null}
        <Button
          label="Save & continue"
          onPress={saveAndContinue}
          disabled={!message || preview?.isTransactional === false}
          busy={busy}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Card>

      <Button label="Skip for now" variant="secondary" onPress={onSkip} />
    </ScrollView>
  );
}

// ─── Page 2: iOS Shortcut nudge ───────────────────────────────────────────────

function ShortcutPage({ onSetUp, onSkip }: { onSetUp: () => void; onSkip: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Steps current={2} />
      <Text style={styles.hello}>Set up automatic capture</Text>
      <Muted>
        One-time setup. After this, every bank SMS you receive logs itself — no tapping required.
      </Muted>

      <Card>
        <View style={[styles.timePill, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}>
          <Text style={[styles.timePillText, { color: colors.primary }]}>⏱ About 5 minutes</Text>
        </View>

        <View style={{ gap: 16, marginTop: 16 }}>
          <NudgeStep
            number="1"
            title="Create a capture token"
            body="Settings → Capture → Capture devices & tokens → Add device. Copy the bp_… token (shown once)."
          />
          <NudgeStep
            number="2"
            title="Download the Shortcut"
            body="A ready-made Shortcut that sends bank messages to your private endpoint. The only thing you paste is your token."
          />
          <NudgeStep
            number="3"
            title="Add a bank SMS automation"
            body="Shortcuts app → Automation → Message. Set it to trigger on bank SMS and run the Shortcut automatically."
          />
        </View>
      </Card>

      <Button label="Set up now — takes ~5 min" onPress={onSetUp} />
      <Button label="I'll do it later" variant="secondary" onPress={onSkip} />
      <Muted>
        You can always find the full guide under Settings → Capture → iOS Shortcut setup.
      </Muted>
    </ScrollView>
  );
}

function NudgeStep({ number, title, body }: { number: string; title: string; body: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{number}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '700', color: colors.text, fontSize: 14 }}>{title}</Text>
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 2 }}>{body}</Text>
      </View>
    </View>
  );
}

// ─── Root controller ──────────────────────────────────────────────────────────

export default function Welcome() {
  const router = useRouter();
  const { session } = useSession();
  const [page, setPage] = useState<1 | 2>(1);
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

  async function finish() {
    if (userId) await kvSet(onboardedKey(userId), '1');
    router.replace('/(tabs)');
  }

  if (page === 1) {
    return (
      <PastePage
        onDone={() => setPage(2)}
        onSkip={() => setPage(2)}
      />
    );
  }

  return (
    <ShortcutPage
      onSetUp={() => {
        // Mark onboarded so they don't see this flow again, then send them to
        // the full setup guide in Settings.
        void finish().then(() => {
          router.push('/(tabs)/settings/shortcut-setup');
        });
      }}
      onSkip={finish}
    />
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

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
  content: { padding: 24, paddingTop: 60, gap: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  hello: { fontSize: 26, fontWeight: '800', color: colors.text },
  error: { color: colors.danger, marginTop: 8 },
  timePill: {
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  timePillText: { fontSize: 13, fontWeight: '600' },
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
