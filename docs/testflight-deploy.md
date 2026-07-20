# TestFlight & App Store deployment (EAS)

The path from this repo to your iPhone and the App Store. Everything runs
from Windows — EAS builds on Expo's Mac servers. Prerequisite: Apple
Developer Program enrolment (US$99/yr, developer.apple.com, approval takes
~1–2 days).

## One-time setup (after enrolment is approved)

1. **Fill the three placeholders** marked `FILL-ME` in `apps/mobile/eas.json`:
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase dashboard → Settings →
     API Keys → `anon` / `publishable` key. (Safe to commit: it is a public
     client key; RLS is the security boundary.)
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

- [ ] Sign-up → two-page welcome flow (paste SMS → Shortcut nudge)
- [ ] Shortcut setup guide: inline token creation, iCloud download link
- [ ] Real BIBD + Baiduri SMS through the Shortcut → parsed + pre-categorized
- [ ] Insights tab renders with real data
- [ ] Dark mode, privacy cloak, notifications

## App Store review submission (after TestFlight is stable)

- App Store Connect → the app → Distribution: screenshots (6.7" and 5.5"),
  description, keywords, support URL (bukitpennies@gmail.com), privacy policy
  URL: `https://jaredoka.github.io/bukit-pennies-legal/privacy-policy`.
- App Privacy questionnaire: data collected = email (account), financial
  info (user-provided transaction text) — linked to identity, not used for
  tracking.
- Review notes: explain the SMS-paste model — the app never connects to
  bank accounts; users paste/forward notification text. Provide a demo
  account with seeded data for the reviewer.

## Share extension (post-launch enhancement)

The paid account also unlocks `expo-share-extension` (HANDOFF §10) —
"share" a bank SMS from Messages straight into the app. Add it once the
base app is approved; it changes provisioning (an app extension target),
so land it as its own release.

## Costs

| Item | Cost |
|---|---|
| Apple Developer Program | US$99/yr — the only unavoidable cost |
| EAS builds | Free tier ~30 builds/month (plenty) |
| GitHub Actions | Not used for iOS builds (macOS runners = 10× minutes; `ios-unsigned-ipa.yml` is the obsolete pre-enrolment stopgap for Sideloadly) |
