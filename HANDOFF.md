# Bukit Pennies — Project Handoff Document

**Status:** Phases 0–6 built and merged; app is live against hosted Supabase and field-tested on the owner's iPhone. §1–§14 are the original approved design (kept for reference); §15–§16 record what exists now and the adoption roadmap. **§16 is the current source of truth for what to build next.**

**Branch:** `main` (GitHub Flow — feature branches off `main`, merged via pull request)
**Date:** 2026-07-16 (original) · last updated 2026-07-20

---

## 1. What we're building

A **multi-user product**, downloadable from the **iOS App Store and Google Play** (iOS is the priority platform), that automatically logs card spending in Brunei. When a card is used, banks send a notification — Baiduri sends a direct message (SMS); others (BIBD, Standard Chartered) may use bank-app push notifications. The app captures that notification text, parses **date, merchant/shop, amount, card**, stores the transaction with user-editable **notes**, and shows a **dashboard** (monthly totals, spending trend, top merchants, transaction list).

### Confirmed product decisions (from the user)
- Cross-platform mobile app on both stores; **iOS first**.
- **Cloud-hosted** backend; **multi-user** product with real auth and per-user data isolation.
- Banks: **Baiduri, BIBD, Standard Chartered (Brunei)**.
- **Safety is a core requirement:** the system must **never connect to bank apps or accounts** — it only ever processes notification *text*. No credentials, no open banking. This is the key trust/marketing message and also what makes store review tractable.

### Real bank message sample (Baiduri, via direct message/SMS)
```
Card No.: 4x0213 Amount: BND 21.00 Merchant: GALORIES SMOOTHIES BSB BN Date: 10-07-2026 17:37:59 If suspicious, please call 2449666.
```
BIBD and SCB formats are **unknown** — parsers for them start as best-guess skeletons, and the app's "needs review" inbox doubles as the sample-collection loop to refine them.

## 2. Platform constraints (validated — design around these, do not re-litigate)

- **iOS:** No app may read another app's notifications or SMS. Capture paths on iOS are:
  1. **Share Extension** (share notification text into the app),
  2. **paste-to-parse screen**,
  3. **iOS Shortcuts automation** — fires on incoming SMS from bank senders and POSTs the text to our ingest API (near-automatic; may require a confirmation tap depending on iOS version/settings).
- **Android:** `NotificationListenerService` captures **both** SMS notifications and bank-app push notifications → true full-auto capture. Avoids the Play-restricted `READ_SMS` permission, but still requires a prominent-disclosure declaration in Play Console.
- **Dev environment:** everything is buildable/testable in a cloud session **except** device-only behavior (receiving real notifications, share-extension e2e, real bank-app package names) and store submission. Those become EAS cloud builds + a user-executed checklist.

## 3. Stack

| Layer | Choice | Notes |
|---|---|---|
| Mobile | **Expo** (React Native, TypeScript, latest stable SDK), dev-client (NOT Expo Go) | native modules require dev-client |
| Navigation | `expo-router` | file-based, deep links |
| Data | `@supabase/supabase-js` v2 + TanStack Query v5 | Realtime subscription for live tx inserts |
| Charts | `react-native-gifted-charts` (+ `react-native-svg`) | SVG → renders on Expo **web**, so dashboard is smoke-testable without a device |
| Storage | `expo-secure-store` | session + ingest token |
| Validation | `zod` | shared DTOs |
| Backend | **Supabase** — Postgres + Auth + RLS + Edge Functions (Deno/TS) | `supabase start` runs the full stack locally (Docker is available) |
| Monorepo | pnpm workspaces, vitest | |

**Why Expo over Flutter:** the parser must run in the app (offline preview), the backend (authoritative parse), and tests — one TypeScript codebase instead of a Dart port of the highest-risk logic. Both native pieces (Android listener, iOS share extension via `expo-share-extension`) are standard Expo config-plugin territory; no eject needed.

**Why Supabase over custom Node API:** multi-user auth (incl. **Sign in with Apple**, an App Store requirement if any social login is offered), RLS-based per-user isolation, and Deno/TS edge functions that import the same parser package.

## 4. Monorepo layout (to create)

```
bukit-pennies/
├── package.json  pnpm-workspace.yaml  tsconfig.base.json  .github/workflows/ci.yml
├── packages/
│   └── parsers/                  # @bukit/parsers — ZERO runtime deps, pure TS
│       ├── src/
│       │   ├── index.ts          # parseBankMessage(), detectBank(), types export
│       │   ├── types.ts  normalize.ts  dates.ts  confidence.ts
│       │   └── banks/ baiduri.ts  bibd.ts  scb.ts  generic.ts
│       └── test/
│           ├── golden/{baiduri,bibd,scb,generic,negative}/*.json   # {input, sender?, expected}
│           └── parsers.test.ts   # table-driven over golden dirs
├── apps/
│   └── mobile/                   # Expo app (see §7)
├── supabase/
│   ├── config.toml               # [functions.ingest] verify_jwt = false
│   ├── migrations/ 01_schema.sql  02_rls.sql  03_functions_views.sql
│   ├── seed.sql                  # demo user + ~60 tx across 3 months (dev only)
│   └── functions/
│       ├── ingest/index.ts       # thin Deno wrapper
│       └── _shared/ handler.ts (pure, unit-testable)  auth.ts  parsers/ (SYNCED COPY)
├── scripts/ sync-parsers.mjs  verify-ingest.sh
└── docs/ ios-shortcut-setup.md  android-capture.md  store-submission.md
```

