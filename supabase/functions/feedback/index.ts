// Thin Deno wrapper: HTTP + Supabase I/O + Resend. All logic lives in
// ../_shared/feedback.ts (pure, unit-tested with vitest).
//
// Unlike /ingest this runs with verify_jwt = true: the caller is a signed-in
// app user, so the gateway validates the JWT and the row is inserted through
// the *caller's* token — RLS and the `user_id default auth.uid()` on both
// tables still apply. The service-role key is deliberately not used here.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  handleFeedback,
  type FeedbackStore,
  type FeedbackSubmission,
  type Mailer,
} from '../_shared/feedback.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const EMAIL_TO = Deno.env.get('FEEDBACK_EMAIL_TO');
const EMAIL_FROM = Deno.env.get('FEEDBACK_EMAIL_FROM') ?? 'onboarding@resend.dev';

const TABLE: Record<FeedbackSubmission['kind'], string> = {
  bug: 'bug_reports',
  feature: 'feature_requests',
};

function storeFor(authorization: string): FeedbackStore {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  return {
    async insert(sub) {
      const row: Record<string, string> = {
        short_id: sub.shortId,
        app_version: sub.appVersion,
        description: sub.description,
      };
      // feature_requests.area is not null; bug_reports has no such column.
      if (sub.kind === 'feature') row.area = sub.area ?? 'Unspecified';
      const { error } = await supabase.from(TABLE[sub.kind]).insert(row);
      if (error) throw error;
    },
  };
}

/**
 * Null when RESEND_API_KEY or FEEDBACK_EMAIL_TO is unset — local dev and any
 * deploy without the secrets still records submissions, just without email.
 */
const mailer: Mailer | null = RESEND_API_KEY && EMAIL_TO
  ? {
      async send({ subject, text }) {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from: EMAIL_FROM, to: [EMAIL_TO], subject, text }),
        });
        if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
      },
    }
  : null;

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ status: 'error', error: 'method_not_allowed' }, { status: 405 });
  }
  const authorization = req.headers.get('authorization');
  if (!authorization) {
    return Response.json({ status: 'error', error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    // handler responds 422 invalid_body
  }

  try {
    const result = await handleFeedback(body, storeFor(authorization), mailer);
    return Response.json(result.body, { status: result.status });
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      msg: 'feedback_failed',
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }));
    return Response.json({ status: 'error', error: 'internal_error' }, { status: 500 });
  }
});
