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

// Owner's shared iCloud link to the self-configuring "Bukit Pennies Capture"
// shortcut (CI cannot sign shortcuts — see docs/shortcut-authoring.md).
export const SHORTCUT_DOWNLOAD_URL =
  'https://www.icloud.com/shortcuts/92fe37ee63e04a4785d69517f0c1635e';

// Public policy pages — GitHub Pages, served from this repo's `docs/` folder.
// They used to live in a separate public `bukit-pennies-legal` repo only
// because Pages on a private repo needs a paid plan; this repo is public now,
// so the pages are served from the same `docs/*.md` files the repo already
// carried, and the duplicate repo is gone (HANDOFF §19).
export const PRIVACY_POLICY_URL = 'https://jaredoka.github.io/bukit-pennies/privacy-policy';
export const TERMS_URL = 'https://jaredoka.github.io/bukit-pennies/terms';
export const SUPPORT_EMAIL = 'bukitpennies@gmail.com';