**Parser-sharing rule:** the Supabase functions bundler can't reach outside `supabase/functions/`, so `scripts/sync-parsers.mjs` copies `packages/parsers/src` → `supabase/functions/_shared/parsers`. Parsers stay zero-dependency and use **explicit `.ts` import extensions** (Deno-compatible; vitest handles it with `allowImportingTsExtensions`). CI must check the copy isn't stale.

## 5. Data model (Postgres)

Enums: `bank_id ('baiduri','bibd','scb','unknown')`, `tx_source ('android_listener','ios_shortcut','share','paste','manual')`, `parse_status ('parsed','needs_review')`.

```sql
profiles        (id uuid PK → auth.users, display_name, default_currency 'BND', created_at)
                -- trigger on auth.users insert creates the profile (security definer)
categories      (id, user_id NULL = global default, name, color, unique nulls not distinct (user_id, name))
user_cards      (id, user_id, bank, card_last4 ~ '^\d{4}$', label, unique (user_id, bank, card_last4))
ingest_devices  (id, user_id, name, kind tx_source, token_hash sha256 UNIQUE,  -- plaintext bp_<base62> shown ONCE
                 created_at, last_seen_at, revoked_at)
transactions    (id, user_id, occurred_at timestamptz NULL, amount numeric(12,2), currency char(3) 'BND',
                 merchant, merchant_normalized,          -- upper + collapsed spaces; dashboard grouping key
                 bank, card_last4, category_id FK, notes, source, parse_status, confidence real,
                 raw_text NOT NULL, raw_hash NOT NULL,   -- sha256(user_id || ':' || normalized(raw_text))
                 possible_duplicate_of FK self, created_at, updated_at,
                 UNIQUE (user_id, raw_hash))             -- exact-dupe guard
-- indexes: (user_id, occurred_at desc), (user_id, parse_status), (user_id, merchant_normalized)
```

**Migration 02 — RLS:** enabled on all five tables; `auth.uid() = user_id` select/insert/update/delete quartet each (profiles keyed on `id = auth.uid()`; categories readable when own OR `user_id is null`).

**Migration 03:**
- RPC `create_ingest_token(name, kind)` — security definer; generates 32 random bytes → returns `bp_<base62>` **once**, stores only the sha256 in `token_hash`.
- Views (both `security_invoker = true`, parsed rows only, months bucketed in `Asia/Brunei` (+08:00, no DST)):
  - `monthly_totals(user_id, month, currency, total, tx_count)`
  - `merchant_totals(user_id, merchant_normalized, currency, total, tx_count, last_seen)`

## 6. Ingest pipeline

### API contract
`POST {SUPABASE_URL}/functions/v1/ingest` — `verify_jwt = false`; auth is our own static token because an iOS Shortcut / Kotlin background service can only attach a fixed header.

```
Headers:  Authorization: Bearer bp_<token>     Content-Type: application/json
Body: {
  "text": "...",                       // required, ≤ 4 KB
  "source": "ios_shortcut" | "android_listener" | "share" | "paste",
  "sender": "Baiduri",                 // optional: SMS sender ID or Android package name (bank hint)
  "received_at": "2026-07-10T17:38:02+08:00",   // optional; occurred_at fallback
  "client_txn_id": "uuid"              // optional idempotency key for Android queue retries
}
200 {"status":"created","transaction":{...}} | 200 {"status":"duplicate","transaction_id":"..."}
401 invalid_token | 422 empty_text | 429 rate-limited
```

### Handler flow (`_shared/handler.ts` — pure function, unit-testable)
1. Bearer token → sha256 → active `ingest_devices` row (service-role client) → `user_id`; fire-and-forget `last_seen_at`.
2. `normalize(text)` → `raw_hash`.
3. `parseBankMessage(text, {senderHint, receivedAt})`. Non-transactional messages (OTPs, balance alerts, promos) are rejected — never inserted.
4. Insert `on conflict (user_id, raw_hash) do nothing` → no row returned = `duplicate`.
5. **Near-dupe pass** (listener + share can double-capture with different wording): same user + amount + card_last4, `occurred_at` ±3 min, different hash → set `possible_duplicate_of`; surfaced in review inbox with merge/dismiss, not dropped.
6. `confidence < 0.75` or missing amount → `parse_status = 'needs_review'`.
7. Cheap rate limit: >60 req/min per token → 429 (tokens are long-lived secrets; bounds abuse on leak).

## 7. Parser package (`@bukit/parsers`)

