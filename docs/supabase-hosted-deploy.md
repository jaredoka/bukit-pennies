# Deploying to hosted Supabase (for on-device testing and beyond)

The iPhone can't reach `supabase start` on your PC, so device testing needs a
hosted project. Everything below runs from the repo root on Windows.

## 1. Create the project

1. <https://supabase.com/dashboard> → New project (free tier is fine).
   Region: Southeast Asia (Singapore) — closest to Brunei.
2. Note the **project ref** (in the URL: `https://supabase.com/dashboard/project/<ref>`),
   the **Project URL** (`https://<ref>.supabase.co`) and the **anon/publishable
   key** (Settings → API Keys).

## 2. Link and push the schema

```powershell
pnpm exec supabase login          # opens browser
pnpm exec supabase link --project-ref <ref>
pnpm exec supabase db push       # applies migrations 01–04
```

**Do NOT run `supabase/seed.sql` against the hosted project** — it is dev-only
(demo users, fake transactions). `db push` alone is correct.

## 3. Deploy the ingest edge function

```powershell
node scripts/sync-parsers.mjs            # ensure the synced parser copy is current
pnpm exec supabase functions deploy ingest --no-verify-jwt
```

`--no-verify-jwt` matches `config.toml` (`[functions.ingest] verify_jwt = false`):
the function authenticates with our own `bp_…` device tokens, because an iOS
Shortcut can only attach a static header.

## 4. Point clients at the hosted project

- **Local web/dev run:** create `apps/mobile/.env` (gitignored by Expo) with
  `EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co` and
  `EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>`, or export them before
  `pnpm --filter @bukit/mobile web`. Without them the app defaults to the
  local stack.
- **iOS build:** pass both values as inputs to the *iOS unsigned IPA*
  workflow run (they're baked into the bundle).

## 5. Smoke-check the deployment

```powershell
# Sign up a real account in the app first, create a token in Settings →
# Capture devices, then:
curl -X POST "https://<ref>.supabase.co/functions/v1/ingest" `
  -H "Authorization: Bearer <bp_token>" -H "Content-Type: application/json" `
  -d '{"text":"Card No.: 4x0213 Amount: BND 21.00 Merchant: GALORIES SMOOTHIES BSB BN Date: 10-07-2026 17:37:59 If suspicious, please call 2449666.","source":"paste"}'
# expect {"status":"created",...}; resend → {"status":"duplicate",...}
```

## Notes

- Auth → email confirmations are ON by default on hosted projects. For
  testing, either keep them (mail arrives via Supabase's built-in sender) or
  disable under Authentication → Providers → Email.
- Free-tier projects **pause after ~1 week of inactivity**; resume from the
  dashboard before a test session.
- Never point `verify-ingest.sh` or seed scripts at the hosted project.
