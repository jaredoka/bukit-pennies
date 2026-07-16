import { parseBankMessage } from '@bukit/parsers';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, colors, Field, Muted, Title } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { postIngest, type IngestResponse } from '@/lib/ingest';

export default function Capture() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  // Same parser code the server runs — instant offline preview.
  const preview = useMemo(() => (text.trim() ? parseBankMessage(text) : null), [text]);

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await postIngest(text.trim(), 'paste');
      setResult(res);
      if (res.status === 'created') {
        setText('');
        qc.invalidateQueries({ queryKey: ['transactions'] });
        qc.invalidateQueries({ queryKey: ['monthly_totals'] });
        qc.invalidateQueries({ queryKey: ['merchant_totals'] });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Title>Paste a bank message</Title>
        <Muted>
          Copy the notification text from your bank (SMS or app notification) and paste it here.
          Bukit Pennies never connects to your bank — it only reads the text you give it.
        </Muted>
        <Field
          multiline
          value={text}
          onChangeText={(t) => {
            setText(t);
            setResult(null);
          }}
          placeholder="Card No.: 4x0213 Amount: BND 21.00 Merchant: … Date: …"
          style={{ minHeight: 110, marginTop: 12, textAlignVertical: 'top' }}
          autoCapitalize="none"
        />
        <Button
          label="Save transaction"
          onPress={submit}
          disabled={!text.trim()}
          busy={busy}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {result ? <ResultBanner result={result} /> : null}
      </Card>

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
  banner: { marginTop: 10, fontWeight: '600' },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  previewLabel: { color: colors.muted },
  previewValue: { color: colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
});
