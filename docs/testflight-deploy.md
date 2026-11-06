# TestFlight & App Store deployment (EAS)

The path from this repo to your iPhone and the App Store. Everything runs
from Windows — EAS builds on Expo's Mac servers. Prerequisite: Apple
Developer Program enrolment (US$99/yr, developer.apple.com, approval takes
~1–2 days).

## One-time setup (after enrolment is approved)

1. **Fill the two remaining placeholders** marked `FILL-ME` in
   `apps/mobile/eas.json` (the anon key is already filled in — it is a public
   client key and RLS is the security boundary):
   - `appleTeamId` — developer.apple.com → Membership details → Team ID.
   - `ascAppId` — after step 4 below (numeric App ID from App Store Connect).

2. **Expo account + CLI login** (free tier: ~30 cloud builds/month):

   ```powershell
   pnpm dlx eas-cli login          # create an account at expo.dev first if needed
   pnpm dlx eas-cli init           # run inside apps/mobile — links the project, writes projectId
   ```

3. **First build** (EAS creates and manages all signing credentials —
   answer "yes" when it offers to handle certificates/profiles; you'll
   sign in with your Apple ID once):

   ```powershell
   cd apps/mobile
   pnpm dlx eas-cli build --platform ios --profile production
   ```

4. **Create the app record** in App Store Connect
   (appstoreconnect.apple.com → My Apps → "+" → New App):
   - Bundle ID: `com.bukitpennies.app` (appears in the dropdown after the
     first EAS credential setup)
   - Name: Bukit Pennies · Primary language: English · Price: Free
   - Copy the numeric **App ID** (App Information → General) into
     `ascAppId` in eas.json.

5. **Submit the build to TestFlight**:

   ```powershell
   pnpm dlx eas-cli submit --platform ios --latest
   ```

   Processing takes ~10–30 min, then the build appears in App Store
   Connect → TestFlight. Install the TestFlight app on your iPhone, add
   yourself as an internal tester, and install.

## Every subsequent release

```powershell
cd apps/mobile
pnpm dlx eas-cli build --platform ios --profile production
pnpm dlx eas-cli submit --platform ios --latest
```

`autoIncrement` bumps the build number automatically. Bump the
user-facing `version` in `app.json` for feature releases.

## On-device test checklist (first TestFlight build)

- [ ] Sign-up → welcome paste page (one-tap sample SMS) → dashboard, setup banner
- [ ] Shortcut setup guide: inline token creation, iCloud download link
- [ ] Real BIBD + Baiduri SMS through the Shortcut → parsed + pre-categorized
- [ ] Insights tab renders with real data
- [ ] Dark mode, privacy cloak, notifications

## App Store review submission (after TestFlight is stable)

App Store Connect → the app → the version → App Store section. Draft
metadata lives below; adjust copy as needed but keep the facts (no bank
connectivity, demo account, paste/Shortcut capture) intact.

### Screenshots (already prepared, 2026-08-12)

5 PNGs at **1320×2868** (the 6.9" master — Apple auto-scales to every
smaller iPhone) in `store-assets/ios-screenshots/master/`:
01-dashboard, 02-transactions, 03-insights, 04-goals, 05-settings. Light
theme, demo-account data, no overlays. Resized from iPhone 17 native
captures (1206×2622); originals in `store-assets/ios-screenshots/source/`.
Upload to the 6.9" slot. This folder is local-only and not committed to the
repo.

### Description

> Bukit Pennies logs your card spending in Brunei — automatically, from the
> SMS and bank-app notification text your bank already sends you.
>
> Paste any bank message (Baiduri, BIBD, Standard Chartered) and Bukit
> Pennies reads the amount, merchant, date, and card for you. Set up the
> optional iOS Shortcut and new purchases appear in your dashboard as they
> happen.
>
> See where your money goes: a spending donut, daily and monthly charts,
> insights, budgets, savings goals, subscriptions, and per-transaction notes.
> Duplicate captures are caught before they double-count.
>
> **Bukit Pennies never connects to your bank.** No bank passwords, no
> account linking, no open banking — it only ever reads notification text you
> choose to share. Anything it can't confidently parse waits in your Review
> inbox for a quick fix instead of being guessed.
>
> Free. No ads. No analytics. Made for Brunei.

### Keywords

(≤ 100 characters, comma-separated)

`brunei, spending, budget, bank, SMS, Baiduri, BIBD, expense tracker, personal finance, money`

### Support URL

`https://jaredoka.github.io/bukit-pennies` (the Pages landing page — a
plain HTTPS page with contact info is all Apple requires; the
`bukitpennies.com` domain remains an option for later).

### Review notes (paste into the "App Review Information" section)

> Bukit Pennies parses bank **notification text** the user provides — it
> never connects to a bank account or app. No credentials, no account
> linking, no open banking, no scraping. Capture paths: paste SMS/notification
> text into the app (a live offline preview shows what was parsed before it is
> saved), or an optional iOS Shortcut that forwards messages from the user's
> bank sender to a private per-user ingest endpoint. Nothing is read
> automatically without the user setting the Shortcut up themselves.
>
> Demo account with realistic seeded data (dashboard, transactions, budgets,
> goals, insights): `demo@bukitpennies.test` / `demo12345`. The reviewer can
> also paste a sample Baiduri SMS (Settings shows a built-in example) to watch
> a transaction parse end to end.
>
> iPhone-only (no iPad), portrait orientation, minimum iOS 16.4. Password
> reset is the only account-recovery path; privacy policy and terms are
> linked in-app and in this listing. The app is free and contains no
> in-app purchases.

### App Privacy questionnaire

| Question | Answer |
|---|---|
| Collects data? | Yes |
| Email address | **Account management** — linked to the user's identity, **not** used for tracking |
| Financial info (transaction text, amount, merchant, card last four) | **App functionality** — linked to the user's identity, **not** used for tracking |
| Contact info / names / other | No |
| Identifiers / usage data / diagnostics | No |
| Third-party advertising / tracking | No (no ad or analytics SDK; Sentry is wired in but disabled until a DSN is set) |

## Pre-build drift check (do this before the first EAS production build)

`pnpm exec supabase migration list --linked` must show local and remote in
step. As of 2026-08-12 there is **one known drift**: remote has migration
`26_heard_about.sql` applied (it was pushed from the unmerged
`phase-8-launch-marketing` branch / PR #117), but `main` has no migration 26.
The columns are nullable and the `main` app never writes them, so it is
functionally harmless — but `supabase db reset` locally produces 25
migrations while hosted has 26. **Resolve before launch:** merge PR #117
(which carries migration 26 + the gated rate-me prompt + the `0.2.0`
version bump already made on `main`), or explicitly abandon it and clean the
remote. Do not ship with the drift.

## Share extension (post-launch enhancement)

The paid account also unlocks `expo-share-extension` —
"share" a bank SMS from Messages straight into the app. Add it once the
base app is approved; it changes provisioning (an app extension target),
so land it as its own release.

## Costs

| Item | Cost |
|---|---|
| Apple Developer Program | US$99/yr — the only unavoidable cost |
| EAS builds | Free tier ~30 builds/month (plenty) |
| GitHub Actions | Not used for iOS builds (macOS runners = 10× minutes; `ios-unsigned-ipa.yml` is the obsolete pre-enrolment stopgap for Sideloadly) |
