/**
 * Feedback (bug reports + feature requests) submission logic.
 *
 * Pure and unit-tested with vitest; the Deno wrapper in ../feedback/index.ts
 * supplies the store and the mailer. Runs unchanged in Deno and Node ≥20.
 *
 * The row is the source of truth — the email is a courtesy copy. A mail
 * failure must never lose a submission, so the insert happens first and a
 * failed send still returns 200 with `emailed: false`.
 */

export type FeedbackKind = 'bug' | 'feature';

export interface FeedbackSubmission {
  kind: FeedbackKind;
  shortId: string;
  appVersion: string;
  /** Which part of the app — feature requests only; null for bug reports. */
  area: string | null;
  description: string;
}

/** Client-side caps mirror these; the server is the one that counts. */
export const MAX_DESCRIPTION = 4000;
export const MAX_APP_VERSION = 32;
export const MAX_SHORT_ID = 32;

/**
 * The six labels the feature-request picker offers (`feature-request.tsx`).
 *
 * An allowlist rather than a length check, because `area` is the one piece of
 * caller-supplied text that reaches the *subject line* of an outgoing email
 * (see `feedbackEmail`). Trimming leaves CR and LF intact, and whether a
 * newline in a subject becomes a header injection then depends entirely on how
 * Resend sanitises the field — which is not a guarantee this code gets to make
 * on someone else's behalf. Since the client can only ever send one of six
 * literals, accepting only those six removes the question.
 */
export const AREAS = [
  'Capture',
  'Transactions',
  'Budgets & goals',
  'Insights',
  'Notifications',
  'Something else',
] as const;

export type ParsedFeedback =
  | { ok: true; value: FeedbackSubmission }
  | { ok: false; error: string };

function str(v: unknown): string | null {
  return typeof v === 'string' ? v.trim() : null;
}

export function parseFeedback(body: unknown): ParsedFeedback {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'invalid_body' };
  const b = body as Record<string, unknown>;

  const kind = str(b.kind);
  if (kind !== 'bug' && kind !== 'feature') return { ok: false, error: 'invalid_kind' };

  const description = str(b.description);
  if (!description) return { ok: false, error: 'description_required' };
  if (description.length > MAX_DESCRIPTION) return { ok: false, error: 'description_too_long' };

  const appVersion = str(b.app_version) ?? '';
  if (appVersion.length > MAX_APP_VERSION) return { ok: false, error: 'app_version_too_long' };

  const shortId = str(b.short_id) ?? '';
  if (shortId.length > MAX_SHORT_ID) return { ok: false, error: 'short_id_too_long' };

  // Bug reports have no area; a feature request whose area is missing or
  // unrecognised is still accepted, with the label dropped — losing somebody's
  // request over a bad label is worse than filing it as Unspecified.
  const rawArea = kind === 'feature' ? str(b.area) : null;
  const area = rawArea && (AREAS as readonly string[]).includes(rawArea) ? rawArea : null;

  return { ok: true, value: { kind, shortId, appVersion, area, description } };
}

/** Plain-text notification. Text only, so nothing in the body can be markup. */
export function feedbackEmail(sub: FeedbackSubmission): { subject: string; text: string } {
  const label = sub.kind === 'bug' ? 'Bug report' : 'Feature request';
  const headline = sub.kind === 'feature' && sub.area ? `${label} — ${sub.area}` : label;
  const lines = [
    headline,
    '',
    sub.description,
    '',
    '—',
    `User: ${sub.shortId || 'unknown'}`,
    `App version: ${sub.appVersion || 'unknown'}`,
  ];
  return { subject: `[Bukit Pennies] ${headline}`, text: lines.join('\n') };
}

export interface FeedbackStore {
  /** Inserts into bug_reports or feature_requests under the caller's JWT. */
  insert(sub: FeedbackSubmission): Promise<void>;
}

export interface Mailer {
  /** Resolves on send; rejects on failure. Null mailer means email is off. */
  send(message: { subject: string; text: string }): Promise<void>;
}

export interface FeedbackResult {
  status: number;
  body: { status: 'ok'; emailed: boolean } | { status: 'error'; error: string };
}

export async function handleFeedback(
  body: unknown,
  store: FeedbackStore,
  mailer: Mailer | null,
): Promise<FeedbackResult> {
  const parsed = parseFeedback(body);
  if (!parsed.ok) return { status: 422, body: { status: 'error', error: parsed.error } };

  await store.insert(parsed.value);

  if (!mailer) return { status: 200, body: { status: 'ok', emailed: false } };
  try {
    await mailer.send(feedbackEmail(parsed.value));
    return { status: 200, body: { status: 'ok', emailed: true } };
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      msg: 'feedback_email_failed',
      kind: parsed.value.kind,
      error: err instanceof Error ? err.message : String(err),
    }));
    return { status: 200, body: { status: 'ok', emailed: false } };
  }
}
