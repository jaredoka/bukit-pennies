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

// Signed, ready-made iOS shortcut published by .github/workflows/ios-shortcut.yml.
export const SHORTCUT_DOWNLOAD_URL =
  'https://www.icloud.com/shortcuts/9a70cda0b1b84feca11991213011a95a';

// Public policy pages (GitHub Pages, served from the public
// jaredoka/bukit-pennies-legal repo — this repo is private).
export const PRIVACY_POLICY_URL = 'https://jaredoka.github.io/bukit-pennies-legal/privacy-policy';
export const TERMS_URL = 'https://jaredoka.github.io/bukit-pennies-legal/terms';
export const SUPPORT_EMAIL = 'jaredoka@gmail.com';