```ts
parseBankMessage(text, opts?: {senderHint?, receivedAt?})
  → { tx: ParsedTransaction | null, isTransactional: boolean }

ParsedTransaction = { bank, amount, currency, merchant, occurredAt /* ISO +08:00 */,
                      cardLast4, confidence /* 0..1 */,
                      fields: Record<'amount'|'date'|'merchant'|'card', 'exact'|'heuristic'|'missing'> }
```

- `detectBank`: senderHint map (SMS sender IDs `Baiduri`/`BIBD`/`StanChart`; Android package names TBD on device) → per-bank body fingerprint regex → generic.
- Confidence weights: amount .40, merchant .25, date .20, card .15; `exact`=full, `heuristic`=half, `missing`=0. Bank-exact match ≈0.95+; **generic fallback caps at 0.70 → always needs_review**.
- **Non-transaction filter first** (OTP/promo/balance) with a `negative/` golden dir enforcing it.

### Baiduri regexes (designed from the real sample — label-anchored; merchant terminated by the next label so names with spaces/digits are safe)
```ts
const CARD   = /Card\s*No\.?\s*:\s*([0-9Xx*]+)/i;                        // "4x0213" → last4 via /(\d{4})$/
const AMOUNT = /Amount\s*:\s*([A-Z]{3})\s*([\d,]+(?:\.\d{1,2})?)/i;      // keep currency (BND/SGD/…)
const MERCH  = /Merchant\s*:\s*(.+?)\s*(?=Date\s*:)/is;                  // lazy up to "Date:"
const DATE   = /Date\s*:\s*(\d{1,2})-(\d{1,2})-(\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i;
// DD-MM-YYYY (10-07-2026 = 10 July) → `${yyyy}-${MM}-${dd}T${hh}:${mm}:${ss}+08:00`
const FINGERPRINT = /Card\s*No\.?\s*:.*Amount\s*:.*Merchant\s*:.*Date\s*:/is;   // bank detection
```
Amount: strip commas → number. `merchant_normalized`: uppercase + collapse whitespace (consider stripping trailing 2-letter country token as a heuristic).

**BIBD/SCB skeletons:** same structure, guessed patterns (e.g. `You have spent BND21.00 at MERCHANT on 10/07/26 using card ending 0213`), each marked `UNVERIFIED` with TODO + empty golden dir. **Generic fallback:** amount `/(BND|B\$|SGD|USD|MYR)\s*([\d,]+\.\d{2})/i`; multi-format date table (`dd-mm-yyyy`, `dd/mm/yy`, `d MMM yyyy`, ISO); merchant = text after ` at |Merchant:?|@ `, else longest ALL-CAPS run ≥3 chars.

## 8. Mobile app structure (`apps/mobile`, expo-router)

```
app/
├── _layout.tsx                # QueryClientProvider + Supabase session gate
├── (auth)/ sign-in.tsx sign-up.tsx
└── (tabs)/
    ├── index.tsx              # DASHBOARD: this-month total + vs-last-month cards,
    │                          #   daily-spend line chart, top-8-merchants bar chart
    ├── transactions/ index.tsx [id].tsx    # day-sectioned list + search / detail:
    │                                       #   editable NOTES, category, re-parse, delete
    ├── review.tsx             # needs_review + possible-duplicate inbox: fix inline →
    │                          #   confirm→parsed, merge dupes, discard
    ├── capture.tsx            # paste-to-parse: LIVE OFFLINE PREVIEW via @bukit/parsers
    │                          #   (same code as server) → POST /ingest (source=paste)
    └── settings/ index.tsx devices.tsx (tokens: create/reveal-once/revoke)
                 shortcut-setup.tsx  android-capture.tsx
```
- TanStack Query over supabase-js; optimistic notes/category mutations; **Supabase Realtime** subscription on `transactions` inserts → query invalidation (Shortcut-ingested spends appear live).
- `modules/notification-capture/` (local Expo Module) and `plugins/withNotificationListener.ts` live inside `apps/mobile`.

## 9. Native capture

### Android — `modules/notification-capture` (Kotlin, local Expo Module)
- `NotificationListenerService` filtered by package allowlist: SMS apps (`com.google.android.apps.messaging`, `com.samsung.android.messaging`) + bank apps (Baiduri b.Digital, BIBD NEXGEN, SC Mobile — **exact package names must be confirmed on a real device**; keep list remotely updatable via app config).
- Extracts `EXTRA_TITLE` + `EXTRA_TEXT`/`EXTRA_BIG_TEXT`; **POSTs directly from Kotlin (OkHttp)** with an offline queue + backoff + `client_txn_id` idempotent retries — capture works even when JS isn't running. Server does authoritative parse/filtering.
- JS API: `isPermissionGranted()`, `openListenerSettings()`, `setIngestConfig({url, token})`, `setPackageAllowlist([...])`, `getQueueStats()`.
- Config plugin injects the `BIND_NOTIFICATION_LISTENER_SERVICE` service into AndroidManifest — verifiable in-session via `expo prebuild --no-install` + grep.

