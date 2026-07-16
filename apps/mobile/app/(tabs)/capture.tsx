import { parseBankMessage, splitBankMessages } from '@bukit/parsers';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, colors, Field, Muted, Title } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { postIngest, postIngestMany, type BulkItemResult, type IngestResponse } from '@/lib/ingest';

const MAX_TEXT_BYTES = 4096; // server-side limit per message

export default function Capture() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [bulkResults, setBulkResults] = useState<BulkItemResult[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  // Same splitter + parser code the server runs — instant offline preview.
  const messages = useMemo(() => splitBankMessages(text), [text]);
  const bulk = messages.length > 1;
  const preview = useMemo(
    () => (messages.length === 1 ? parseBankMessage(messages[0]!) : null),
    [messages],
  );
  const bulkPreview = useMemo(
    () =>
      bulk
        ? messages.map((m) => ({
            text: m,
            parsed: parseBankMessage(m),
            oversized: new TextEncoder().encode(m).length > MAX_TEXT_BYTES,
          }))
        : [],
    [bulk, messages],
  );
  const transactionalCount = bulkPreview.filter((p) => p.parsed.tx !== null).length;

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['transactions'] });
    qc.invalidateQueries({ queryKey: ['monthly_totals'] });
    qc.invalidateQueries({ queryKey: ['merchant_totals'] });
  }

  function reset() {
    setResult(null);
    setBulkResults(null);
    setProgress(null);
    setError(null);
  }

  async function submitSingle() {
    setBusy(true);
    reset();
    try {
      const res = await postIngest(messages[0] ?? text.trim(), 'paste');
      setResult(res);
      if (res.status === 'created') {
        setText('');
        invalidate();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitBulk() {
    setBusy(true);
    reset();
    setProgress({ done: 0, total: messages.length });
    try {
      const results = await postIngestMany(messages, 'paste', (done, total) =>
        setProgress({ done, total }),
      );
      setBulkResults(results);
      invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Title>Paste bank messages</Title>
        <Muted>
          Copy the notification text from your bank (SMS or app notification) and paste it here —
          one message or a whole conversation at once. Bukit Pennies never connects to your bank —
          it only reads the text you give it.
        </Muted>
        <Field
          multiline
          value={text}
          onChangeText={(t) => {
            setText(t);
            reset();
          }}
          placeholder="Card No.: 4x0213 Amount: BND 21.00 Merchant: … Date: …"
          style={{ minHeight: 110, marginTop: 12, textAlignVertical: 'top' }}
          autoCapitalize="none"
        />
        <Button
          label={bulk ? `Save ${messages.length} messages` : 'Save transaction'}
          onPress={bulk ? submitBulk : submitSingle}
          disabled={messages.length === 0}
          busy={busy}
        />
        {progress ? (
          <Text style={styles.banner}>{`Saving ${progress.done} / ${progress.total}…`}</Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {result ? <ResultBanner result={result} /> : null}
      </Card>

      {bulkResults ? (
        <Card>
          <Title>Results</Title>
          <BulkSummary results={bulkResults} />
          {bulkResults.map((r, i) => (
            <BulkRow key={i} index={i} text={r.text} outcome={outcomeOf(r.response)} />
          ))}
          <Button
            label="Clear"
            variant="secondary"
            onPress={() => {
              setText('');
              reset();
            }}
          />
        </Card>
      ) : null}

      {bulk && !bulkResults ? (
        <Card>
          <Title>Preview</Title>
          <Muted>
            {`${messages.length} messages detected, ${transactionalCount} look transactional.`}
            {transactionalCount < messages.length
              ? ' Non-transaction messages (OTPs, promos) will be ignored automatically.'
              : ''}
          </Muted>
          <View style={{ marginTop: 8 }}>
            {bulkPreview.map((p, i) => (
              <View key={i} style={styles.bulkRow}>
                <Text style={styles.bulkIndex}>{i + 1}</Text>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.bulkText} numberOfLines={1}>
                    {p.parsed.tx?.merchant ?? p.text.slice(0, 60)}
                  </Text>
                  {p.parsed.tx ? (
                    <Muted>{formatMoney(p.parsed.tx.amount, p.parsed.tx.currency)}</Muted>
                  ) : null}
                </View>
                {p.oversized ? (
                  <Badge label="over 4 KB" tone="danger" />
                ) : p.parsed.tx === null ? (
                  <Badge label="will be ignored" tone="muted" />
                ) : p.parsed.tx.confidence < 0.75 || p.parsed.tx.amount === null ? (
                  <Badge label="needs review" tone="warning" />
                ) : (
                  <Badge label="ok" tone="success" />
                )}
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {preview ? (
        <Card>
          <Title>Preview</Title>
          {preview.tx ? (
            <View>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                <Badge label={preview.tx.bank} />
                <Badge
                  label={`confidence ${(preview.tx.confidence * 100).toFixed(0)}%`}
                  tone={preview.tx.confidence >= 0.75 ? 'success' : 'warning'}
                />
                {preview.tx.confidence < 0.75 || preview.tx.amount === null ? (
                  <Badge label="will need review" tone="warning" />
                ) : null}
              </View>
              <PreviewRow label="Amount" value={formatMoney(preview.tx.amount, preview.tx.currency)} />
              <PreviewRow label="Merchant" value={preview.tx.merchant ?? '—'} />
              <PreviewRow label="Date" value={preview.tx.occurredAt ?? '—'} />
              <PreviewRow label="Card" value={preview.tx.cardLast4 ? `•${preview.tx.cardLast4}` : '—'} />
            </View>
          ) : (
            <Muted>
              {preview.isTransactional
                ? 'Could not extract a transaction from this text.'
                : 'This does not look like a transaction message (OTP, promo, or balance alert) — it will be ignored.'}
            </Muted>
          )}
        </Card>
      ) : null}
    </ScrollView>
  );
}

type Outcome = 'created' | 'needs review' | 'duplicate' | 'ignored' | 'error';

function outcomeOf(res: IngestResponse): Outcome {
  if (res.status === 'created') {
    return res.transaction?.parse_status === 'needs_review' ? 'needs review' : 'created';
  }
  if (res.status === 'duplicate') return 'duplicate';
  if (res.status === 'ignored') return 'ignored';
  return 'error';
}

function BulkSummary({ results }: { results: BulkItemResult[] }) {
  const counts = new Map<Outcome, number>();
  for (const r of results) {
    const o = outcomeOf(r.response);
    counts.set(o, (counts.get(o) ?? 0) + 1);
  }
  const parts = Array.from(counts.entries()).map(([o, n]) => `${n} ${o}`);
  return <Muted>{parts.join(' · ')}</Muted>;
}

function BulkRow({ index, text, outcome }: { index: number; text: string; outcome: Outcome }) {
  const tone =
    outcome === 'created'
      ? 'success'
      : outcome === 'error'
        ? 'danger'
        : outcome === 'ignored'
          ? 'muted'
          : 'warning';
  return (
    <View style={styles.bulkRow}>
      <Text style={styles.bulkIndex}>{index + 1}</Text>
      <Text style={[styles.bulkText, { flex: 1, marginRight: 8 }]} numberOfLines={1}>
        {text.slice(0, 60)}
      </Text>
      <Badge label={outcome} tone={tone} />
    </View>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.previewRow}>
      <Text style={styles.previewLabel}>{label}</Text>
      <Text style={styles.previewValue}>{value}</Text>
    </View>
  );
}

function ResultBanner({ result }: { result: IngestResponse }) {
  const text =
    result.status === 'created'
      ? '✓ Transaction saved.'
      : result.status === 'duplicate'
        ? 'Already recorded — this exact message was captured before.'
        : result.status === 'ignored'
          ? `Ignored: not a transaction message${result.reason ? ` (${result.reason})` : ''}.`
          : `Error: ${result.error ?? 'unknown'}`;
  const tone =
    result.status === 'created' ? colors.primary : result.status === 'error' ? colors.danger : colors.warning;
  return <Text style={[styles.banner, { color: tone }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  error: { color: colors.danger, marginTop: 8 },
  banner: { marginTop: 10, fontWeight: '600', color: colors.text },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  previewLabel: { color: colors.muted },
  previewValue: { color: colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  bulkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  bulkIndex: { width: 24, color: colors.muted, fontVariant: ['tabular-nums'] },
  bulkText: { color: colors.text, fontSize: 13 },
});
