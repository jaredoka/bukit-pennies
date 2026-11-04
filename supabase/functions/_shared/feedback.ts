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

/**
 * Consent-gated diagnostics attached to a bug report.
 *
 * Every field is optional and every field is allowlisted twice: the client only
 * builds these keys, and `parseDiagnostics` below accepts only these keys. The
 * report body is user prose and may contain anything; this object must not.
 * Amounts, merchants, notes, SMS text and card digits are never collected, so
 * they cannot appear here even if a caller sends them — unknown keys are
 * dropped rather than stored.
 */
export interface FeedbackDiagnostics {
  buildNumber: string | null;
  gitSha: string | null;
  platform: string | null;
  osVersion: string | null;
  deviceModel: string | null;
  route: string | null;
  sentryEventId: string | null;
  /** The remaining allowlist, stored as one jsonb object. */
  extra: {
    locale?: string;
    app_state?: string;
    network?: string;
    screen?: string;
    breadcrumbs?: string[];
  };
}

export interface FeedbackSubmission {
  kind: FeedbackKind;
  shortId: string;
  appVersion: string;
  /** Which part of the app — feature requests only; null for bug reports. */
  area: string | null;
  description: string;
  /** Null unless the caller opted in and the platform supplied one. */
  diagnostics: FeedbackDiagnostics | null;
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

/** Trim and cap. Long values are truncated, not rejected: a truncated device
 *  model is still useful, and a report is never worth refusing over telemetry. */
function capped(v: unknown, max: number): string | null {
  const s = str(v);
  return s ? s.slice(0, max) : null;
}

export const MAX_BREADCRUMBS = 20;
export const MAX_BREADCRUMB_LENGTH = 120;

function parseDiagnosticExtra(raw: unknown): FeedbackDiagnostics['extra'] {
  const extra: FeedbackDiagnostics['extra'] = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return extra;
  const e = raw as Record<string, unknown>;

  const locale = capped(e.locale, 24);
  if (locale) extra.locale = locale;
  const appState = capped(e.app_state, 16);
  if (appState) extra.app_state = appState;
  const network = capped(e.network, 16);
  if (network) extra.network = network;
  const screen = capped(e.screen, 16);
  if (screen) extra.screen = screen;

  if (Array.isArray(e.breadcrumbs)) {
    const breadcrumbs = e.breadcrumbs
      .map((crumb) => capped(crumb, MAX_BREADCRUMB_LENGTH))
      .filter((crumb): crumb is string => crumb !== null)
      .slice(0, MAX_BREADCRUMBS);
    if (breadcrumbs.length > 0) extra.breadcrumbs = breadcrumbs;
  }
  return extra;
}

/**
 * Second half of the allowlist. The client builds these exact keys; anything
 * else a caller sends is dropped here rather than stored. A malformed object
 * degrades to `null` so the prose report still lands — diagnostics are a bonus,
 * never a precondition for accepting a report.
 */
export function parseDiagnostics(raw: unknown): FeedbackDiagnostics | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const d = raw as Record<string, unknown>;

  const diagnostics: FeedbackDiagnostics = {
    buildNumber: capped(d.build_number, 32),
    gitSha: capped(d.git_sha, 40),
    platform: capped(d.platform, 16),
    osVersion: capped(d.os_version, 32),
    deviceModel: capped(d.device_model, 48),
    route: capped(d.route, 200),
    sentryEventId: capped(d.sentry_event_id, 64),
    extra: parseDiagnosticExtra(d.extra),
  };

  const isEmpty =
    diagnostics.buildNumber === null &&
    diagnostics.gitSha === null &&
    diagnostics.platform === null &&
    diagnostics.osVersion === null &&
    diagnostics.deviceModel === null &&
    diagnostics.route === null &&
    diagnostics.sentryEventId === null &&
    Object.keys(diagnostics.extra).length === 0;
  return isEmpty ? null : diagnostics;
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

  // Diagnostics are bug-only: a feature request has no device state worth
  // attaching, and accepting them there would widen the surface for nothing.
  const diagnostics = kind === 'bug' ? parseDiagnostics(b.diagnostics) : null;

  return { ok: true, value: { kind, shortId, appVersion, area, description, diagnostics } };
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
  // Enough to find the binary and the screen in Sentry, without pasting the
  // whole diagnostics object into an email.
  if (sub.diagnostics?.buildNumber) lines.push(`Build: ${sub.diagnostics.buildNumber}`);
  if (sub.diagnostics?.gitSha) lines.push(`Commit: ${sub.diagnostics.gitSha}`);
  if (sub.diagnostics?.route) lines.push(`Screen: ${sub.diagnostics.route}`);
  if (sub.diagnostics?.sentryEventId) lines.push(`Sentry event: ${sub.diagnostics.sentryEventId}`);
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
