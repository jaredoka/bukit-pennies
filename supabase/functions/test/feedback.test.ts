import { describe, expect, it, vi } from 'vitest';
import {
  AREAS,
  MAX_DESCRIPTION,
  feedbackEmail,
  handleFeedback,
  parseFeedback,
  type FeedbackStore,
  type FeedbackSubmission,
  type Mailer,
} from '../_shared/feedback.ts';

function makeStore() {
  const rows: FeedbackSubmission[] = [];
  const store: FeedbackStore = {
    async insert(sub) {
      rows.push(sub);
    },
  };
  return { store, rows };
}

function makeMailer() {
  const sent: { subject: string; text: string }[] = [];
  const mailer: Mailer = {
    async send(message) {
      sent.push(message);
    },
  };
  return { mailer, sent };
}

const BUG = { kind: 'bug', short_id: 'AB12-CD34', app_version: '1.2.0', description: 'It crashed.' };
const FEATURE = {
  kind: 'feature',
  short_id: 'AB12-CD34',
  app_version: '1.2.0',
  area: 'Insights',
  description: 'Show a yearly chart.',
};

describe('parseFeedback', () => {
  it('accepts a bug report and drops any area', () => {
    const parsed = parseFeedback({ ...BUG, area: 'Insights' });
    expect(parsed).toEqual({
      ok: true,
      value: {
        kind: 'bug',
        shortId: 'AB12-CD34',
        appVersion: '1.2.0',
        area: null,
        description: 'It crashed.',
      },
    });
  });

  it('keeps the area on a feature request', () => {
    const parsed = parseFeedback(FEATURE);
    expect(parsed.ok && parsed.value.area).toBe('Insights');
  });

  it('accepts a feature request with no area rather than rejecting it', () => {
    const parsed = parseFeedback({ ...FEATURE, area: undefined });
    expect(parsed.ok && parsed.value.area).toBe(null);
  });

  it('accepts every area the picker can produce', () => {
    for (const area of AREAS) {
      const parsed = parseFeedback({ ...FEATURE, area });
      expect(parsed.ok && parsed.value.area).toBe(area);
    }
  });

  // The area reaches the subject line of an outgoing email, so an off-list
  // value is dropped rather than passed through. Dropped, not rejected: the
  // description is what matters and must never be lost over its label.
  it.each([
    ['a newline (header injection attempt)', 'Insights\r\nBcc: victim@example.com'],
    ['an off-list label', 'Something I made up'],
    ['an oversized label', 'x'.repeat(500)],
  ])('drops an area carrying %s, keeping the submission', (_label, area) => {
    const parsed = parseFeedback({ ...FEATURE, area });
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.value.area).toBe(null);
    expect(parsed.ok && parsed.value.description).toBe('Show a yearly chart.');
  });

  it.each([
    ['non-object body', 'not an object', 'invalid_body'],
    ['unknown kind', { ...BUG, kind: 'praise' }, 'invalid_kind'],
    ['missing description', { ...BUG, description: '   ' }, 'description_required'],
    ['oversized description', { ...BUG, description: 'x'.repeat(MAX_DESCRIPTION + 1) }, 'description_too_long'],
  ])('rejects %s', (_label, body, error) => {
    expect(parseFeedback(body)).toEqual({ ok: false, error });
  });

  it('trims whitespace off the description', () => {
    const parsed = parseFeedback({ ...BUG, description: '  spaced out  ' });
    expect(parsed.ok && parsed.value.description).toBe('spaced out');
  });
});

describe('feedbackEmail', () => {
  it('titles a feature request with its area and carries the identifying fields', () => {
    const parsed = parseFeedback(FEATURE);
    const mail = feedbackEmail((parsed as { ok: true; value: FeedbackSubmission }).value);
    expect(mail.subject).toBe('[Bukit Pennies] Feature request — Insights');
    expect(mail.text).toContain('Show a yearly chart.');
    expect(mail.text).toContain('User: AB12-CD34');
    expect(mail.text).toContain('App version: 1.2.0');
  });

  it('titles a bug report without an area', () => {
    const parsed = parseFeedback(BUG);
    const mail = feedbackEmail((parsed as { ok: true; value: FeedbackSubmission }).value);
    expect(mail.subject).toBe('[Bukit Pennies] Bug report');
  });

  // The end-to-end property the allowlist exists for: whatever a caller sends,
  // the subject line is single-line. Asserted on the subject rather than on
  // the parser so it keeps holding if the headline is ever rebuilt.
  it('never puts a line break in the subject, whatever the caller sends', () => {
    for (const area of ['Insights\nBcc: x@y.z', 'Insights\r\nSubject: spam', '\n\n\n']) {
      const parsed = parseFeedback({ ...FEATURE, area });
      const mail = feedbackEmail((parsed as { ok: true; value: FeedbackSubmission }).value);
      expect(mail.subject).toBe('[Bukit Pennies] Feature request');
      expect(mail.subject).not.toMatch(/[\r\n]/);
    }
  });
});

describe('handleFeedback', () => {
  it('stores the row and emails it', async () => {
    const { store, rows } = makeStore();
    const { mailer, sent } = makeMailer();
    const result = await handleFeedback(FEATURE, store, mailer);
    expect(result).toEqual({ status: 200, body: { status: 'ok', emailed: true } });
    expect(rows).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it('still stores the row when no mailer is configured', async () => {
    const { store, rows } = makeStore();
    const result = await handleFeedback(BUG, store, null);
    expect(result.body).toEqual({ status: 'ok', emailed: false });
    expect(rows).toHaveLength(1);
  });

  it('does not lose the row when the email fails', async () => {
    const { store, rows } = makeStore();
    const mailer: Mailer = { send: () => Promise.reject(new Error('resend 429')) };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await handleFeedback(BUG, store, mailer);
    spy.mockRestore();
    expect(result).toEqual({ status: 200, body: { status: 'ok', emailed: false } });
    expect(rows).toHaveLength(1);
  });

  it('rejects an invalid body before touching the store', async () => {
    const { store, rows } = makeStore();
    const { mailer, sent } = makeMailer();
    const result = await handleFeedback({ kind: 'bug' }, store, mailer);
    expect(result.status).toBe(422);
    expect(rows).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it('propagates a store failure so the client can retry', async () => {
    const store: FeedbackStore = { insert: () => Promise.reject(new Error('rls')) };
    await expect(handleFeedback(BUG, store, null)).rejects.toThrow('rls');
  });
});
