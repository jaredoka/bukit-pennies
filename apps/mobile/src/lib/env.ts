// Local `supabase start` defaults; override with EXPO_PUBLIC_* env vars when
// pointing at a hosted project. The fallback anon key is the well-known
// supabase-demo JWT every local stack ships with — not a secret.
export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';

export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

export const INGEST_URL = `${SUPABASE_URL}/functions/v1/ingest`;

export const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

// Owner's shared iCloud link to the self-configuring capture shortcut
// (CI cannot sign shortcuts — see docs/shortcut-authoring.md).
export const SHORTCUT_DOWNLOAD_URL =
  'https://www.icloud.com/shortcuts/e639f5c27dd34f1191a81eeaa80ea27e';

// The shortcut's name in the Shortcuts app, exactly as the owner saved it.
// `shortcuts://run-shortcut?name=` matches on this string, so a rename that
// misses this constant breaks Step 3's token handoff — the deep link targets a
// shortcut that no longer exists and iOS just opens Shortcuts with nothing to
// run. It lives beside the download URL because the two must be rebuilt and
// republished together, and it is referenced by every on-screen mention of the
// name so the instructions cannot drift from the link.
export const SHORTCUT_NAME = 'Bukit Pennies';

// Public policy pages — GitHub Pages, served from this repo's `docs/` folder.
// They used to live in a separate public `bukit-pennies-legal` repo only
// because Pages on a private repo needs a paid plan; this repo is public now,
// so the pages are served from the same `docs/*.md` files the repo already
// carried, and the duplicate repo is gone (HANDOFF §19).
export const PRIVACY_POLICY_URL = 'https://jaredoka.github.io/bukit-pennies/privacy-policy';
export const TERMS_URL = 'https://jaredoka.github.io/bukit-pennies/terms';
export const SUPPORT_EMAIL = 'bukitpennies@gmail.com';