### iOS — three paths
1. **Share Extension** (`expo-share-extension` config plugin): shared text → parse preview → POST /ingest; token shared via App Group keychain. *Excluded from free-signed sideload builds — first tested at the TestFlight stage (see §10).*
2. **Paste screen** (pure JS, works day one).
3. **Shortcuts automation** (documented + in-app guide): "When I get a message containing 'Merchant:' from [Baiduri]" → Get Contents of URL → POST /ingest with `Authorization: Bearer <token>`. Be honest in docs: may require a confirmation tap depending on iOS version/settings.

## 10. Phased delivery

| Phase | Scope | Verifiable in cloud session? |
|---|---|---|
| **0** | pnpm workspace, tsconfig, CI; `packages/parsers` complete with golden tests green | ✅ fully |
| **1** | Supabase migrations + seed + sync script + ingest function + handler unit tests; `supabase start`, `verify-ingest.sh` curl matrix | ✅ fully (Docker available) |
| **2** | Expo app: auth, dashboard charts, transactions/notes, review inbox, paste flow, settings/tokens | ✅ via `expo start --web` + seeded data |
| **3** | Kotlin listener module + config plugin, share extension, `eas.json`, EAS dev builds (Android APK first — sideloadable), **iOS unsigned IPA via GitHub Actions → Sideloadly** (see below), hosted Supabase deploy; collect real BIBD/SCB samples → promote skeleton parsers | ⚠️ code + prebuild checks here; behavior needs user's devices |
| **3.5** | **Store-blocking requirements** (added 2026-07-16, see §14): in-app account deletion, password reset, privacy policy + terms, real branding | ✅ mostly (branding needs user's name decision) |
| **4** | Store submission via `docs/store-submission.md` | ❌ user-executed |
| **4.5** | **Launch operations** (see §14): paid Supabase posture, crash/error reporting, TestFlight beta as the BIBD/SCB sample funnel | ⚠️ needs user accounts/spend |
| **5** | **Competitive product gaps** (see §14): manual entry, budgets, CSV export, recurring detection | ✅ fully |

### iOS device testing before the paid Apple Developer account (Sideloadly)

**Decision (confirmed 2026-07-16):** the paid Apple Developer account ($99/yr) will only be purchased once the app is ready for production. Until then, iOS device testing uses **Sideloadly** (runs on the user's Windows machine) with a **free Apple ID**.

- **Building the IPA:** EAS cannot produce iOS device builds without a paid account, so use a **GitHub Actions macOS runner**: `expo prebuild` → `xcodebuild archive` with `CODE_SIGNING_ALLOWED=NO` → zip the `.app` into `Payload/` → unsigned `.ipa` artifact. Sideloadly re-signs it with the free Apple ID and installs over USB. Add this as a workflow (e.g. `.github/workflows/ios-unsigned-ipa.yml`) in Phase 3, plus a `docs/ios-sideloadly.md` walkthrough.
- **Free-signing limits to design around:** certificates expire every **7 days** (re-sideload weekly), max 3 sideloaded apps per device, 10 App IDs per 7 days.
- **Auth during this phase:** the **Sign in with Apple entitlement is not available** with free signing → the app must work with **Supabase email/password auth alone**; add Sign in with Apple at the TestFlight/production stage (it is only an App Store requirement if social login is offered).
- **Share Extension deferred to TestFlight:** extensions add App ID/signing friction under free signing, so sideload builds ship **without** the share extension. iOS capture during this phase = **paste screen + Shortcuts automation** (the Shortcut POSTs straight to the ingest API and doesn't depend on app signing at all). First real share-extension test happens once the paid account + TestFlight exist.

Commit per phase; each phase on a feature branch off `main`, merged via pull request.

### Phase 4 checklist highlights
- **Apple:** dev account ($99/yr), App IDs for app + share extension, **Sign in with Apple** (required if social login offered), privacy nutrition labels ("data linked to you: financial info — user-initiated text only"), review notes explaining there is NO bank connectivity, TestFlight first.
- **Google:** Play Console ($25), data-safety form, **NotificationListener prominent-disclosure + policy declaration**, closed-testing track first (new personal accounts: 12 testers/14 days requirement), then production.

## 11. Verification plan (for the implementation session)

1. `pnpm -r test` — parser golden tests (every future real bank sample becomes a fixture) + ingest handler tests; `pnpm -r typecheck`.
2. `supabase start && supabase functions serve ingest` → `scripts/verify-ingest.sh`: create user + token via SQL; curl the Baiduri sample → `created`; re-curl → `duplicate`; garbage text → needs_review row; bad token → 401.
3. psql-assert the parsed row: amount `21.00`, merchant `GALORIES SMOOTHIES BSB BN`, occurred_at `2026-07-10 17:37:59+08`, bank `baiduri`, status `parsed`.
4. RLS proof: as user B, select user A's transactions → 0 rows.
5. `expo start --web` + seeded user → visually check dashboard, list, review inbox; paste the Baiduri sample end-to-end through the real local ingest function.
6. `expo prebuild --no-install` → grep generated AndroidManifest for the listener service.

## 12. Open items / info needed from the user

- **Real BIBD and Standard Chartered notification samples** (redacted is fine) — needed to promote skeleton parsers. The review inbox is the in-product collection mechanism.
- Exact **Android package names** of the three bank apps (confirmed from a real device in Phase 3).
- **Supabase project** (hosted) credentials when moving past local dev; **Apple/Google developer accounts** for Phase 4 (Apple account deliberately deferred until production-ready — iOS testing runs on Sideloadly + free Apple ID, see §10).
- Product naming/branding ("Bukit Pennies" is the working name from the repo).

## 13. Environment notes for the next session

- Node v22, pnpm 10, Docker available (→ `supabase start` works). No iOS simulator; no `gh` CLI (use GitHub MCP tools).
- Outbound HTTPS goes through a pre-configured proxy — do not disable TLS verification.
- Develop on short-lived feature branches off `main`; push with `git push -u origin <branch>` and open a pull request.
- **Every new session should use GitHub Flow** (branch off `main`, commit, push, open a pull request for changes).
- PR workflow permissions are configured in `.claude/settings.json` (committed): allow rules for `gh pr create` and `gh pr merge`, so the GitHub Flow steps run without per-action permission prompts.
- **Every new session should use `/remote-control`.**

## 14. Launch-readiness roadmap (added 2026-07-16, after Phases 0–3 shipped)

Assessment: the original phases end at "functional on iOS for testing + store
submission mechanics" — a public launch additionally needs the following. Every
existing invariant holds (notification-text only, RLS, golden-fixture parser
discipline, GitHub Flow, stop-per-phase cadence).

**Competitive positioning (why this app, recorded for the store listing):**
mainstream trackers (Monarch, YNAB, Copilot, Buxfer…) rely on bank-aggregation
APIs that do not cover Brunei; the local banks' own apps (Baiduri b.Digital,
BIBD Mobile) show single-bank history with no cross-bank spending analytics.
Notification-text parsing is the wedge (the approach Walnut/Axio proved in
India), and no-bank-connection is both the trust story and the store-review
story. BIBD is Brunei's largest bank — its parser must be promoted from
skeleton before the app serves the majority of the market.

### Phase 3.5 — store-blocking requirements (Apple/Google reject without these)
1. **In-app account deletion** (Apple guideline 5.1.1(v)): settings screen +
   `security definer` RPC in a new migration; deleting the auth user cascades
   through existing FKs. Verify with a psql assertion that zero rows remain.
2. **Password reset**: `supabase.auth.resetPasswordForEmail` + deep link (the
   `bukitpennies://` scheme already in `app.json`) + update-password screen in
   `(auth)/`.
3. **Privacy policy + terms**: `docs/privacy-policy.md` + `docs/terms.md`
   (content mirrors `docs/user-guide.md` §7), hosted at a public URL (GitHub
   Pages), linked from sign-up and Settings.
4. **Real branding**: replace create-expo-app template icons/splash in
   `apps/mobile/assets/`; needs the product-name decision (§12).

### Phase 4.5 — launch operations
5. **Production Supabase posture**: paid tier (free tier pauses after ~1 week
   of inactivity — fatal for a Shortcut posting SMS), point-in-time backups,
   real email provider, signup abuse protection/rate limits.
6. **Crash/error reporting**: `sentry-expo` in the app + log drain for the
   ingest function; production parse failures must be visible.
7. **TestFlight beta** (needs the paid Apple account): doubles as the BIBD/SCB
   sample-collection funnel; promote skeleton parsers per playbook §7 as real
   samples arrive.

### Phase 5 — competitive product gaps (fast follows, not launch blockers)
8. **Manual transaction entry** (schema already supports `source='manual'`).
9. **Budgets**: per-category monthly limits (new `budgets` table + RLS quartet;
   reuse `monthly_totals` bucketing) + dashboard progress.
10. **CSV export** (expo-sharing) — data portability matches the trust promise.
11. **Recurring-spend detection** (client-side same-merchant/amount monthly
    heuristic first).

Out of scope, unchanged: bank aggregation (violates the safety invariant),
Sign in with Apple (only required if social login is offered), Android
listener timing (deferred post-iOS-testing).

## 15. Field-testing addendum (2026-07-17, real-device testing with the owner)

**Design north star (recorded from the user):** personal finance should feel
**visual, modular, and approachable** — a dashboard you shape around how you
think about your money, not a spreadsheet or rigid budgeting tool. Apply this
lens to all future UI work.

State reached during on-device testing:

- **BIBD parser is verified** (first real SMS collected; golden fixtures in
  `packages/parsers/test/golden/bibd/`). Format quirks: no timestamp (falls
  back to receive time, heuristic) and truncated merchant names. SCB remains
  a skeleton.
- **Capture strategy: per-card iOS automations.** One Message automation per
  card, filtering on the card string (Baiduri `Card No.: 4x0213`, BIBD
  `card ending with 0298`); Sender must stay empty because alphanumeric
  sender IDs can't be picked in iOS. Templates are copy-tappable in-app.
- **Shortcut distribution:** `shortcuts sign` requires an iCloud login on all
  GitHub macOS runners, so CI cannot sign shortcut files. Distribution is a
  once-shared **iCloud link** from the owner's iPhone, wired into
  `SHORTCUT_DOWNLOAD_URL` (`apps/mobile/src/lib/env.ts`) —
  `https://www.icloud.com/shortcuts/20c719e5009d4cb0baaf4306d6e739c2`
  (self-configuring rebuild, shared 2026-07-19).
  `scripts/build-shortcut.mjs` + the `ios-shortcut.yml` workflow remain for
  reference/if Apple ever unblocks CI signing.
- **Self-configuring shortcut (2026-07-19):** the shortcut was redesigned to
  store its own token (`Bukit Pennies/token.txt` in iCloud Drive) instead of
  a hardcoded `PASTE-YOUR-TOKEN-HERE` edit. The app hands the token over via
  a `shortcuts://run-shortcut` deep link ("Send the token to the Shortcut",
  Step 3 of the setup screen); fallback: the shortcut asks for the token on
  first run. The "Logged … at …" notification is now baked in. Setup is 4
  steps / ~3 min; the only remaining manual work is the Message automation
  (iOS automations are unshareable). Owner rebuild recipe:
  `docs/shortcut-authoring.md`. Rebuilt and re-shared by the owner
  2026-07-19; the live link above points at the self-configuring version.
- **Theming:** full light/dark theme system (`src/lib/theme.tsx`; palettes +
  `themedStyles` hook + persisted System/Light/Dark toggle in Settings). The
  static `colors` export from `components/ui.tsx` is gone — never reintroduce
  module-level color constants.
- **App niceties shipped:** pull-to-refresh on all data screens; All/Bank/Card
  filter chips on Transactions; one-tap token copy; shortcut guide includes a
  confirmation-notification recipe.
- **Foreign-currency decision:** store and display original currency (views
  already group by currency); **no automatic FX conversion** — the SMS amount
  is merchant-currency and the true BND charge (rate+fees) isn't knowable from
  the message. A clearly-labeled "≈ BND" estimate is acceptable future work.
- **Ops notes:** hosted project `pzjroqwllrzcbpiugpxl`; email confirmation
  disabled for testing (re-enable with real SMTP pre-launch); unsigned-IPA
  workflow needs `SENTRY_DISABLE_AUTO_UPLOAD=true` (no Sentry token in CI);
  IPA sideloaded via Sideloadly, 7-day free-ID expiry.

## 16. Current app state + mass-adoption roadmap (added 2026-07-19)

### 16.1 What the app is now (Phases 0–6 + post-phase work, all merged or on `ui-filters-donut-polish`)

Beyond the original §8 design, the shipped app includes:

- **Tabs:** Dashboard (interactive income **donut as the hero**, dynamic font
  fit, wheel picker), Transactions (day-sectioned list, per-filter sheets:
  Direction/Currency/Date-range calendar/Recipient/Bank/Category/Card,
  swipeable filter bar), **Goals** (savings goals: create/add/delete), Capture
  (paste + bulk paste), Settings. Review inbox is reachable but hidden from
  the tab bar.
- **Settings restructure:** index → account, appearance (System/Light/Dark),
  budget + budgets (accordion, 20 swatches, per-category colors, RESET-BUDGET
  confirmation), spending, weekly-summary (day/time picker), capture,
  devices (tokens), shortcut-setup, guide, about, delete-account.
- **Brunei essentials (PR #31):** SGD accepted at par with BND; bill
  reminders; weekly digest; overspend alerts (local notifications,
  `src/lib/notifications.ts`); cash quick-add; amount cloaking (privacy mode,
  `src/lib/privacy.tsx`).
- **Money formatting:** `formatMoney` with thousand-separator commas
  everywhere (`src/lib/format.ts`).
- **Reusable UI:** `WheelPicker`, `PickerSheet`, calendar range sheet in
  `src/components/ui.tsx`; full theme system per §15.
- **Parsers:** Baiduri verified + **BIBD verified** (golden fixtures from real
  SMS); SCB still a skeleton. Recurring detection, CSV export, manual entry
  shipped in Phase 5.
- **Capture:** per-card iOS Shortcuts automations (§15); shortcut distributed
  via the owner's iCloud link (`SHORTCUT_DOWNLOAD_URL` — live);
  Android listener module still deferred.

### 16.2 Market review (2026-07-19)

Feature parity with Money Lover / Spendee / PocketGuard is already largely
reached (budgets, goals, recurring, export, dark mode, privacy). The
aggregation moat behind Mint/Monarch/Copilot does not exist in Brunei (no
Plaid/open banking), so notification-text parsing is the only viable
automatic capture — the wedge stands. Remaining gaps vs. leaders are not
features but **distribution, capture friction, and insights depth**:
no store presence, multi-step iOS Shortcut onboarding, no month-over-month
trend/insight screens, no widgets, no shared/household budgets.

### 16.3 Decisions recorded (from the owner, 2026-07-19)

- **Distribution: both stores** (Play US$25 + Apple US$99), **iOS first**
  (updated 2026-07-19 — owner has an iPhone for testing). **Android is
  gated:** it starts only after the iOS app is completed — tested, ready,
  and live on the App Store. No Android work before that gate.
- **Bank priority: BIBD** — parser verified; hosted deploy of it is the
  top item.
- **Localization: English-only UI is fine.** Skip Bahasa Melayu for now.
- **Differentiator: local merchant intelligence** — curated Brunei
  merchant → category mapping applied at parse time so transactions arrive
  pre-categorized (Supa Save, Hua Ho, petrol, kopitiams, delivery…). Every
  golden fixture doubles as mapping data.
- **Business model: free, personal project.** No freemium plumbing; watch
  Supabase free-tier limits as users grow.

### 16.4 Adoption roadmap (sequenced)

**Stage A — iOS to App Store (everything here precedes any Android work):**

1. ✅ **BIBD hosted go-live** *(merged 2026-07-19, PR #35)* — ingest
   function deployed to hosted Supabase; BIBD and Baiduri parsers both
   live; end-to-end smoke tested with a real token.
2. ✅ **Merchant → category mapping at parse time** *(merged 2026-07-19,
   PR #35)* — zero-dep `merchants.ts` module in `@bukit/parsers`; ~50
   curated Brunei rules (Supa Save, Hua Ho, KFC, Shell, DST, Guardian,
   Shopee…); category resolved at ingest and stamped on `category_id`.
   Seed list in `packages/parsers/src/merchants.ts` — review and extend
   as real transactions arrive.
3. ✅ **Onboarding overhaul** *(merged 2026-07-19, PR #36)* — two-step
   first-run flow: (a) paste-your-SMS hero (instant offline parse preview,
   saves as first transaction, skippable); (b) iOS Shortcut nudge with
   estimated setup time (~5 min) and direct link to the setup guide.
   Shown once per user (device flag); returning users bypass it.
   Social login deliberately deferred to the Apple Developer account step.
4. ✅ **Monthly insights screen** *(merged 2026-07-19, PR #37)* — new
   Insights tab (trending-up icon) with: headline month-over-month tiles
   (this month / last month / % change), stacked category bar chart over
   6 months, per-category deltas vs last month, merchant movers (top 8
   shifts vs last month).
5. **Apple Developer account → TestFlight → App Store launch** *(pending
   owner action: enrolment)* — enrol at developer.apple.com (US$99/yr,
   owner's Apple ID, ~1–2 days approval). **Everything else is prepped
   (2026-07-19):** `apps/mobile/eas.json` has the production profile
   (hosted Supabase env baked in; three `FILL-ME` placeholders — anon
   key, Apple Team ID, ASC App ID) and **`docs/testflight-deploy.md` is
   the step-by-step runbook** (build → TestFlight → on-device test
   checklist → App Store review notes → share extension later).
   Shortcut download link live (self-configuring rebuild):
   `https://www.icloud.com/shortcuts/20c719e5009d4cb0baaf4306d6e739c2`.

   **iOS build facts (recorded 2026-07-19):** IPAs cannot be built on
   Windows (Xcode/macOS only). Path of record is **EAS cloud builds**
   (run from Windows, built on Expo's Macs, free ~30 builds/mo; device
   builds require the paid Apple account for signing).
   `ios-unsigned-ipa.yml` (GitHub macOS runner → Sideloadly) is the
   obsolete pre-enrolment stopgap — macOS runners bill at 10× minutes,
   ~300 min per build, so avoid it once enrolled.

**Stage B — Android (starts only once Stage A ships on the App Store):**

6. **Play Store + Android capture phase** — the deferred Kotlin
   `NotificationListenerService` module (§9), Play Console closed testing
   (12 testers/14 days), prominent-disclosure declaration.

Deliberately deferred: shared/household budgets, investment tracking,
widgets, freemium.

## 17. UI polish session (2026-07-20)

All changes on branch `shortcut-self-config`, merged to `main`.

### Primary currency system
- New `apps/mobile/src/lib/primaryCurrency.tsx` — `PrimaryCurrencyProvider` / `usePrimaryCurrency()` / `CURRENCY_OPTIONS` (BND, SGD, USD, MYR, GBP, EUR, AUD). Persisted via `kvStore` (`bukit.primary_currency`); defaults to BND. Wrapped at root in `app/_layout.tsx`.
- `PAR_CURRENCIES` in `queries.ts` expanded from `['BND','SGD']` to all seven option codes so non-BND transactions are fetched.
- **Dashboard** (`app/(tabs)/index.tsx`): all money values (donut center, legend, stat strip, budgets card, daily chart, month-history bars, top-merchants bar) now use `primaryCurrency`. Memos `dailyData`, `budgetProgress`, `monthlyBars` filter to primary currency. `useTopMerchants` accepts a `currency` param and passes an `.eq('currency',…)` filter. `effectiveIncome` is null for non-BND (income comparison only makes sense in BND). An excluded-currencies note appears below the donut when transactions in other currencies exist, linking to Settings > Appearance.
- **Insights** (`app/(tabs)/insights.tsx`): `recentTx` filtered to `primaryCurrency` before building all insight memos; all `money()` calls pass `primaryCurrency`.
- **Settings > Appearance** (`settings/appearance.tsx`): second Card "Primary currency" with `Chip` rows for each `CURRENCY_OPTIONS` entry; selection persisted immediately.

### Goals currency
- Migration `09_goal_currency.sql`: adds `currency text not null default 'BND'` to `savings_goals`.
- `SavingsGoalRow` type updated; `useCreateSavingsGoal` mutation accepts and stores `currency`.
- Goals page captures `primaryCurrency` at create time; `GoalCard` uses `goal.currency` for all `money()` calls — a goal's currency is fixed at creation and never changes. Note in the create form explains this and points to Settings > Appearance.

### Budgets currency (Option A — fixed at creation)
- `budgets` table already had a `currency char(3)` column (migration 06); `BudgetRow` type already included it.
- `useUpsertBudget` now accepts and passes `currency`; existing budget currency is preserved on edit.
- Budgets settings page passes `primaryCurrency` for new budgets; a note explains the fixed-currency behaviour and points to Settings > Appearance.
- Dashboard `budgetProgress` memo filters to budgets matching `primaryCurrency`; a tappable note appears when budgets in other currencies are hidden.
- Monthly limit amount label changed from "Amount (BND)" to "Amount ($)" in `settings/budget.tsx`.

### Settings restructure
- "Delete account" row removed from Settings index; moved inside the Account page as a "Danger zone" card with a warning and a button navigating to the existing `delete-account` screen.

### Calendar date-range fix
- Month/year nav bar restructured: inner month arrows + title wrapped in a `flex:1` center group (`calNavCenter`) so the title stays horizontally fixed regardless of month-name length. Year `«`/`»` buttons get a fixed `width:36` on each side (`calNavYearBtn`).

**Email capture (gated candidate, noted 2026-07-20):** strongest candidate
for the next capture channel, potentially replacing the Stage B Kotlin
listener. Design sketch: unique inbound address per user (token in the
address is the auth, e.g. `u-<token>@in.<domain>`); users point their
bank's e-alerts at it, or set a one-time Gmail/Outlook auto-forward rule.
Inbound provider (Cloudflare Email Routing or Postmark inbound parse, both
free tier) POSTs the message to the existing ingest edge function as a new
`email` source. Parser needs an HTML-to-text pass plus golden fixtures
from real bank emails (same collection process as SMS). Why attractive:
universal across countries and platforms; works on Android with zero
on-device setup and no notification-listener permission. Risks to design
around: sender spoofing (check the provider's SPF/DKIM verdict on the
bank's domain; needs_review flow catches garbage) and HTML soup.
**Gate: confirm Baiduri/BIBD actually send per-transaction email alerts**
(owner to check e-banking settings; unverified as of 2026-07-20). If
neither bank does, the idea is dead for Brunei regardless of elegance.
Not a blocker for the iOS launch.

**Post-launch watch (noted 2026-07-19, owner asked to be reminded):** the
onboarding funnel is measurable from the database alone, no analytics
tooling: accounts created (auth.users) vs capture tokens created
(ingest_devices, kind ios_shortcut) vs tokens actually used
(last_seen_at not null). The gaps between those three counts show exactly
where users drop off (signup → setup started → capture working). Check
after the first dozen real users; if drop-off clusters at the automation
step, that is the trigger to add screenshots to the visual guide or
consider the step-per-screen wizard (deliberately not built preemptively).

### 16.5 Supabase free-tier limits & upgrade triggers (checked 2026-07-19)

Free tier: 500 MB database · 50,000 MAU · 500K edge-function
invocations/month · **5 GB egress/month** · pauses after 1 week with no
API activity · **no automated backups**.

Mapped to this app (~1 KB/transaction, ~150 ingest calls/user/month,
~30–50 MB egress per daily user/month):

- Database and MAU: no realistic ceiling.
- Edge invocations: ~3,000 active users.
- **Egress is the first ceiling: roughly 100–300 regular users.**

**Upgrade to Pro (US$25/mo) when either:** (a) Settings → Usage shows
egress past ~80% two months running, or (b) real strangers depend on the
app — Pro adds daily backups; free tier has none, and losing users'
financial history is the bigger risk than any quota.

Funding stance (owner): free app, no personal money sunk beyond
Apple's US$99/yr until genuinely popular; at Pro-tier scale, optional
support only (GitHub Sponsors / Ko-fi, "server costs ~$25/mo" framing) —
never monetization. Cheap deferrals if needed before upgrading: reduce
the 500-row transaction fetch, trim dashboard query columns.

**GitHub note (2026-07-19):** repo is **private** (policy pages moved to
the public `bukit-pennies-legal` repo). Private-repo Actions draws from
the account's 2,000 free min/mo, shared with the owner's other projects —
exhausted for July, so **CI is verified locally (tests + typecheck +
sync-parsers --check) before every merge until the monthly reset**.
Billed amount stays $0 with the $0 budget (GitHub blocks instead of
charging). The launched app never depends on GitHub Actions.
