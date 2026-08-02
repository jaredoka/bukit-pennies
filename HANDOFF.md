# Bukit Pennies — Project Handoff Document

> ## How to read this file
>
> It holds two kinds of writing, and they have opposite rules. Mixing them up
> is how a reader ends up confidently wrong — it has already happened once,
> when §7's "BIBD is an UNVERIFIED skeleton" was believed months after §16
> recorded BIBD as verified.
>
> **§1–§13 — CURRENT DESIGN. Living. Must match the code.**
> Edit these whenever the design changes. A statement here that the code
> contradicts is a bug in this file, not history. Last reconciled 2026-08-01.
>
> **§14 onward — SESSION HISTORY. Frozen. Dated. Never edited.**
> Each section records what was found and decided on one day, and is left
> exactly as written — that is what makes it trustworthy *as history*. Some of
> it has since been reversed. **Do not treat a §14+ statement as current
> truth**; check the code, or `docs/execution-playbook.md` §5–§6, which carries
> the invariants and the decision log.
>
> New work appends a new dated section at the bottom, and updates §1–§13 if the
> design actually changed.

**Status:** Phases 0–6 built and merged; app is live against hosted Supabase and field-tested on the owner's iPhone.

**Branch:** `main` (GitHub Flow — feature branches off `main`, merged via pull request)
**Date:** 2026-07-16 (original) · last updated 2026-07-25

**§18 is a security audit (2026-07-25)** — five issues found, all fixed and
deployed (migrations 11 and 12 applied to the hosted project, ingest function
redeployed). SEC-2 took two attempts: in-memory rate limiting is inert on
Supabase Edge Functions because every request gets a fresh isolate, so the
limits now live in Postgres and are verified working against production.

**§19 (2026-07-25):** the repo is **public, permanently** — never commit a
secret. The `bukit-pennies-legal` repo is retired; policy pages are now served
by GitHub Pages from this repo's `docs/` folder. Also records why native
dependencies force a fresh store build.

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
-- user_cards was here (card labels: "•0213" → "Baiduri Visa"). Never read or
-- written by the app; dropped in migration 22 (2026-08-01). If card labels are
-- built, it returns alongside the screen that reads it.
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
  - ~~`merchant_totals`~~ — fed the dashboard's Top merchants card, which was
    removed 2026-07-30; Insights computes merchant totals from rows it has
    already fetched. View dropped in migration 22 (2026-08-01).

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
7. Rate limit: >60 req/min per token, and >20 failed auths/min per client IP,
   → 429. **Enforced in Postgres**, not in the edge function: the original
   in-memory limiter never worked, because Supabase Edge Functions run every
   request in a fresh isolate. See §18 SEC-2; migration 12 holds the
   implementation.

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

**BIBD — verified** (real SMS collected 2026-07-17; golden fixtures in `test/golden/bibd/`). Label-anchored like Baiduri, no confidence cap, scores ~0.90 on a real message (its date is heuristic because BIBD messages carry no timestamp — `occurredAt` comes from `received_at`). **SCB — still an UNVERIFIED skeleton:** guessed patterns, delegates to the generic parser, clamped to `UNVERIFIED_CONFIDENCE_CAP` so every SCB message lands in review until a real sample arrives (§7 promotion procedure in `docs/execution-playbook.md`). **Generic fallback:** amount `/(BND|B\$|SGD|USD|MYR)\s*([\d,]+\.\d{2})/i`; multi-format date table (`dd-mm-yyyy`, `dd/mm/yy`, `d MMM yyyy`, ISO); merchant = text after ` at |Merchant:?|@ `, else longest ALL-CAPS run ≥3 chars.

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
  `https://www.icloud.com/shortcuts/92fe37ee63e04a4785d69517f0c1635e`
  (self-configuring rebuild, shared 2026-07-19).
  **Superseded 2026-07-31 — see §37 for the current link and name.**
  `scripts/build-shortcut.mjs` + the `ios-shortcut.yml` workflow remained for
  reference/if Apple ever unblocks CI signing — **both deleted 2026-07-31,
  see §37.**
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
- **Transactional email (future):** current SMTP is Gmail (`bukitpennies@gmail.com`)
  which has poor deliverability — reset emails land in spam. Before public
  launch, migrate to **Resend** (resend.com, free tier 3 000 emails/month) and
  register a custom domain (e.g. `bukitpennies.com`, ~$12/yr). Send from
  `noreply@bukitpennies.com` with Resend's verified domain. The domain also
  serves as the app's public website and App Store support URL. Until then, the
  forgot-password screen shows a note to check spam.

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
   Shortcut download link live (self-configuring rebuild, relinked
   2026-07-31 — §37):
   `https://www.icloud.com/shortcuts/e639f5c27dd34f1191a81eeaa80ea27e`.

   **iOS build facts (recorded 2026-07-19):** IPAs cannot be built on
   Windows (Xcode/macOS only). Path of record is **EAS cloud builds**
   (run from Windows, built on Expo's Macs, free ~30 builds/mo; device
   builds require the paid Apple account for signing).
   `ios-unsigned-ipa.yml` (GitHub macOS runner → Sideloadly) was written
   off here as an expensive stopgap — macOS runners bill at 10× minutes,
   ~300 min per build. **That reasoning assumed a private repo and no
   longer holds** (§19: the repo is public, and standard GitHub-hosted
   runners are free for public repos). A full unsigned-IPA build ran
   successfully on 2026-07-25 with July's minute allowance already spent,
   which is the practical confirmation. Caveat: this was not verified
   against the billing API — reading it needs an interactive `gh auth
   refresh -s user` — so treat it as strong evidence rather than a
   settled fact, and glance at the billing page before relying on it for
   anything expensive.

   So the workflow is a genuinely useful pre-enrolment path, not a
   grudging one. EAS remains the path of record **after** enrolment,
   because only it produces signed builds that TestFlight accepts;
   unsigned IPAs still carry the 7-day free-signing expiry.

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

**Monetization (noted 2026-07-20, owner decision: free until real traction):**
App remains free. No subscriptions, no ads, no paid tiers for now. The "Buy
me a coffee" page has been removed from Settings. When the app has real users
and traction, the owner is open to a tip jar and eventually a Pro tier.

Tip jar constraint: Ko-fi, Buy Me a Coffee, and PayPal are all restricted in
Brunei. The most viable approach is a **QR code bank transfer** page (Baiduri
or BIBD QR displayed in-app, users scan with their banking app — zero fees,
Brunei-native). For international tips, Wise (TransferWise) supports Brunei.
Build the tip jar page when ready, re-add it to Settings as "Support the app"
or similar, and register `support` or `tip-jar` in the settings stack layout.

Longer-term monetization (gated on 500+ active users): free tier stays
generous (unlimited capture, dashboard, budgets). Pro tier ($2-3/mo or
~$25/yr) could include CSV export, 12+ month trend analytics, multi-currency
dashboards, custom categories. Owner is also open to acquisition by a bank or
government entity.

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

**Known design edge case — two accounts, one phone (2026-07-20, owner decision: leave unsupported):**
The iOS Shortcut stores a single ingest token. If a user creates two Bukit
Pennies accounts and sets up two Message automations on the same device (one
per card), both automations run the same shortcut with the same token, so
both card transactions are logged to the account that token belongs to. The
second account receives nothing. Workaround requires the user to maintain two
separately-named shortcuts, each holding a different token — not a supported
flow. The shortcut setup guide makes no mention of multi-account use.
Transaction logging is independent of app login state: the shortcut runs as
an iOS background automation and POSTs directly to the edge function; the
user does not need the app open or any account signed in for capture to work.

**GitHub note (2026-07-19, superseded 2026-07-25):** this recorded that the
repo was **private**, that private-repo Actions drew from the account's 2,000
free min/mo shared with the owner's other projects, that July's allowance was
exhausted, and that **CI was therefore verified locally** (tests + typecheck +
sync-parsers --check) before every merge.

**All of that is obsolete: the repo is public (§19)**, and standard
GitHub-hosted runners are free for public repositories. A macOS unsigned-IPA
build ran to completion on 2026-07-25 despite July's allowance being spent,
which is the practical confirmation — though the billing API itself was not
readable from the CLI session (needs an interactive `gh auth refresh -s user`),
so confirm on the billing page before leaning on it heavily.

Consequences: CI can run in Actions again rather than only locally, and the
`ios-unsigned-ipa.yml` cost objection in §16.4 is void. Local verification
(`pnpm -r test`, `pnpm -r typecheck`, `sync-parsers --check`) remains a good
habit before pushing, but is no longer the *only* gate. Billed amount stays $0
with the $0 budget in place (GitHub blocks rather than charges). The launched
app never depends on GitHub Actions.

## 18. Security audit (2026-07-25)

Full review of the security-relevant surfaces: RLS migrations, the ingest
edge function, auth flows, client token storage, and deep-link handling.
Five issues found; all fixed on branch `security-audit-fixes`. IDs below are
referenced from the code comments at each fix site.

**Reviewed and found sound** (recorded so a future session doesn't re-audit):
RLS coverage on every table (the select/insert/update/delete quartets are
correct and owner-scoped, both dashboard views are `security_invoker`); the
three `security definer` functions (`handle_new_user`, `create_ingest_token`,
`delete_account` — each pins `search_path` and null-checks `auth.uid()`);
PKCE on the password-reset deep link (an app squatting the `bukitpennies://`
scheme cannot exchange an intercepted code without the local verifier); the
anon key committed in `eas.json` (public by design, RLS is the boundary); and
the parser regexes (no catastrophic backtracking — input is capped at 4 KB
and the lazy quantifiers are disambiguated by required separators).

### SEC-1 — Ingest token survived sign-out, filing transactions under the previous account (High)

`tokenStore.ts` kept the ingest token under one device-global key,
`bukit.ingest_token`, and no sign-out path cleared it — `clearStoredToken`
was called only from account deletion. So after user A signed out and user B
signed in on the same device, `ensureIngestToken()` returned **A's** token,
and the edge function resolves `user_id` from the token: every paste capture,
bulk paste, and cash quick-add B made was written into A's account. B saw
nothing appear and could not diagnose it — `useDevices()` is RLS-scoped, so
the offending device was invisible to B. SecureStore values live in the iOS
Keychain and survive app deletion, so the mismatch persisted across reinstall.

Distinct from the "two accounts, one phone" note in §17: that one is about the
*Shortcut* holding a single token and is a documented unsupported flow. This
was the app itself misrouting, silently, with no user action.

**Fix:** the token key is now scoped per user id
(`bukit.ingest_token.<uid>`), so a token belongs to exactly one account and
can never carry another account's captures. `ensureIngestToken` resolves the
signed-in user first and throws if there is none. A token found under the old
device-global key is adopted into the current user's scoped key on first read
and the legacy key deleted — safe, because the upgrading user is the only
account that has ever used that install's token.

Scoping was chosen over clearing-on-sign-out deliberately: it fixes the leak
*and* lets two accounts share a device without either re-running the ~3-minute
Shortcut setup, and it avoids minting a throwaway `ingest_devices` row on
every sign-out/in cycle.

### SEC-2 — Rate limiting does not work at all on this runtime (Medium, FIXED 2026-07-25)

> **History.** The first fix was deployed and found ineffective in production,
> along with the pre-existing limiter it extended. The second attempt moved the
> limits into Postgres and **is verified working against production** — see
> "The real fix" at the end of this subsection. The analysis below is retained
> because the reasoning about *what* to limit still holds; only the mechanism
> changed.

#### Original finding — per-token rate limit could not bound an anonymous flood

`handleIngest` keyed its limiter on the token hash *before* validating the
token, commented "so invalid-token floods are bounded too". It did not: every
invented token is a fresh key, hence a fresh 60/min quota and a database round
trip each. `/ingest` runs with `verify_jwt = false`, so this was reachable
unauthenticated — and §16.5 identifies egress as this project's first free-tier
ceiling. Separately, `createSlidingWindowLimiter` pruned timestamps within a
key but never removed keys, so attacker-chosen keys grew the map for the life
of the edge instance.

**Fix:** added a per-peer (client IP, from the first `x-forwarded-for` hop)
budget of **20 failed auths/minute**, checked before the token lookup — a peer
that has spent its budget gets 429 without the database being touched. It is
keyed on *failures*, not on all requests, on purpose: Brunei mobile networks
NAT heavily, so a blanket per-IP request cap would throttle unrelated real
users, whereas a device with a valid token never records a failure. The peer
limit is skipped entirely when no client IP is available, rather than lumping
unknown-IP traffic into one shared bucket. Both limiters now share a window
store with an amortised sweep (every 1,000 ops) that drops fully-expired keys.
Three tests cover it, including an assertion that no store lookup happens once
a peer is cut off.

#### What actually happens (verified against production, 2026-07-25)

The fix was deployed and then smoke-tested: **70 consecutive requests with
invented tokens from one IP all returned 401. Not one 429.** Diagnosis, in
order:

1. The client IP is available — Supabase forwards both `x-forwarded-for`
   (`<client>,<client>, <proxy>`) and `cf-connecting-ip`. `peerKeyOf` parses
   the first hop correctly, so that is not the cause.
2. A throwaway function with a module-level counter and a per-boot id was
   deployed to test the real assumption. **Twelve consecutive requests each
   returned a different boot id and `counter: 1`.**

**Every request runs in a fresh isolate.** Module-level state on Supabase Edge
Functions does not survive between requests, so *any* in-memory limiter is a
no-op — mine and, importantly, the pre-existing one too.

**This means HANDOFF §6 step 7 ("Cheap rate limit: >60 req/min per token →
429") has never been true in production.** It was written as a design
intention, the unit tests pass because they drive the limiter directly, and
nothing ever verified it end-to-end. The in-memory code is harmless but
inert; it should not be trusted or cited as a control.

This matters more now than it did: per §19 the repo is public, so the ingest
URL is discoverable, and the endpoint is `verify_jwt = false`. Each anonymous
request costs an isolate spin-up plus one `ingest_devices` lookup — against a
free tier of 500K invocations/month.

**Recommended remedy (not yet built):** move the limit to shared state, which
on this stack means Postgres. The cheap shape is a **single round trip that
resolves the token and enforces the limit together** — a security-definer RPC
`resolve_ingest_device(p_token_hash, p_peer)` that upserts a counter row,
returns `blocked` when the peer's failure budget or the token's request budget
is spent, and otherwise returns the device. The happy path then costs exactly
what it costs today (one query), so no latency is added to real captures,
while an anonymous flood is bounded by a tiny indexed upsert instead of
reaching the parser. Needs a `ingest_rate_limits(key, window_start, count)`
table plus a periodic prune.

**Do not "fix" this by adding more in-memory bookkeeping.** The constraint is
the isolate lifecycle, not the algorithm.

#### The real fix (migration 12, deployed and verified 2026-07-25)

State moved to Postgres. `ingest_rate_limits(key, window_start, hits)` holds a
fixed window per key (`peer:<ip>` / `token:<sha256>`), and
`resolve_ingest_device(p_token_hash, p_peer)` — security definer, granted to
`service_role` only — **resolves the token and applies both budgets in a
single round trip**, replacing the lookup the function already did. The happy
path therefore costs exactly what it did before; no latency was added to real
captures. Budgets are unchanged: 20 failed auths/min per peer IP, 60
requests/min per token.

Design notes worth keeping:

- **Fixed window, not sliding.** A sliding window needs per-hit timestamps;
  the extra precision buys nothing when the goal is bounding abuse rather
  than fairness.
- **The counter table is invisible to clients.** RLS is on with *no* policies,
  and grants are explicitly revoked from `anon`/`authenticated` — necessary
  because 04_grants.sql's default privileges would otherwise hand it DML.
  `rate_limit_bump`/`rate_limit_peek` are revoked from every client role too:
  a client able to call them could probe token hashes and burn other peers'
  budgets.
- **Self-pruning.** `rate_limit_bump` sweeps keys older than a day on roughly
  1 call in 1000 — cheaper than a scheduled job for pure scratch data.
- The dead `_shared/rate-limit.ts` is deleted and `handleIngest` no longer
  takes limiter arguments; the store returns `blocked` and the handler's only
  job is to honour it.

**Verified in production, not just in tests:** 26 requests with invented
tokens from one IP returned `401 ×20` then `429 ×6`, exactly at the budget.
A separate check confirmed the happy path still resolves a real active device
(`resolved: true, has_user: true, blocked: false`). The unit tests deliberately
no longer assert limiting behaviour — that now lives in SQL — and instead
assert that the handler honours `blocked`, asks in one round trip, forwards
the peer key, and never touches the store on a malformed header.

### SEC-3 — `ingest_devices` was client-writable, contradicting its own policy comment (Low)

`02_rls.sql` granted `authenticated` the full insert/update quartet on
`ingest_devices` while commenting that "token_hash is only ever written by the
security-definer RPC". Nothing enforced that: a client could insert a row with
a `token_hash` of its choosing — defeating the shown-once, 32-random-byte
guarantee of `create_ingest_token` by substituting a weak or predictable token
— or clear `revoked_at` to resurrect a revoked device. Owner-scoped, so the
blast radius was the user's own account, but it made the RPC bypassable.

**Fix:** migration `11_security_hardening.sql` drops the insert and update
policies and revokes both privileges. Insert now belongs solely to
`create_ingest_token`. Revocation moves to a new `revoke_ingest_device(uuid)`
security-definer RPC that is one-way (`coalesce(revoked_at, now())`, so a
revoked device can never be reactivated) and cannot touch `token_hash`.
`useRevokeDevice` calls the RPC instead of writing the table. Select and
delete policies are unchanged — both are owner-scoped and harmless.

### SEC-4 — Password reset left existing sessions valid (Low)

Settings → Account → reset password called `signOut({ scope: 'local' })`
before mailing the link, which drops the local session but does not revoke the
refresh token server-side. A refresh token captured from another device stayed
usable across the reset — exactly the scenario a user resets a password to
close.

**Fix:** that path now uses `scope: 'global'`. Ordinary sign-out and
switch-account deliberately stay `local` — revoking a user's other devices is
surprising behaviour for a plain sign-out, and with SEC-1 fixed there is no
data-isolation reason to force it.

### SEC-5 — Bug reporting was silently broken (functional, found during the audit)

`useSubmitBugReport` inserts `{short_id, app_version, description}`, but
`bug_reports.user_id` is `not null` with no default — so every submission
since the feature shipped failed on the not-null constraint. Not a
vulnerability, but it means **no bug report has ever been received**.

**Fix:** migration 11 sets `user_id default auth.uid()`. This is also the
safer shape than populating it client-side (the RLS with-check already
rejected a forged id, but now the client cannot state one at all).

### Owner actions (not code — cannot be done from the repo)

1. ✅ **Migration 11 applied to the hosted project** (`pzjroqwllrzcbpiugpxl`,
   2026-07-25) via `supabase db push`; verified on the remote DB that only the
   select/delete policies remain on `ingest_devices`, that `authenticated` has
   lost INSERT/UPDATE there, that `revoke_ingest_device` exists as security
   definer, and that `bug_reports.user_id` defaults to `auth.uid()`.
   **Still to do: redeploy the ingest function** for SEC-2 (do it at merge).
   *Compatibility note:* builds predating this change revoke devices by
   writing `ingest_devices` directly, which the migration now denies — the
   Revoke button fails (closed, not open) on any older installed build until
   it is replaced by one carrying the `revoke_ingest_device` RPC.
2. **Leaked-password protection is Pro-only — not enabled** (owner decision
   2026-07-25: no spend before real users, consistent with §16.5). See
   "Password policy" below for what was done instead and the free path if it
   becomes worth revisiting.

### Password policy (decided 2026-07-25)

Client minimum raised **8 → 10 characters**, now a single constant in
`apps/mobile/src/lib/password.ts` shared by sign-up and reset so the two
cannot drift.

**No composition rules, deliberately** (no "must contain a symbol/digit").
NIST SP 800-63B recommends against them and against forced rotation: they
produce predictable mutations like `Password1!` while adding signup friction,
which is the one thing this app can least afford given the onboarding
drop-off watch in §17. Length plus breach screening is the modern guidance.

**Threat model, for whoever revisits this:** a compromised account here cannot
move money — the safety invariant means there is no bank connectivity. The
exposure is *reading* one user's spending history and writing junk
transactions. Real, but not funds-at-risk, which is what argues against
heavy-handed rules.

**Breach screening is implemented client-side, free** (2026-07-25). Supabase's
built-in HIBP check is Pro-only, so `checkPasswordBreached()` in
`apps/mobile/src/lib/password.ts` calls the Pwned Passwords range API directly
from sign-up and reset. It SHA-1s the candidate password (`expo-crypto` — a
new dependency; Hermes has no `crypto.subtle`) and sends only the **first 5
hex characters** of the hash to `api.pwnedpasswords.com/range/<prefix>`,
matching the returned suffixes locally. No API key, no account, no cost.
`Add-Padding: true` is sent so every response is a uniform size and the real
bucket isn't inferable from response length.

Three properties that are load-bearing — do not "simplify" them away:

- **k-anonymity.** The password, and any hash that could be reversed to it,
  never leaves the device. Only a 5-char prefix shared by ~800 other hashes
  goes out. This is what makes a third-party call acceptable in a product
  whose pitch is that it doesn't ship your data anywhere.
- **Fails open.** Network error, non-200, timeout (4 s) or malformed body all
  return `inconclusive` and the signup proceeds. A reused password is a far
  smaller harm than an unusable signup. `checkPasswordBreached` never throws.
- **Advisory, not binding.** A client-side check cannot constrain anyone
  calling the Supabase auth API directly. That is accepted: the purpose is
  protecting users from their own password reuse, not stopping an attacker
  from choosing to weaken their own account. Server-side enforcement would
  need an auth hook and is not worth the plumbing at this scale.

`docs/privacy-policy.md` gained a "Password breach check" subsection under
Sharing, stating plainly that the password is never transmitted.

Verified against the live API on 2026-07-25: `"password"` → 52,372,427 hits,
`"Tr0ub4dor&3"` → 3,196, a random passphrase → 0; padding returned a uniform
~2,120 rows in every case. `countInRangeResponse` is a pure function split out
for that reason — note that **`apps/mobile` has no test harness** (it is the
workspace project `pnpm -r test` skips), so this was checked with a throwaway
Node script rather than a committed test. Adding vitest to `apps/mobile` is
the obvious follow-up if that module grows.

**Ranked above password strength for this app, both already tracked:** the
Gmail-SMTP deliverability problem (§15 — a reset email lost to spam is a worse
account-recovery risk than a 10-character minimum) and Sign in with Apple at
the TestFlight stage, which removes passwords for most users entirely.
3. **Accepted risk, no action:** the Shortcut's ingest token is passed through
   a `shortcuts://run-shortcut?input=<token>` URL and persisted by the
   Shortcut as plaintext `token.txt` in iCloud Drive (§15). It is a
   long-lived, unscoped write credential to one account. This is inherent to
   the Shortcut capture design and cannot be avoided while iOS automations
   remain unshareable; revocation (Settings → Capture → devices) is the only
   recovery, and the blast radius is writes to one account, never reads.

## 19. Repo made public; legal repo retired; store-build notes (2026-07-25)

### The repo is public, permanently

`jaredoka/bukit-pennies` is **public now and forever** (owner decision,
2026-07-25). Everything in the working tree *and in every past commit* is
world-readable. Treat that as a standing constraint on all future work:

- **Never commit a secret, not even briefly.** Rewriting history does not
  help once a public repo has been cloned or indexed; the only real remedy is
  rotating the exposed credential. The service-role key belongs in Supabase's
  function secrets and nowhere else.
- Audited at the time of the switch: **the full history contains exactly two
  JWTs, both `role: anon`** (the local `supabase-demo` key in `env.ts` and the
  hosted anon key in `eas.json`). Anon keys are public by design — RLS is the
  boundary, not key secrecy. **No service-role key has ever been committed**;
  `functions/ingest/index.ts` only ever referenced it via
  `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`.
- What is now public and is fine: the hosted project ref, the anon key, the
  iCloud shortcut link (already shared deliberately), and §18's security
  audit. Publishing fixed vulnerabilities is normal practice and the accepted
  risks recorded there are honest limits, not exploitable secrets.
- One mild personal-data note: `apps/mobile/eas.json` carries the owner's
  personal Apple ID email in the `submit` block. Harmless but no longer
  private; move it to an EAS secret if that matters.

### `bukit-pennies-legal` is retired

That repo existed for exactly one reason: GitHub Pages on a **private** repo
requires a paid plan, so the policy pages needed a public home. With this repo
public that reason is gone, and the split was actively harmful — the same
privacy policy existed in two places (`docs/privacy-policy.md` here and the
legal repo's copy) with no sync mechanism, so an edit here silently failed to
reach the published page.

Now: **Pages is served from this repo's `docs/` folder** (`main` branch,
`/docs` source; enabled and verified 2026-07-25 — all three URLs return 200
and the published privacy policy carries the breach-check section), so `docs/privacy-policy.md` and `docs/terms.md` are both the
engineering copy and the published page — one source of truth. `docs/index.md`
is the landing page. The other files in `docs/` are engineering documentation
and are rendered too; that is harmless in a public repo.

URLs changed, and `apps/mobile/src/lib/env.ts` was updated to match:

| | Old (retired) | Current |
|---|---|---|
| Privacy | `jaredoka.github.io/bukit-pennies-legal/privacy-policy` | `jaredoka.github.io/bukit-pennies/privacy-policy` |
| Terms | `jaredoka.github.io/bukit-pennies-legal/terms` | `jaredoka.github.io/bukit-pennies/terms` |

✅ **The old repo was deleted by the owner on 2026-07-25**; both old URLs now
return 404 and the new ones 200 (verified). There is exactly one published
policy again.

The old URLs 404. That was safe only because the app is not yet in either
store — **once a store listing cites a policy URL, it must not move.** If the
`bukitpennies.com` domain of §15 ever happens, point it at these Pages rather
than relocating the files again.

### Store builds: native dependencies need a fresh binary

Recorded because the app is going to **both** the App Store and Google Play,
and this trips people up: `expo-crypto` (added for §18's breach check) is an
Expo **first-party** package, but first-party is not the same as JS-only. It
ships native code, so it cannot arrive through an OTA/JS update — it needs a
**new native build** (EAS build → TestFlight → App Store; and the equivalent
AAB for Play). The same applies to every `expo-*` module already in
`app.json`'s plugins array.

Practical consequences to plan around:

- A JS-only fix can ship over the air; adding or upgrading any native module
  cannot. Batch native additions into the same build rather than discovering
  them one at a time.
- iOS builds require macOS. Per §16.4 the path of record is **EAS cloud
  builds** run from Windows — do not attempt this locally.
- After adding a native module, `expo prebuild` output changes; the Android
  listener work in Stage B will need the same treatment.
- Apple and Google both re-review a new binary. Native changes therefore cost
  review latency that a JS update does not.

### Revoked capture tokens can now be removed

**Question raised by the owner:** revoked tokens stayed listed forever with no
way to delete them. **Decision: yes, add removal — but only for
already-revoked devices.** Settings → Capture → devices now shows a "Remove"
button beside the `revoked` badge, behind a confirmation.

Why that shape:

- **Revoking stays the safety-critical, one-way step** (migration 11 made
  `revoke_ingest_device` unable to un-revoke). Deletion afterwards is purely
  clearing the list, so it can never be misread as "stop this token working" —
  that is what Revoke is for.
- **It costs no security.** A deleted row means the token hash no longer
  resolves, which is the same outcome as revoked. Token hashes are 32 random
  bytes, so freeing one for reuse is meaningless.
- **The one real cost is the audit trail**, and it is why removal is not
  automatic and not silent: `last_seen_at` on a revoked token is the evidence
  of when it was last used, which matters most in exactly the situation you
  revoked for (a token you think leaked). The confirmation dialog says so
  explicitly, and the choice stays the user's.
- **It matches the product's stated posture.** The privacy policy promises
  user control over their data; "you may create rows but never remove them"
  contradicts that.

No migration was needed — migration 11 narrowed only insert and update on
`ingest_devices`; the owner-scoped `ingest_devices_delete` policy and the
DELETE grant were deliberately left in place.

## 20. Pre-TestFlight launch ops (2026-07-25)

Both items below were flagged as things that bite *during* the first EAS build
or the first week of beta, so they were done ahead of Apple enrolment.

### Sentry: two switches that both fail quietly

The production build had neither Sentry variable set, and the two failure
modes point in opposite directions:

- **No `EXPO_PUBLIC_SENTRY_DSN`** → the app builds and runs fine with crash
  reporting silently off, which is worst precisely when it matters (real
  testers, real crashes, no reports).
- **Auto-upload left on** → the `@sentry/react-native/expo` plugin tries to
  upload source maps and **fails the build** unless `SENTRY_AUTH_TOKEN` exists
  as an EAS secret. §15 already recorded hitting this on the old unsigned-IPA
  workflow.

**Decision: `SENTRY_DISABLE_AUTO_UPLOAD=true` is now in `eas.json`'s
production env.** A first build that succeeds with minified stack traces beats
one that dies 20 minutes in over source maps. Turn uploads on after the first
successful build by creating the `SENTRY_AUTH_TOKEN` secret and deleting that
line. The DSN deliberately stays **out** of the repo — it belongs in
`eas secret:create --name EXPO_PUBLIC_SENTRY_DSN`.

**`pnpm release:check`** (`scripts/check-release-config.mjs`) exists so this
class of mistake is visible before a build rather than after. It reports both
Sentry switches, leftover `FILL-ME` placeholders, a missing EAS `projectId`,
and an unbumped version. It treats exactly one thing as a hard error besides
placeholders: a Supabase key whose decoded `role` is not `anon`, since
shipping a service-role key inside an app binary would hand every user an
RLS-bypassing credential. Warnings do not fail the run — several are
legitimate choices, and a gate people learn to ignore is worse than no gate.
It cannot see EAS secrets, so a DSN warning should be checked against
`eas secret:list` before acting on it.

### Resend migration: written up, blocked on a domain

`docs/email-deliverability.md` is the runbook. **It has not been executed**,
because it cannot be: Resend's free tier only delivers to the account owner's
own address until a **sending domain is verified**, and no domain is owned
yet. Domain verification is not incidental — SPF and DKIM are the actual
reason Gmail-relayed mail scores badly, so the domain *is* the fix.

Cost is ~US$12/yr and §15 already anticipated `bukitpennies.com` doubling as
the App Store support URL and public site.

**Why this outranks the password work in §18:** password reset is the only
account-recovery path in the app (no social login until the Apple account
exists, no magic links). A reset mail in spam is therefore an unrecoverable
account for anyone who is not the owner, which is a worse practical risk than
a weak password.

**Cost, since it was asked (2026-07-25): the domain and nothing else.**
Sending needs no mailbox — Resend sends as `noreply@<domain>` on the strength
of DNS verification alone, with no inbox behind it. Receiving is worth setting
up for the store support contact and is also free: Cloudflare Email Routing
forwards `support@<domain>` into the existing Gmail, and Gmail's "send mail
as" pointed at Resend's SMTP makes replies leave from the right address. A
paid mailbox (~US$1–7/user/mo) would only add a second inbox to check. Total
is ~US$12/yr.

The runbook also records the one choice that is painful to undo: **only one
SPF TXT record may exist per name**, so Cloudflare Email Routing plus
root-domain sending collide and silently invalidate each other. Sending from a
`send.` subdomain avoids it entirely and is what Resend recommends.

Interim position while the owner is the only tester: keep Gmail SMTP and check
spam. Revisit before inviting anyone else. Two related decisions are recorded
in the runbook: raising Supabase's conservative custom-SMTP rate limits, and
re-enabling email confirmations (currently off per §15) so a typo'd signup is
not an unrecoverable account.

## 21. First unsigned IPA carrying the 2026-07-25 work

Built via `ios-unsigned-ipa.yml` (workflow_dispatch, run 30136862359) on a
`macos-26` runner. 12 MB artifact, retained 14 days; also saved to
`build/ios-unsigned/` locally.

| | |
|---|---|
| Bundle | `Payload/BukitPennies.app` |
| Identifier | `com.bukitpennies.app` |
| Version | 0.1.0 (build 1) |
| Minimum iOS | 16.4 |
| Signature | none — no `_CodeSignature`, no `embedded.mobileprovision` |

**Verify the artifact, not just the green check.** A build can succeed and
still produce an app that installs and does nothing, because the Supabase
config is baked in at build time from workflow inputs. What was checked
inside the IPA, and is worth repeating on future builds:

- `main.jsbundle` contains the **hosted** Supabase URL and *not* the
  `127.0.0.1:54321` dev fallback from `env.ts`. This is the failure that
  would otherwise look like "the app is broken" on device.
- It contains `api.pwnedpasswords.com` (§18 breach check shipped) and the
  **new** `jaredoka.github.io/bukit-pennies/privacy-policy` URL, with no
  trace of the deleted `bukit-pennies-legal` host — so the in-app policy
  links do not point at a dead page (§19).
- The main binary is present and the bundle is genuinely unsigned, which is
  what Sideloadly requires.

This is the first build containing the whole 2026-07-25 batch: per-user
ingest-token scoping, Postgres-backed rate limiting, breach screening, the
10-character password minimum, and the remove-revoked-token button. Migrations
11 and 12 are already applied to the hosted project, so app and backend match.

**Crash reporting is off in this build** — no `EXPO_PUBLIC_SENTRY_DSN` exists
yet, so `initSentry` early-returns. Expected, not a regression, and exactly
what `pnpm release:check` warns about (§20).

Free-signing expiry still applies: Sideloadly re-signs with a free Apple ID and
the result stops launching after **7 days**. See `docs/ios-sideloadly.md`.

## 22. Capture setup: gate → prompt (2026-07-25)

**Why.** Automatic capture *is* the product — without it the app competes with
Money Lover and Spendee on their terms and loses. That is not in question and
this change does not soften it. What changed is the mechanism.

Setup was enforced: `AuthGate` redirected anyone not onboarded into the guide,
and the "I'll do it later" escape (`isSetupDeferred`) was **in-memory**, so it
lasted one app launch and the guide reappeared on every open. The step people
abandon is step 4 — seven substeps inside the Shortcuts app, which iOS makes
unshareable. A user who cannot complete it was therefore nagged forever with
no way past. That loses the user, not the setup.

**Now:** no redirect. A dismissible dashboard card and a permanent
Settings → Capture entry carry the prompt.

### What changed

- `src/lib/onboarding.ts` rewritten. In-memory `deferSetup`/`isSetupDeferred`
  and the once-per-launch prompt flags are gone. Added persistent
  `dismissSetupCard`/`isSetupCardDismissed`, and per-step progress
  (`getCompletedSteps`, `setStepCompleted`, `markAllStepsCompleted`,
  `nextIncompleteStep`).
- `app/_layout.tsx` — the redirect-into-setup branch is deleted. First run
  still lands on `/welcome` for the paste hero.
- `settings/shortcut-setup.tsx` — the "One-time setup" `Alert` is gone; it
  existed only because users were trapped. Each `StepHeader` badge is now a
  checkbox, completed steps recede to muted with a struck-through title, and a
  banner names the step to resume at. Completing setup ticks all five.
- `(tabs)/index.tsx` — the nudge became a card showing
  "Finish automatic capture — step N of 5" plus "Your progress is saved" once
  progress exists, with an explicit dismiss.

### Decisions worth keeping

- **Progress is user-ticked, not inferred.** Only token creation and the final
  test are observable; step 4 happens in another app where we see nothing.
  Guessing would produce a progress bar that lies.
- **Dismissal is permanent, per user.** "Later" has to mean later or it is not
  an escape. Settings → Capture is always there.
- **The paste hero still hands off to the guide**, because immediately after
  watching their own SMS parse is when someone is most willing to spend five
  minutes. That was always the right moment; the trap was the problem.
- No `success` colour exists in the theme and module-level colour constants
  are banned (§15), so a done step uses `colors.muted` — finished work
  recedes, pending work stays primary.

### Still open — the real lever

`settings/shortcut-visual-guide.tsx` renders **"Screenshot coming soon"**. For
a non-technical user, pictures or a 30-second screen recording of the step-4
automation is worth more to completion than everything above. **Owner is
providing them**; wire them in when they arrive.

**Update 2026-07-31 (§37):** the screen was deleted — every slot was still a
placeholder, so the button promised pictures and delivered seven empty boxes.
The lever itself is unchanged and still the highest-value onboarding work;
what is gone is the empty shell that was standing in for it.

Related, from §17's post-launch watch: the funnel is measurable from the
database alone — accounts created vs. `ingest_devices` rows created vs. tokens
with `last_seen_at` set. Those three counts now mean something more precise,
since nobody is force-marched into creating a token.

---

## 23. Second security pass (2026-07-25) — surfaces §18 did not cover

§18 audited RLS, the ingest function, auth flows, token storage and deep links.
This pass covered what it left: the anonymous attack surface as actually
deployed, the rate limiter's *arithmetic* (not just its mechanism), and parser
behaviour on hostile input. Both findings are fixed on branch
`security-followup-budgets-and-parse-cap` (migration 13 + a parser size gate).

### First: the checks anyone can repeat

Ran against the hosted project with nothing but the public anon key from
`eas.json` and **no session** — the "test your permissions while logged out"
advice this pass started from. Recorded because it is the cheapest regression
test that exists for this app, and it takes a minute:

- `GET` on `transactions`, `profiles`, `ingest_devices`, `bug_reports`,
  `user_cards`, `budgets`, `savings_goals`, `monthly_totals`, `merchant_totals`
  → `200 []` every one. `categories` returns the eight global seed rows
  (`user_id is null`), by design. `ingest_rate_limits` → `401 42501`.
- `POST` to `transactions` / `profiles` / `bug_reports` / `ingest_devices` with
  correctly-shaped payloads, forging a `user_id` and a `token_hash` →
  `401 42501 new row violates row-level security policy` on all four.
- Unfiltered `PATCH` / `DELETE` on `transactions` → `204`, which *looks* like
  success but is PostgREST reporting zero rows; with `Prefer:
  return=representation` both return `[]`. **Do not read a bare 204 here as a
  breach** — that is a five-minute panic waiting to happen for a future
  reviewer.
- RPCs: `delete_account` → `401 permission denied for function`;
  `create_ingest_token`, `revoke_ingest_device`, `resolve_ingest_device`,
  `rate_limit_bump` → `404 PGRST202` (execute revoked, so they are not in
  anon's schema cache). `/ingest` with an invented bearer token → `401`.

### SEC-6 — the per-token rate limit was multipliable by any account (Medium)

Migration 12 (§18) fixed the *mechanism* — the limiter moved from dead
in-memory state to Postgres and was verified working. It did not bound an
authenticated user, because of how the two budgets are keyed:

- `token:<sha256>` gives **each token** its own 60/min bucket, and
  `create_ingest_token` capped nothing, so a user could mint tokens without
  limit;
- `peer:<ip>` counts **failed auths only** — deliberately, since Brunei mobile
  networks NAT heavily — so a stream of *valid* requests never touches it.

One free account could therefore mint N tokens and sustain N × 60 valid
requests/minute, entirely unseen by the limiter. Signup is free and
unrestricted, so "needs an account" is not a meaningful barrier. Exposure is
invocation count and egress against the free tier (§16.5 names egress as the
first ceiling), not data — every request still writes only to its own user's
rows.

**Fix (migration 13), two layers:**

1. A **per-user budget of 120 requests/minute** (`user:<uid>`) that no amount
   of minting can widen, applied inside `resolve_ingest_device` — still one
   round trip, so the §12 no-added-latency invariant holds. The number: bulk
   paste posts at a 1,200 ms interval (`postIngestMany`) ≈ 50/min per device,
   so 120 covers two devices bulk-pasting plus Shortcut traffic. The token
   budget is bumped and checked first, so one runaway device is reported
   against itself rather than quietly eating the account's allowance.
2. A **cap of 10 active devices** per user in `create_ingest_token`. Revoked
   devices do not count, so revoking frees a slot. Real usage is 1–2. This also
   stops `ingest_devices` being an unbounded client-driven write, and keeps
   Settings → Capture usable as a revocation screen.

**Verified on a full `supabase db reset` (migrations 01–13 clean):** three
tokens on one user, 150 alternating calls → **first block at request #121**
while the highest per-token counter was only 50, i.e. every one of those
requests would have passed before. Minting stopped at attempt 11 with `device
limit reached`; revoking one device let the next mint succeed (46-char token,
`bp_` + 43 base62). `create or replace` preserved the grants —
`resolve_ingest_device` is service_role-only, `create_ingest_token`
authenticated-only, `rate_limit_bump` postgres-only, all still
`security definer`.

### SEC-7 — parser fingerprints are superlinear; only the server was capped (Low)

§18 recorded "no catastrophic backtracking … input is capped at 4 KB". The
first half is too generous. `baiduri.ts`'s `FINGERPRINT` has three greedy `.*`
under the `s` flag, and on input carrying many `Amount:`/`Merchant:` anchors
with no trailing `Date:` the cost grows roughly ×8 per doubling — measured in
Node: **0.9 ms @ 1 KB → 6 ms @ 2 KB → 46 ms @ 4 KB → 355 ms @ 8 KB → 2.8 s
@ 16 KB**. So the second half of that sentence was doing all the work: the
4 KB cap is not incidental, it is the control. Note also that parsing happens
*after* `resolveDevice`, so the parser sits behind both auth and the rate
limit — that ordering is load-bearing too, and SEC-6 was what let it be
multiplied.

The gap: the cap existed **only on the server**. `capture.tsx`,
`transactions/index.tsx` and `welcome.tsx` all call `parseBankMessage`
synchronously inside a `useMemo` on uncapped paste input, where a large enough
blob freezes the UI thread. Reaching the pathological case needs contrived
text (ordinary prose lacks the `Card No.:` prefix and fails fast), so this is
robustness rather than an attack — but it is free to close.

**Fix:** `MAX_TEXT_BYTES` now lives in `@bukit/parsers` and `parseBankMessage`
refuses anything larger **before any regex touches the input**, mirroring the
server's `422 text_too_large` — the client can no longer preview something the
server will reject. `handler.ts` imports the constant instead of declaring its
own, and the two UI copies of the literal are gone, so the three cannot drift.
The single-message previews in `capture.tsx` and `welcome.tsx` gained explicit
"over 4 KB" copy; the bulk list already had an `oversized` badge.

Three tests pin it (`parsers.test.ts`), including a **byte**-length case
(multi-byte input must not slip past a character count) and a timing assertion
that the 64 KB adversarial string completes in under 250 ms — without the gate
it takes minutes.

### Not fixed, deliberately

The regexes themselves were left alone. Anchoring or bounding the `.*` runs
would change matching behaviour on real messages, which per §7 of the playbook
means golden fixtures first — and the size gate already bounds the cost. If
the fingerprints are ever rewritten, the timing test is the thing that will
tell you whether the rewrite helped.

### Owner action at merge

Migration 13 must be pushed to the hosted project (`supabase db push`) **and
the ingest function redeployed**, same as §18's item 1. The device cap changes
a user-visible outcome: an account already holding 10 active capture devices
will see token creation fail with `device limit reached` until it revokes one.
No existing account is near that.

---

## 24. SEC-8 — production granted `anon` full DML on every table (2026-07-25)

Found immediately after deploying §23: `supabase db diff --linked` reported
`grant select/insert/update/delete ... to "anon"` on `transactions`,
`profiles`, `ingest_devices`, `budgets`, `bug_reports`, `categories`,
`savings_goals` and `user_cards` — present on the hosted project, absent from a
local `supabase db reset`.

**Nothing was exposed.** RLS is enabled on all of them with owner-scoped
policies, and a logged-out write is refused with *"new row violates row-level
security policy"* — the policy talking, not the grant. This is the tell worth
remembering, because both denials look the same from a status code:

| Response | Meaning |
|---|---|
| `401 42501 permission denied for table X` | no GRANT — the outer layer stopped it |
| `401 42501 new row violates row-level security policy` | GRANT exists, RLS policy stopped it |
| `200 []` on a select | GRANT exists, RLS filtered every row |

`ingest_rate_limits` gave the first; every other table gave the second or
third. That difference is what exposed the drift.

**Cause:** the project was created on a Supabase image that still auto-granted
DML to `anon`. `04_grants.sql` was written for the *opposite* problem — newer
images stopped granting `authenticated`/`service_role`, so it adds those back
— and it never revoked what the older image had already issued. Local stacks
run the newer image, so local never had the anon grants to begin with.

**Why it mattered even though nothing leaked:** production ran on one layer
where this repo intends two, and — worse — **local was stricter than
production**. A table shipped without `enable row level security` would pass
local testing (anon has no grant → "permission denied") and be world-writable
in production (anon has the grant, no RLS means no second gate). That
asymmetry is the actual defect; the missing layer is the symptom.

**Fix (migration 14):** revoke SELECT/INSERT/UPDATE/DELETE on all public tables
and sequences from `anon`, plus matching `alter default privileges` so new
tables do not inherit it. Schema USAGE stays — PostgREST needs it to
introspect and it conveys no data access.

Two constraints found while writing it, both now comments in the migration:

- `alter default privileges for role supabase_admin` fails as `postgres` with
  *"permission denied to change default privileges"* — you may only alter them
  for a role you are a member of. It is not needed: default privileges key off
  whichever role **creates** an object, and every table here is created by a
  migration running as postgres. **Tables created by hand in the dashboard are
  the gap** — check grants if you ever make one there.
- This does not substitute for RLS. It restores the second layer; the policy
  quartet is still the boundary.

**Verified locally** (`supabase db reset`, 01–14 clean): `anon` retains no DML
on any public table; `authenticated` is untouched — 64 seeded transactions
still visible, insert and delete still work, the eight global categories still
readable.

**Verified in production** after `supabase db push` (2026-07-25): every table
that previously answered `200 []` to a logged-out select now answers
`401 42501 permission denied` — `transactions`, `profiles`, `ingest_devices`,
`bug_reports`, `categories`, `user_cards`, `budgets`, `savings_goals`, and both
dashboard views. A forged anonymous insert into `transactions` is refused the
same way. The denial moved from the RLS layer to the grant layer, which is the
whole point: RLS is now the second gate rather than the only one.

A follow-up `supabase db diff --linked` shows **no remaining grant drift**. It
still emits `create or replace` for `rate_limit_bump`, `rate_limit_peek` and
`revoke_ingest_device`; the emitted bodies are byte-identical to migrations 11
and 12, so this is migra failing to prove equality rather than real drift —
the same three appeared before this migration and the functions actually
replaced by migration 13 did not. Do not "fix" it by rewriting those
functions.

**Not verified in production: the signed-in app.** `authenticated` is untouched
by design (migration 14 names only `anon`) and this was proven on the local
stack — 64 seeded transactions readable, insert/delete working, global
categories readable, and both `security_invoker` dashboard views returning
rows. Reproducing that against the hosted project needs real credentials.
Opening the app once and loading the dashboard is the confirmation.

### Deploy record (2026-07-25)

| Step | Result |
|---|---|
| `supabase db push` (migration 13) | applied; `migration list` 13/13 local↔remote |
| `supabase functions deploy ingest` | deployed, 754 kB bundle |
| Peer-budget smoke test, 26 invented tokens from one IP | `401 x20` then `429 x6` — exactly the budget |
| `supabase db diff --linked` | `resolve_ingest_device` and `create_ingest_token` show no diff — the SEC-6 versions are live |
| `supabase db push` (migration 14) | applied; anon DML gone, verified by probe above |

---

## 25. Post-deploy app verification (2026-07-26) — and the device cap is already full

§24 closed with "the signed-in app was not verified against production". It has
been now: `expo start --web` on port 8082 with `apps/mobile/.env` pointing at
`pzjroqwllrzcbpiugpxl`, owner signing in themselves.

**Everything renders. Migration 14 broke nothing.** Every PostgREST call the
app makes came back **200**, read straight off the network panel after a hard
reload:

| Request | Status |
|---|---|
| `profiles?select=*` | 200 |
| `monthly_totals?select=*&order=month.desc` | 200 |
| `merchant_totals?select=*&currency=eq.BND&order=total.desc&limit=6` | 200 |
| `transactions` (three variants: month, year, current-month windows) | 200 |
| `categories?select=*&order=name.asc` | 200 |
| `budgets?select=*` | 200 |

Both `security_invoker` views are in that list, which was the specific
regression risk: `revoke ... on all tables` covers views too, and had the
revoke caught `authenticated` the dashboard donut would have gone blank.
Screens checked by eye: Dashboard (donut, category breakdown, "Saved/Spent
this month"), Transactions (day-sectioned with per-day totals), Goals,
Settings → Capture → Capture devices. No console errors.

### The device cap needs attention — my "no existing account is close" was wrong

I wrote in §23 that no account was near the 10-active-device cap added in
migration 13. **The owner's account has 11 devices, 1 revoked — exactly 10
active.** It is *at* the cap, so "Create token" now fails with `device limit
reached` until something is revoked.

The list, verbatim from Settings → Capture devices:

| Device | Kind | Last used |
|---|---|---|
| My iPhone | ios_shortcut | 2026-07-24 |
| Jarjar ongs | ios_shortcut | never |
| jarjar ongs | ios_shortcut | never |
| My iPhone | ios_shortcut | never |
| jarjar ongs | ios_shortcut | 2026-07-21 |
| jarjar ongs | ios_shortcut | never |
| Bibd bp test | ios_shortcut | 2026-07-18 |
| test | android_listener | never (**revoked**) |
| This device (paste) | paste | 2026-07-17 |
| Jared bukit pennies shortcut | ios_shortcut | 2026-07-20 |
| Jared iphone shorcut | ios_shortcut | never |

Five of the ten active devices have **never been used** (a sixth never-used
one, `test`, was already revoked) — abandoned attempts from Shortcut setup
iterations, which is exactly the shape §22 predicted when it called setup a
multi-attempt flow. That is the real lesson here: **a cap of 10
is not generous for a flow whose failure mode is minting another token.** A
first-time user who fumbles setup a few times could plausibly reach it, and the
error message points at revocation without saying where to do it.

Not changed yet — the options are the owner revoking the six dead entries
(one-way, safe: `revoke_ingest_device` cannot resurrect, and never-used tokens
are by definition not in any Shortcut), raising the cap, or having the cap skip
never-used devices. Decide before TestFlight; a paying-attention first user
hitting `device limit reached` during onboarding would be a bad first
impression.

**Also worth wiring in:** the cap has no client-side awareness. The Create
token button submits and surfaces the raw Postgres exception. If the cap stays,
the devices screen should count active devices and disable the button with a
"revoke one first" hint before the round trip.

**Resolved 2026-07-26** — see §26. The five never-used devices were revoked
through the app (which incidentally proved migration 11's
`revoke_ingest_device` RPC works against production), leaving the five that
have actually captured. The cap itself was then changed so this cannot recur.

---

## 26. Device cap split: used vs. never-used (2026-07-26)

Migration 13's cap of 10 active devices counted setup debris against the same
budget as working ones, which §25 caught the hard way. Migration 15 splits it:

| Bucket | Cap | Reasoning |
|---|---|---|
| `last_seen_at is not null` (has actually captured) | **10** | A device that has posted a transaction is real. Ten is already unusual. |
| `last_seen_at is null` (minted, never used) | **20** | Setup debris. Loose enough that no plausible run of failed Shortcut attempts hits it. |

Both stay bounded on purpose. An unbounded device list is an unbounded
client-driven write into `ingest_devices`, and that half of migration 13's
reasoning still holds. What no longer needs this cap is the *rate-limit*
argument: the per-user 120/min budget from migration 13 bounds abuse
regardless of how many tokens exist, which is what makes it safe to be generous
with unused ones.

Error messages now name the screen (`Settings > Capture > Capture devices`)
instead of saying "revoke an existing capture device first" and leaving the
user to find it.

**Verified locally** (`supabase db reset`, 01–15 clean): 25 attempted mints on
a fresh account stop at the 21st with the unused-cap message, 20 having
succeeded; marking 10 of them used then makes the next mint fail with the
used-cap message. Final state 10 used / 10 unused.

**Owner cleanup, same day:** the five never-used devices on the owner's account
were revoked through the app, leaving five that have actually captured (`My
iPhone` 07-24, `jarjar ongs` 07-21, `Bibd bp test` 07-18, `This device (paste)`
07-17, `Jared bukit pennies shortcut` 07-20). Under the new rule that is 5/10
used and 0/20 unused.

### Still not done

The client has no awareness of either cap. `Create token` submits and surfaces
the raw Postgres exception rather than disabling itself with a count. Much less
likely to be hit now, so it was left alone deliberately — but if the devices
screen is ever touched again, showing "5 of 10 devices" is a ten-minute job
that turns an error into a fact the user can see coming.

---

## 27. Feature requests + emailed feedback (2026-07-29)

Two things, one branch: category pills stopped re-wrapping when tapped, and
Settings gained **Request a feature**. Bug reports and feature requests now
both notify by email.

### The pill jump

Selecting a category pill in manual entry moved it to another row. Only
`chipActiveText` carried `fontWeight: '600'`, so the tapped label measured
wider and the `flexWrap` row reflowed around it. Both states now share weight
and size; selection reads from the filled background, which it already did.
The style pair was copy-pasted in three places and all three had the bug —
`components/ui.tsx` (the shared `Chip`), `transactions/new.tsx`,
`settings/devices.tsx`. If a fourth copy ever appears, this is why it must not
bold on select.

### `feature_requests` (migration 16)

Same shape as `bug_reports` after the SEC-5 fix: insert-only policy, RLS on,
`user_id` defaulting to `auth.uid()` server-side so the client never names it,
plus a not-null `area`. No select policy — nobody reads requests back through
the API, including their own author. Grants ride on 04's default privileges
and 14 keeps `anon` out; the migration adds no grants of its own.

### The `feedback` edge function

Both screens now POST to `/functions/v1/feedback` instead of inserting
directly. The function runs with `verify_jwt = true` (the opposite of
`/ingest`) and inserts through the **caller's** JWT using the anon key — the
service-role key is deliberately not used, so RLS stays the boundary exactly
as it was for the direct insert. It then POSTs to Resend.

The row is the source of truth and the email is a courtesy copy: the insert
happens first, a send failure is logged and returns `200 {emailed: false}`,
and the app never surfaces that flag. Losing a submission to a mail outage
would be the worse failure. Logic lives in `_shared/feedback.ts` with 16
vitest cases; `feedback/index.ts` is the Deno wrapper.

**Secrets** (function secrets, not repo): `RESEND_API_KEY` and
`FEEDBACK_EMAIL_TO=bukitpennies@gmail.com`, optionally `FEEDBACK_EMAIL_FROM`
(defaults to Resend's `onboarding@resend.dev`, which only delivers to the
address that owns the Resend account — set a verified sender domain to send
anywhere else). With either of the first two unset the mailer is null: rows
are still recorded, no email goes out. That is the local-dev path and it is
why the function does not fail closed on a missing key.

### Verified

`supabase db reset` applies 01–16 clean. Against local: logged-out select and
insert on `feature_requests` both `401 42501 permission denied` (the grant
layer, per §24); a signed-in insert lands with `user_id` filled from the JWT;
a signed-in select returns `[]` (no policy). Through the served function:
`feature` and `bug` both `200 {emailed:false}` with rows landing under the
right user, empty description `422`, no JWT `401`, `GET` `405`.

Migration 16 pushed to production 2026-07-29; `supabase db diff --linked`
afterwards shows no table or grant drift, only the three `create or replace`
false positives §24 already documents.

### Deployed and verified in production (same day)

`supabase functions deploy feedback` — live as version 1, `verify_jwt: true`
(`supabase functions list` shows it next to `ingest`'s `false`). Both secrets
set: `FEEDBACK_EMAIL_TO=bukitpennies@gmail.com` and `RESEND_API_KEY`.

Smoke-tested against the hosted project by creating a throwaway auth user,
submitting one of each kind through the deployed function, and deleting the
user afterwards (every table cascades on `auth.users`, so the rows went with
it — production data unchanged). Both returned `200 {emailed: true}`, an
unauthenticated call `401 UNAUTHORIZED_NO_AUTH_HEADER` from the gateway, an
empty description `422`. **Both emails arrived at bukitpennies@gmail.com**,
which is the only part of the chain the CLI cannot prove — `emailed: true`
means Resend accepted the send, not that it delivered. The script is
disposable but the shape is worth repeating if this is ever touched: admin
create user → password sign-in → call → admin delete user.

One process note. The first `RESEND_API_KEY` was pasted into an agent
transcript, so it was rotated the same day: revoked in Resend, replaced
through the dashboard. Supabase's `secrets list` returns SHA-256 digests of
the values, which is how the rotation was confirmed rather than assumed —
compare the digest against the hash of the key you expect to be gone. Do not
paste the next one into a chat; `supabase secrets set` from a local shell, or
the dashboard, keeps it out.

### Still not done

There is no way to read requests back in-app; they are read in the Supabase
dashboard or in the inbox. Fine at this scale, and a `select` policy plus a
status column is the obvious next step if it stops being fine.

## 28. Frozen sheets, silent storage, and filters that told the truth (2026-07-30)

A field-test session that started with "the mascot is still there" and ended
four bugs deeper. Branch `fix/sheet-modal-and-splash-mascot`, PR #66.

### Every filter and the Add button froze the app

`SheetShell` stacked **two** `Modal`s — one fading for the dim, one sliding for
the panel — so the dim could appear at once while only the panel moved. iOS
presents one modal at a time per view controller, so the second present was
dropped on the floor. What shipped was a grey screen with no panel, no dismiss
area and no reachable `onRequestClose`: every transactions filter, the Add
button, the dashboard period picker, the Insights year picker and the category
picker locked the app until it was force-quit.

One `Modal` now, with the panel animated here rather than by the platform. It
measures on layout and slides exactly its own height on the native driver,
which is what keeps it quick — the hand-rolled version that predated the split
(#64) felt slow because it started from a `useEffect` after mounting a full
screen height down, so it paid a mount-paint-pause plus a long travel. The dim
is at full strength on the first frame. `visible` going false animates out and
*then* unmounts, so callers get the exit animation whether or not they gate
rendering with `useSheetPresence` — which exists to reset sheet state, not to
animate.

**If a third sheet implementation is ever proposed: two simultaneous Modals is
the thing that does not work.** Not "is discouraged" — the second one silently
never appears on iOS.

### SecureStore rejects colons, and kvStore ate the error

Dismissing the dashboard setup card did nothing across a restart. SecureStore
validates keys against `/^[\w.-]+$/` and **throws** on anything else; the
onboarding keys were `onboarded:<uuid>`, `setup_dismissed:<uuid>` and
`setup_steps:<uuid>`. Every read and write threw on the colon into kvStore's
bare `catch {}`. Three things were broken, not one: the dismissal, the setup
step ticks (so "Your progress is saved" was false), and "Setup complete"
itself — that last one masked by the AuthGate returning-user heuristic, which
re-stamps anyone holding transactions as onboarded.

It survived two phases because **web dev cannot reproduce it**: localStorage
takes any key. That asymmetry is the same shape as SEC-8 in §24, where local
was stricter than production.

kvStore now sanitises keys to the accepted set and warns in `__DEV__` instead
of failing mute. Onboarding keys moved to the dotted `bukit.` convention every
other stored key already used. No migration — nothing was ever written under
the old names.

### Cross-account paths on a shared device

Prompted by "make sure users cannot access other users' data". The server side
held up under audit and needed no changes: RLS on all ten tables with
owner-scoped policy quartets, both totals views `security_invoker`, every
`security definer` function gated on `auth.uid()` with execute revoked from
`anon`, `/ingest` deriving `user_id` solely from the token hash and never from
the body, `/feedback` under the caller's JWT. The gaps were all device-local.

- **The react-query cache outlived sign-out.** The `QueryClient` is
  module-scoped, so the next account to sign in on the same device rendered the
  previous account's transactions, profile and goals until each query
  refetched. Cleared on user change in `AuthGate`.

- **The legacy ingest token was adopted, not discarded.** `getStoredToken`
  copied the pre-scoping device-global token into the current user's slot,
  justified by "the upgrading user is the only account that has ever used this
  install's token". Nothing enforced that. If the previous account never
  reopened the app after the update, the *next* account to sign in inherited
  their token and every capture from that device would have been filed into the
  previous account — SEC-1 surviving through its own migration path. Ownership
  cannot be checked client-side: `token_hash` is server-side and the plaintext
  is shown once. The legacy key is now deleted, never adopted. Cost: a device
  still holding a pre-scoping token creates a new one in Settings > Capture.

- **Notification prefs were device-global.** `bukit.reminders` is keyed by
  *merchant name* and `bukit.alerted` by budget id, so the next account saw the
  previous account's merchant list in Settings > Notifications and had bill
  reminders scheduled for spending that was never theirs. Now per user. Theme,
  currency and the privacy cloak stay device-global deliberately — those
  describe the handset, not an account.

Also: the AuthGate heuristic re-ran on every navigation for anyone without
transactions yet, one round trip per tab tap for exactly the new user on mobile
data. Once per session now.

### Filters moved to the database (migration 17)

The list fetched `limit(500)` and filtered the array in the client, so a filter
was quietly answering "matches, among the newest 500" while presenting itself
as "matches". A date range into last year would have returned an empty list
with no explanation. Not yet reachable at current data volumes, which is
exactly why it was worth fixing before it was.

`src/lib/txFilters.ts` is the pure half: `TxFilters` in, a declarative list of
PostgREST operations out, no Supabase import. `queries.ts` applies them and
pages 50 rows at a time through `useInfiniteQuery`, with
`placeholderData: keepPreviousData` so changing a filter does not empty the
list and throw the filter bar itself behind a spinner. The search box is
debounced 300ms — it hits the network now.

Two semantics were wrong and are fixed by the move:

- **Zero is neither direction.** `outgoing` was `amount > 0` but `incoming` was
  `amount <= 0`, so a BND 0.00 card verification or declined charge counted as
  money in. Excluded from both now.
- **An undated row cannot satisfy a date range.** The old guard was
  `if (dateFrom && tx.occurred_at)`, so a null-dated row skipped the comparison
  and passed *every* range — the same transaction under "January 2025" and
  "last week" at once. SQL comparisons against NULL are false, which is the
  behaviour wanted. Undated rows stay fully visible with no date filter set,
  and Review is where they belong.

`transaction_facets` (migration 17) is a `select distinct user_id, bank,
card_last4, currency`, `security_invoker` like the totals views. The filter
pickers read it instead of the loaded rows: paging means a bank last used 600
transactions ago would otherwise drop out of the Bank sheet and become
unfilterable. Carrying `bank` alongside `card_last4` preserves the existing
behaviour where the Card sheet narrows to the selected banks.

Values in `or=` expressions are double-quoted and LIKE wildcards escaped.
PostgREST splits those on commas, so an unquoted merchant like
"SYARIKAT ABC, BHD" would silently mean something other than what was asked.

Six call sites each repeated the same three `invalidateQueries` lines and
`transaction_facets` made it four; `invalidateTransactionQueries(qc)` now owns
the set.

### `apps/mobile` has tests now

There was no test harness in the app package at all — the SecureStore bug had
no way to be caught, and the old `applyFilters` was exactly the kind of pure
logic that should have had some. `vitest.config.ts` aliases `@/` and stubs
`react-native` (the modules under test touch it only for `Platform.OS`; the
real package cannot load outside Metro) and defines `__DEV__`. 23 cases over
`txFilters` and `kvStore`. `pnpm -r test` and CI pick it up with no workflow
change — the suite is 96 tests now.

`test/kvStore.test.ts` carries the guard that would have caught the original
bug: a list of every key the app builds, asserted against SecureStore's
character class. **Add new key builders to that list.**

Node-only, pure logic. No component rendering, no device behaviour.

### Splash screen still had the hornbill

#65 swapped `icon.png` and `favicon.png` to the penny but missed
`splash-icon.png` and both Android adaptive-icon layers — and the splash is the
first thing you see, so the mascot was still there at launch. All three are
generated from the same 32x32 penny by `art/scripts/coin_platform_icons.py` now
rather than drawn separately. `TraversingHornbill` was unused after #65 and is
deleted; `HornbillMascot` stays, used only by Our Story.

### Not yet verified

Everything above passes `pnpm -r typecheck` and `pnpm -r test`, and **none of
the app-side behaviour has been exercised on a device.** Specifically still to
check:

- Each filter sheet opens, dismisses on tap-outside, and dismisses on Done.
- Add then Capture slides in, and the sheet resets between opens.
- Dismiss the setup card, force-quit, relaunch — it must stay gone.
- The list pages past 50 rows on scroll, and day sections spanning a page
  boundary merge rather than repeat.
- Filters return the same rows they used to for a small account.

### Migration 17 deploy record (2026-07-30)

Applied to local with `supabase migration up` (not `db reset` — 01–16 were
already applied and local dev data was worth keeping; the full-chain replay is
covered by the shadow database `db diff` builds, which applied 01–17 clean).
Then `supabase db push --linked`; `migration list` shows 17/17 local↔remote.

Isolation was proven, not assumed. Two throwaway users with transactions at
different banks, inside a transaction rolled back afterwards: user A saw
exactly their two `bank/card/currency` combinations, user B saw exactly their
one, neither saw the other's. `anon` gets `42501 permission denied for view
transaction_facets` — locally and against production over REST, the grant layer
talking, per §24.

`supabase db diff --linked` afterwards shows **no `transaction_facets`
statement at all**, so the deployed view matches the migration exactly. It does
emit two things that are not drift:

- The three `create or replace` functions §24 already documents.
- `drop extension if exists "pg_net"` — **new to this record, and not drift.**
  `pg_net` is enabled on the hosted project by the platform and no migration
  creates it, so the shadow database lacks it and migra proposes removing it.
  Do not act on this, and do not "fix" it by dropping the extension in
  production or by adding a `create extension` migration for something Supabase
  manages.

---

## 29. The mascot is gone, and subscriptions are a first-class record (2026-07-30)

Branches `remove-hornbill-mascot` (PR #67) and `subscriptions` (this PR).

### The hornbill, actually removed

#65 pulled the mascot off every screen except Settings > Our story, and that
one instance kept `hornbill_sheet.png` in the shipped bundle. Both are deleted
now, and no `hornbill`/`mascot` reference remains under `apps/`, `packages/`,
`supabase/`, `docs/` or `scripts/`. The generator scripts in `art/` are left
alone — they are art tooling, not app code.

Worth recording because the report was "the mascot still comes up when I start
the app", and that was never true of the code at that commit: the splash and
app icons are the penny coin (#65), the landing screen draws the coin
`HexBackground`, and the welcome screen is text only. The IPA in `build/` was
built after #65 and its only bundled image was the sprite sheet, reachable from
Our story alone. A bird at launch therefore means a build older than #65 is
still installed, or iOS is reusing its cached launch snapshot — the fix is a
fresh IPA plus delete-and-reinstall, not a reinstall over the top.

### Subscriptions (migration 18)

The dashboard already *inferred* recurring spend (`detectRecurring`: same
merchant, similar amount, 3+ Brunei months). That can only ever find what the
bank has texted about three times — never an annual plan, a subscription on a
card the user does not capture, or a trial that has not charged yet. The
declared half now exists as `public.subscriptions`, and the two are merged into
one list so nothing appears twice.

Owner decisions (2026-07-30), do not re-open:

- **Placement:** a dashboard card that opens a full screen, plus a row in
  Settings > Spending & data. **Not** a sixth tab — five is the comfortable
  maximum on a phone — and not Settings-only, because the whole point is
  opening the app and seeing what you pay for.
- **Merged, not parallel:** detected clusters appear as suggestions to confirm;
  confirming one carries `merchant_normalized` across, and a declared row
  claims its cluster so it stops being suggested. A **cancelled** row keeps
  claiming its cluster, otherwise cancelling something re-suggests it at once.
- **Full field set:** name, amount + currency, cycle (weekly/monthly/
  quarterly/yearly/custom-in-days), next payment date, category, billed-to
  card, trial end, start date, notes, active/cancelled.
- **No reminders.** Nothing here schedules a notification. The pre-existing
  per-merchant bill reminders (`bukit.reminders`, opt-in, off by default) are
  untouched and still hang off the detected rows in the dashboard card.
- **Never a budget input.** The real charge arrives as a transaction and is
  already counted against the monthly limit; adding the declared amount would
  double-count the same money. Every figure from this table is display-only,
  and each row instead *shows* the captured charge it matched ("Charged BND
  4.72 on 21 Jul 2026 — already in your spending") as proof it was counted.

Design notes:

- `src/lib/subscriptions.ts` holds all of it as pure functions
  (`test/subscriptions.test.ts`, 26 cases): monthly-equivalent conversion per
  cycle, month-end-clamped date arithmetic (31 Jan + 1 month = 28 Feb),
  `nextDueOn` rolling a stale stored date forward by whole cycles so a date
  entered in January is still right in July, loose merchant matching
  (`merchant_normalized` wins when set, else the typed name against the bank's
  string, names under 3 characters refused), and the merge itself.
- Unlike cycles are totalled via monthly equivalents; subscriptions outside the
  primary currency are excluded from the total and named in a note, matching
  how budgets and goals already behave (§17).
- The form is a pushed screen with an inline two-step delete, not a sheet with
  a confirmation dialog — a second `Modal` is the §28 freeze.
- Cancelled rows are filtered out of the dashboard card (they are excluded from
  the total either way, and listing what you no longer pay for under a monthly
  cost reads as a contradiction) but stay in a collapsed section on the screen.

Verified: `pnpm -r typecheck` and `pnpm -r test` (49 mobile + parsers +
handlers) green; `supabase db reset` applies 18 cleanly; psql proves the RLS
quartet, `anon` holding no DML, every check constraint refusing its bad row,
cross-account select/update/delete/insert all blocked, and the client's
`user_id`-defaulted insert path working under role `authenticated`;
`expo export --platform web` compiles; and the whole flow driven in the browser
against local Supabase — add, stale date rolling to "Due in 13 days", charge
matched to a real transaction, yearly showing BND 14.00/month, trial badge,
suggestion → confirm with no duplicate, edit, delete restoring the suggestion.

---

## 30. Dashboard trimmed; "failed to fetch" was a dead backend (2026-07-30)

Branch `trim-dashboard-and-legible-network-errors`.

### Three dashboard cards removed

Owner call: the dashboard repeated Insights. Removed **Daily spend**,
**Month by month** and **Top merchants**, leaving the donut hero, the
saved/spent strip, the budgets card and Subscriptions.

Coverage check before cutting, so the record is honest about what was lost:

- *Month by month* (last 6 months, plain bars) → **superseded** by Insights
  "Spending by months" (all 12 months of a selectable year, stacked by
  category). Strictly better.
- *Top merchants* (6 rows, current dashboard period) → **superseded** by
  Insights "Merchants" (year totals). The one thing that goes is a
  *per-month* merchant ranking; Insights only ranks by year.
- *Daily spend* (day-by-day area chart for the selected month) → **not in
  Insights at all.** The app now has no day-level view of spending anywhere.
  Removed as asked, and flagged to the owner; if it is wanted back it belongs
  on Insights, not the dashboard.

Also deleted with them: the `useTopMerchants` call, the `monthlyBars`,
`merchantRanking` and `dailyData` memos, the `LineChart`/`BarChart` imports,
`useWindowDimensions` + `chartWidth`, and the four `merchant*` styles.
`useMonthlyTotals` stays — "Spent this month" and the notification sync read it.

### "TypeError: failed to fetch" when adding a subscription

Not a bug in the feature. The tab under test was served by a **leftover
`expo start --web` from the previous session, launched with
`EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`** — and the local Supabase
stack it pointed at had been stopped at the end of that session. The app was
talking to a port with nothing behind it. The committed `.env` points at the
hosted project, where migration 18 is applied, so a server started normally was
never affected.

Two things came out of it:

1. **Kill dev servers when the session's stack goes down.** A running server
   with a dead backend looks exactly like a broken feature.
2. **`unwrap` now translates transport failures.** A `fetch` that never reaches
   an HTTP status surfaced its raw text — "TypeError: Failed to fetch" on web,
   "Network request failed" on native — which reads as a crash rather than "you
   are offline". `src/lib/netError.ts` maps those to "Could not reach the
   server. Check your connection and try again." **Server replies pass through
   untouched** — a constraint name or an RLS refusal is the useful diagnostic
   and must not be swallowed (`test/netError.test.ts` pins both directions).
   This applies to every query and mutation in the app, not just subscriptions.

Verified: `pnpm -r typecheck` green; `pnpm -r test` 53 mobile cases green;
`expo export --platform web` compiles; the trimmed dashboard and a successful
subscription add checked in the browser against a running local stack; then the
stack stopped deliberately to confirm the same add fails with the readable
message instead of the TypeError.

---

## 31. Policies brought current; no date is typed any more (2026-07-30)

Branch `docs-and-date-pickers`.

### The published policies were three months of features out of date

Both documents still carried their 16 July effective date, describing an app
without budgets, goals, subscriptions, manual entry, cash quick-add, CSV export
or feedback submission. Since §19 moved Pages to this repo's `docs/`, editing
these files *is* publishing them — there is no second copy to forget.

The one that mattered: **"Your data is not sold, shared, or transferred to any
third party" had become false** when §27 shipped the `feedback` function, which
POSTs to Resend. The fix states the true thing more strongly rather than
weakening the claim, because two different promises were collapsed into one
sentence:

- *Never sold, rented, or shared for anyone else's purposes* — this app can
  hold that absolutely, and now says so explicitly (no ad SDK, no analytics
  SDK, no data broker, no aggregator).
- *Processed by vendors on our instructions* — unavoidable for any hosted app.
  Supabase was already one; the old wording just called it "the app's own
  backend" and never named it a third party.

So there is now an **exhaustive named processor table**: Supabase (everything —
it is the database), Resend (feedback text, area, app version, and an 8-char
fragment of the account id — verified against `feedbackEmail` in
`_shared/feedback.ts`: **no email address, no name, no transaction**), and
Pwned Passwords (5-char hash prefix). Plus a note that reset mail goes through
whatever SMTP the Supabase project is configured with.

Worth keeping for whoever revisits this: **the absence of an aggregator is why
this list is three rows long.** Mint/Monarch/Copilot/YNAB/Spendee all route
through Plaid, MX or Yodlee — a third party holding bank credentials or
bank-derived transactions — then add analytics, attribution and, for the
ad-supported ones, offer partners. No-bank-connection is not only the store
story (§1); it is the reason the sharing section can stay this short.

Also added: a "kept only on your device" section (theme, currency, cloak,
reminder prefs, setup progress — and the point that bill reminders, weekly
summary and overspend alerts are *local* notifications, so nothing is
transmitted), a retention section, export/correct under Your controls, and the
account-deletion path corrected to Settings → Account → Danger zone (§17 moved
it and the policy was never updated).

Terms gained subscriptions/goals/budgets in §1, a 13+ line, the §17
shared-device token caveat stated for users rather than only in this document,
rate limits and the device cap under acceptable use, the no-FX-conversion and
"declared amounts are never spending" limits under Accuracy, and an
availability section.

**No governing-law or jurisdiction clause, deliberately** (owner call). Neither
store requires one, an individual operator cannot realistically litigate
cross-border, and absent a clause a court applies its own conflict rules —
which for a Brunei operator with Brunei users lands on Brunei law anyway. It
bought nothing. The 13+ line was added only because the privacy policy already
said under-13s are not the audience and two published documents contradicting
each other is a real, if small, problem.

### Every date input is a picker now

`DateSheet`, `TimeSheet`, `DateField` and `TimeField` live in
`components/ui.tsx`, reusing the calendar metrics of the range picker on the
transactions screen so the two read as one control. Five fields converted:
the three on the subscription form (next payment, trial end, started on),
manual entry's date + time, and the review inbox's single
`YYYY-MM-DD HH:mm` field, now split in two.

The range picker in `transactions/index.tsx` was **left alone on purpose** — it
works, it is field-tested, and its behaviour on a screen whose sheets §28 lists
as unverified is not worth risking for shared grid code. `MONTH_NAMES` /
`DAY_NAMES` are exported from `ui.tsx` so the constants cannot drift.

Decisions:

- **Tapping a day commits and closes.** With one date to choose there is
  nothing left to do, and a Done tap you cannot skip is pure friction.
- **Clearing is available two ways** — an X on the trigger (discoverable) and
  Clear in the sheet header. An optional date the user cannot un-set is a trap,
  which is what the typed fields accidentally avoided by being typed.
- **Manual entry's date is not clearable** (required, defaults to now); the
  review inbox's is, because an undated row is legitimate there.
- **In review, an unset time means midnight rather than a blocked confirm**, and
  clearing the date clears the time. This deleted the "Date must look like
  2026-07-16 12:30" error path outright — a malformed date is now unreachable.
- The subscription form's `parseDayKey` check survives as a guard on a value
  loaded from the database, not on typing.
- `DateField`/`TimeField` own their sheets, so a call site is one line. They are
  safe on pushed screens only — **never inside another Modal (§28)**. All five
  call sites qualify; `transactions/new.tsx` is reached by `AddSheet` calling
  `onClose()` *before* `router.push`, so no sheet is open above it.

Grid arithmetic went to `src/lib/calendar.ts` as pure functions with
`test/calendar.test.ts` (12 cases — leap February, a month starting on Sunday,
December rollover, multi-year steps), following the §28 precedent that this is
exactly the logic that silently breaks.

### Dashboard

A subscription with no due date now reads `Monthly` rather than
`Monthly · no date set`. The equivalent badge on the subscriptions *list*
screen was left as-is — that screen is where you would go to add the date, so
the label earns its place there.

### Not verified

`pnpm -r typecheck` clean and `pnpm -r test` 138 passing (65 mobile). The new
trigger renders correctly in `expo start --web`, **but no sheet was opened
once**: every CDP `Input.dispatchMouseEvent` to the tab timed out while
screenshots kept working and the console stayed clean, so the click-through
could not be driven. Given §28, treat "the date sheet opens, dismisses, and
clears" as an open item on the device checklist, not as done.

---

## 32. Mascot art deleted; the icon barrel import cost 419 KB (2026-07-30)

Branch `remove-mascot-art`.

### Owner is drawing the new pixel art by hand — do not fill the gap

**The app has no mascot and will not have one until the owner delivers new
pixel art, which they are drawing themselves and need time for.** Until then
the **penny coin is the only brand mark** (app icon, splash, Android adaptive
layers, `HexBackground`). Do not commission, generate, or reintroduce a mascot,
and do not regenerate the hornbill from history to "restore" anything — its
absence is deliberate and temporary by the owner's choice.

### What was deleted

Every hornbill file in `art/`: the nine animation GIFs, `hornbill_sheet.png`,
`icon_green.png` (a green-circle app-icon attempt), and all four generator
scripts (`hornbill_animate.py`, `hornbill_icon.py`, `hornbill_pixel.py`). §29
had deliberately left `art/` alone as "art tooling, not app code"; that call is
now reversed. `art/` holds only the coin: `coin_icon.py`,
`coin_platform_icons.py`, and three coin PNGs.

Two of those files (`hornbill_icon.py`, `icon_green.png`) were **untracked** and
nine were modified-but-uncommitted, and the owner chose to delete without a
preservation commit — so the most recent renders exist nowhere. Earlier
committed versions remain reachable in history, as always; **deleting files
does not remove them from a public repo's history** (§19), which here is a
harmless safety net rather than a concern.

Stale prose referring to the bird was corrected in
`art/scripts/coin_platform_icons.py` and the playbook's decision log rather
than left to mislead.

### `hornbill` in the shipped bundle was never the mascot

The §31 IPA's JS bundle contained the string `hornbill` once, which reads
alarmingly in a grep and prompted this cleanup. It was **not** mascot art and
no amount of deleting `art/` would have removed it:

`ui.tsx` (added in §31) imported `{ Ionicons } from '@expo/vector-icons'` — the
**barrel** — while all 13 other call sites in the app use the deep
`@expo/vector-icons/Ionicons`. The barrel pulls in the glyph map of every
family, and Font Awesome's *brands* set contains `hornbill` (a software
company's logo), alongside `hooli`, `hotjar` and `houzz`.

Measured on the same commit, `expo export --platform web`:

| Import | Bundle | `hornbill` |
|---|---|---|
| `{ Ionicons } from '@expo/vector-icons'` | 4,283,665 B | ×4 |
| `Ionicons from '@expo/vector-icons/Ionicons'` | 3,854,250 B | ×0 |

**419 KB of glyph names nothing renders.** Fixed to the deep import, with a
comment at the import site.

Two things to carry forward: **always deep-import an icon family** — the barrel
is a silent half-megabyte — and a string in a bundle is not evidence of your own
code. Check what else it sits next to in the string table before acting.

The §31 IPA predates this fix, so it carries the extra 419 KB and the string.
Functionally identical otherwise; not worth rebuilding for its own sake, but the
next build picks it up.

---

## 33. Goals: a `+` button, a detail screen, and progress becomes a ledger (2026-07-30)

Branch `goals-ledger`, PR #72, merged. **Migration 19 is applied to the hosted
project** — deploy record at the end of this section.

### The page is only goals now

Owner call: the Goals tab should be 100% the user's goals. The inline "New
goal" card is gone; a `+` in the header (matching Transactions, 26pt
`add-circle-outline`) pushes `goals/new`, which returns on save.

`goals.tsx` became a directory with a Stack (`_layout`, `index`, `new`,
`edit`), the pattern `subscriptions/` already established. Two incidental wins:
the Tabs entry no longer needs `headerRightContainerStyle: { paddingRight: 16 }`
because a native-stack header already gives header actions the standard 16pt
inset, and the old header **pencil edit-mode is deleted** — it only ever
revealed a Delete button.

**Editing is reaching the goal by tapping it** (owner chose this over a per-card
pencil, a header edit-mode, long-press, or swipe actions), consistent with
`subscriptions/`. Only the heading and the progress bar are inside the
`Pressable`: wrapping the whole card would swallow taps meant for the
amount field and Add button, which **stay on the card** as the fast path
because logging money is the frequent action.

That also retired the raw `Modal` the goal card used for its delete
confirmation, in favour of §29's inline two-step. §28 is explicit that a Modal
on a screen which may host another is the freeze, and that was latent here.

### `settings/goals.tsx` was dead code and is deleted

A second, older Goals screen — its own inline create form, its own card, an
**unconfirmed** delete, and BND hardcoded in `money()`. It was registered in
the settings Stack but **nothing navigated to it**; only a typed URL on web
could reach it. It would also have broken under migration 19. Deleted, along
with its `Stack.Screen`, and the Settings index note that advertised "savings
goals" under Spending & data now says "subscriptions" (which is what is
actually there).

### Progress is a ledger (migration 19)

`savings_goals.saved_amount` was one mutable number written by a
read-modify-write from the client. Three problems, and the third is what forced
the change:

1. **No history** — nothing recorded that BND 50 went in on 12 July.
2. **Racy** — two devices adding at the same moment lose one, each having read
   the same starting figure.
3. **No way to correct anything.** The only operation was "add", so a
   fat-fingered 500 instead of 50, or money genuinely taken back out, had no
   path at all. That was the reported gap.

`savings_goal_entries` now holds one signed row per deposit or withdrawal, and
`savings_goal_progress` (a `security_invoker` view, left-joined so a goal with
no entries still appears at 0) derives `saved`. **Correcting a mistake is
deleting the offending row**, which restores the figure exactly because the
total is a sum.

Decisions worth keeping:

- **One signed column, not an adds table and a withdrawals table.** They are
  the same event with opposite signs, and summing one column is what makes the
  total trivially correct. `amount <> 0` refuses a row that changes nothing.
- **`saved_amount` was dropped, not left as a cache.** A maintained duplicate
  recreates the two-sources-of-truth problem §19 complains about with the
  duplicated privacy policy — whichever one a future reader trusts, the other
  rots.
- **Backfilled before the drop.** Each goal with non-zero progress became one
  `Opening balance` entry dated from the goal's creation, so nobody loses
  progress and the totals still match what they saw. Goals at 0 get no row.
- **Target may be set below the amount saved** (owner call): the bar caps at
  100%, reads "Goal reached", and the detail screen says how far over you are.
  Lowering a target after overshooting is legitimate.
- Currency stays fixed at creation (§17) and is stated, not offered, on the
  detail screen.
- Two reads rather than a PostgREST embed in `useSavingsGoals`: the view is
  keyed on `goal_id` with no foreign key for PostgREST to follow, so it cannot
  be embedded. Both are tiny and owner-scoped.

**Verified locally** (`supabase migration up`, on a database seeded with goals
carrying real `saved_amount` values so the backfill was actually exercised —
a fresh `db reset` would have had nothing to back-fill):

| Check | Result |
|---|---|
| `saved_amount` dropped | gone |
| Backfill preserves the exact figure | `1250.50`, `99.99` |
| Zero-progress goal: no entry, still in view at 0 | `entry_count 0` |
| Insert without `user_id` → `auth.uid()` | own row |
| Negative amount lowers the total | `1450.50 → 1400.25` |
| Deleting the wrong entry restores the figure | back to `1450.50` |
| `amount = 0`, note > 200 chars | both refused |
| Forged `user_id`; entry against another user's goal; deleting another user's entry | RLS refused / 0 rows / `DELETE 0` |
| `anon` on table and view | `permission denied` (grant layer, §24) |

### Why the push needed care (done — see the deploy record below)

Migration 19 **backfills and then drops `savings_goals.saved_amount`**. The
backfill runs first in the same migration, and the local run proved it preserves
the figure exactly, but it was still a destructive schema change against real
data on a tier with no automated backups (§16.5) — so a data-only dump was
taken first. If a comparable migration is ever written again, take the snapshot;
it costs one command.

### Not verified

Typecheck clean, 138 tests pass, and the migration is proven on Postgres and
deployed. **No part of the new Goals UI has been exercised in a browser or on a
device.** Driving it needs a sign-in, which an agent cannot do. Still to check
by hand: tapping a card opens the detail screen while the Add row still
receives its own taps, the `+` pushes and returns, a withdrawal shows as `−` in
History, and removing an entry moves the total back.

### Deploy record (2026-07-30)

| Step | Result |
|---|---|
| `gh pr merge 72 --squash` | merged as `5f762bb`, CI green |
| Pre-push data snapshot (`supabase db dump --linked --data-only`) | 49 KB, kept out of the repo — the free tier has no automated backups (§16.5) and this migration drops a column |
| **Production held exactly one goal**: `Investments`, target 10 000.00 BND, `saved_amount` **0.00** | so the backfill had nothing to create and no progress could be lost — the mildest possible case for this change |
| `supabase db push` | migration 19 applied; `migration list` 19/19 local↔remote |
| Post-push dump: `savings_goals` column list | `id, user_id, name, target_amount, created_at, updated_at, currency` — **`saved_amount` gone, the goal row intact** |
| Post-push dump: `savings_goal_entries` | table present, **no rows**, as predicted |
| Anon REST probe on `savings_goal_entries` and `savings_goal_progress` | `401 42501 permission denied` on both |

That last row is worth reading precisely, per §24's table: a **`401` with
`42501` proves the objects exist and are locked at the grant layer**. A missing
table or view answers `404 PGRST205` instead. So one probe confirms both
creation and that migration 14's posture held for a new table and a new view.

**Not verified in production: the signed-in app**, the same gap §24 and §25
recorded for migration 14. `authenticated` is untouched by design and the whole
ledger was proven under role `authenticated` on the local stack. Opening the
Goals tab once on a build carrying this code is the confirmation.

**Any installed build predating this is now broken on Goals** — it reads
`saved_amount` via `select *` and writes it on Add, and the column is gone.
This is live, not hypothetical: the IPA in `build/ios-unsigned-0730/` is such a
build. Replace it before using Goals on the phone.

---

## 34. Goal entries become editable; the Log money control (2026-07-31)

Branch `goals-log-money-ui`. Field-test feedback on §33, all UI.

### One control for both directions

The detail screen had a three-field "Take money out" card while adding money
was a one-line row on the list card — the same event presented as two unrelated
operations, with the rarer one taking a third of the screen. It is now a single
**Log money** card: Money in / Money out chips, one amount field with a Log
button matching the list card's Add row, and date + note behind
"+ Add a date or note".

The disclosure **collapses again**, and collapsing resets the date to today and
clears the note. Keeping them would mean closing the section after picking last
Tuesday still logs against last Tuesday with nothing on screen saying so — a
hidden value that still counts is worse than losing a note you chose to hide.

The correction hint moved out of the logging form and up to the top of History,
next to the buttons that actually do it. "Take money out" and "fix what I
mistyped" are different intentions and were being explained in one paragraph.

### The history row

Three states: `⋯` at rest → **Remove · Edit · Keep** in place of the icon →
editing in place.

- **The actions replace the icon** rather than opening a panel below, so the
  row keeps its height and the decision stays under the finger.
- **Remove is furthest from Keep, with Edit between them.** The destructive
  button and the one people reach for to back out must not be neighbours.
- **`ellipsis-horizontal`, not a pencil.** A pencil that offers only Remove and
  Keep promises an edit it does not deliver; three dots promise choices, which
  is what happens. (Once Edit became real this mattered less, but the icon
  still describes a menu, not one action.)
- **Editing is real**: Money in/out, amount, date and note, via
  `useUpdateSavingsGoalEntry`. Migration 19 already granted the update policy,
  so no schema change. Correcting a wrong amount, date, or direction no longer
  means deleting the row and logging it again.
- Zero is refused client-side because `amount <> 0` refuses it server-side —
  Save stays disabled rather than submitting a guaranteed constraint error.
- `rowActions` is `flexShrink: 0` and the amount/date lines are
  `numberOfLines={1}`: three pills beside a long amount is tight at 360pt, so
  the text gives way, not the controls.

**Verified against Postgres** (rolled back): flipping a deposit to a withdrawal
updates amount, date and note and the derived total follows (`1250.50` →
`-200.00`); `amount = 0` is refused by the check constraint; editing another
user's entry is `UPDATE 0`.

### Two bugs found on the way

**`Muted` had no `lineHeight`** (`ui.tsx`), so descenders were cropped — React
Native Web puts `overflow: hidden` on every `View`, and a line box tight to the
glyph height slices a "g" sitting above a border. Fixed globally with
`lineHeight: 18`; it was latent everywhere `Muted` sits above a divider, not
just on this screen.

**The Remove pill used `onPrimary` for its label**, which is near-black — tuned
for the yellow and blue primaries and unreadable on the red danger fill. Now
explicit white, with a comment so it does not get "corrected" back.

**`HexBackground` snapshotted `Dimensions.get('window')` at module load**, so
the coin field kept whatever width the page first opened at and never
re-laid-out on resize or rotation. Now `useWindowDimensions` with fractional
positions, plus an explicit `overflow: hidden`.

That last one was found while chasing a reported sideways scroll on the
signed-out pages. **It was never reproduced** — the landing DOM does not
overflow at 430/414/393/375/360/320pt, the viewport meta is correct, `body` is
already `overflow-x: hidden`, and forcing a 1200pt-wide SVG into the wrapper
produced no scroll because RN Web already clips it. The owner reports the
scroll is gone; whether this fix is why is **unproven**. Do not record it as
the cause.

### Not verified

Typecheck clean, 138 tests pass, entry editing proven in SQL. The UI itself was
exercised by the owner against the local stack, not by an agent.

---

## 35. Third security pass (2026-07-31) — the bounds nobody set

§18 audited RLS, the ingest function, auth flows and token storage. §23 covered
the anonymous surface as deployed, the limiter's arithmetic, and parser
behaviour on hostile input. §24 fixed the `anon` grants. Every one of them
asked **who may write this row**. None asked **how big the row may be**, and
none went back over the surfaces added after them: `feature_requests`
(migration 16), the `feedback` function (§27), `savings_goal_entries`
(migration 19).

This pass is migration 20 plus two edge-function changes. A second PR carries
the client-side fixes; they are separate because **there is no OTA channel —
`expo-updates` is not a dependency**, so every client fix waits for a new
binary while everything here deploys in minutes. That asymmetry is worth
remembering when triaging anything security-related from now on: prefer the
server-side fix when both are available.

### The application layer was stating rules the database did not enforce

That is the shape of four of the five findings, and it is worth naming because
it predicts where the next one will be.

**Text columns had no length bound at all.** `04_grants.sql` gives
`authenticated` direct INSERT on every table, so every cap living in
application code is reachable around it: the ingest function's 4 KB
`MAX_TEXT_BYTES` and the feedback function's 4,000-character `MAX_DESCRIPTION`
are both bypassed by a plain PostgREST insert with the app's own anon key and
any signed-in session. One account could fill the 500 MB free-tier database
(§16.5) a `notes` field at a time. `18_subscriptions.sql` already does this
right — `check (length(btrim(name)) between 1 and 80)`. The pattern was known;
it was just never applied to the tables that predate it.

All constraints are added `NOT VALID`, and that is not a hedge: a `NOT VALID`
check constraint is **fully enforced on INSERT and UPDATE** from the moment it
exists. What it skips is the scan proving existing rows comply — the part that
could fail a deploy or lock live data for no security gain. The `VALIDATE`
statements are listed at the foot of migration 20 to run separately.

**`/feedback` had no quota of any kind.** `/ingest` got a durable Postgres
limiter across migrations 12 and 13 after two rounds of analysis; the feedback
function shipped two days ago with none. Signup is free, and §23 already
established that "needs an account" is not a control here. The quota lives in
Postgres as a `before insert` trigger rather than in the function, for three
reasons: `feedback/index.ts` deliberately holds no service-role key, so calling
a service_role-only limiter would give that property up; the insert happens
*before* the email, so bounding the row bounds Resend for free; and a trigger
also binds the direct-PostgREST path the function cannot see. 5/hour, 20/day.
`SECURITY DEFINER` is required, not decorative — both tables are insert-only by
design, so an invoker-rights function would count zero rows every time and the
quota would never fire.

**A goal entry could name a goal the caller does not own.** Migration 19's
insert policy checks `user_id = auth.uid()` and nothing else; `goal_id` was
constrained only by its foreign key to `savings_goals` — to the table, not to
the caller's rows in it. Contained today (both readers are RLS-scoped, so the
rows are orphans only their author sees), but it is a valid/invalid oracle for
goal UUIDs and it stops being contained the moment anything sums entries
without joining back through `savings_goals` — which is exactly what migration
19 exists to encourage.

**"Remove is only for revoked devices" was a UI claim.** §19 decided removal is
offered only on already-revoked devices because `last_seen_at` on a revoked
token is the evidence of when it was last used. The devices screen honours it;
`02_rls.sql`'s delete policy never did.

### The ingest body was read before anything checked it

`index.ts` called `await req.json()` before `handleIngest`, which is where both
rate-limit budgets live. `verify_jwt = false` on this function, so an
unauthenticated peer could make us materialise and parse a multi-megabyte body
per request, and the peer budget could not help — it is evaluated *after* the
parse it would be protecting. A `content-length` gate now runs first.

Two things that had to be got right, both found by testing rather than by
reading:

1. **Cancel the stream before responding.** Returning a response while an
   unread body is still arriving makes the runtime log `user body write
   aborted` and drop the connection, so the caller sees a hang or a 504 instead
   of the 413. `await req.body?.cancel()` fixes it.
2. **The limit is `MAX_TEXT_BYTES * 2 + 1024`, not `+ 1024`.** JSON escaping
   can double the text's byte count — every `"`, `\` and control character
   serialises to two bytes. The first version rejected a message at exactly the
   documented 4 KB limit if it was quote-heavy. A limit that refuses input the
   contract promises to accept is a bug, not a tighter bound.

A missing or unparseable `Content-Length` is refused rather than allowed
through: `fetch` and the Shortcut both set it for a JSON body, and chunked is
the one shape that could stream past a length check.

### The feedback area is an allowlist now

`area` is the one piece of caller-supplied text reaching the **subject line**
of an outgoing email. `parseFeedback` only trimmed and length-capped it, so CR
and LF survived, and whether a newline in a subject becomes a header injection
then depends entirely on how Resend sanitises the field — not a guarantee this
code gets to make on someone else's behalf. The client can only ever send one
of six literals, so only those six are accepted. An off-list value is
**dropped, not rejected**: the description is what matters and must never be
lost over its label.

### The client half: a formula in someone else's spreadsheet

The one finding in this pass with a path to code execution on a third party's
machine, and the only one that needed no account at all — just the victim's
phone number.

`csvField` in `exportCsv.ts` quoted correctly for RFC 4180 and did nothing
about the actual risk: a spreadsheet treats a cell beginning with `=`, `+`,
`-`, `@`, tab or CR as a **formula, quoted or not**. Quoting is not a defence;
only changing the leading character is.

Why that lands here specifically. Step 4 of the capture guide tells users to
leave "Sender" empty, so the automation fires on any message matching a bank's
format from anyone; `handler.ts` treats `sender` as a parser hint only; and
`baiduri.ts`'s `MERCH` captures everything between its labels. So a text
message reading `Card No.: 4x0213 Amount: BND 1.00 Merchant:
=HYPERLINK("http://…"&A2,"Receipt") Date: …` lands in the ledger as a
`parse_status: parsed` row at confidence 1.0. Export, open in Excel, and the
sheet runs the sender's formula over the owner's spending history.

**Fix:** the pure half of the export moved to `src/lib/csv.ts` (the shape
`txFilters.ts` and `subscriptions.ts` already use — pure logic split out so it
can be tested without expo-file-system, expo-sharing and a Supabase client),
with two functions instead of one:

- `csvField` — quoting only. For values this app generates: dates, amounts,
  enums.
- `csvText` — quoting **and** an apostrophe prefix on a leading formula
  trigger. For everything a bank message or a user can write: `merchant`,
  `raw_text`, `notes`, and the category name.

The split is deliberate and is the part to not "simplify" later: **an incoming
transaction is a negative amount**, and neutralising `-12.50` would turn a
number into text and break every sum in the exported sheet. Neutralising the
wrong column is its own bug. There is a test pinning exactly that.

**And the reset path revokes siblings now.** `reset-password.tsx` called
`updateUser({ password })` and stopped. GoTrue does not invalidate sibling
refresh tokens on a password change, so a token captured from another device
survived the reset. SEC-4 (§18) fixed only the signed-in path — Settings >
Account signs out globally before mailing the link — and left the one that
matters: someone whose account is compromised **cannot sign in**, so they
arrive through "Forgot password" on the sign-in screen, where nothing was
revoked at all. Now `signOut({ scope: 'others' })` runs after a successful
change. Its failure is logged, not surfaced: the password is already changed by
then, and sending the user back to a form for a step that succeeded is worse
than the residual risk.

`zod` was also dropped from `apps/mobile` — declared, never imported anywhere
in the workspace, shipping in the bundle.

### Verified

Migrations 01–20 applied clean on a full `supabase db reset`, then fifteen
checks run against local Postgres as the two seeded users — all GOOD:

- Normal rows still insert; 201-char merchant, 2001-char notes, 4097-char
  `raw_text`, malformed `card_last4` and a free-text goal currency all refused.
- Entry on own goal accepted; the cross-account entry refused by RLS **and**
  re-pointing an owned entry at another user's goal refused by the `with check`.
- Active device not deletable, revoked device deletable (so removal still works).
- 81-char device name refused, ordinary name still works.
- Feedback quota: 5 accepted, 2 refused out of 7.
- A 4001-char description straight to the table refused — the path that
  bypasses the edge function entirely.
- Regression: user A still sees 0 of user B's transactions.

Against the local edge runtime, after a clean stack restart:

| body | result |
|---|---|
| 4 KB of `"` (8,220-byte body) | `200` — the escaping case that broke the first attempt |
| 4,096-char text | `200` |
| 4,097-char text | `422 text_too_large` |
| 9,000-char text | `422 text_too_large` |
| 10 KB / 25 KB / 40 KB / 50 KB body | `413 payload_too_large`, ~8 ms, no parse |

The CSV fix is pinned by 20 tests in `apps/mobile/test/csv.test.ts`, one of
which runs **the whole chain with no hand-written intermediate**: a crafted
Baiduri SMS through the real `parseBankMessage` into `buildCsv`, asserting
first that the parser really does extract the payload as `merchant` (so the
test cannot go vacuous if parsing changes) and then that no cell in the output
begins with a formula trigger.

Typecheck clean; 161 tests pass across the workspace — feedback gained 4, the
CSV module 20.

### Not verified

**The 413 is only delivered cleanly up to ~50 KB locally.** At 200 KB and above
the local stack leaves the connection to time out instead of returning the
response — the ordinary HTTP/1.1 outcome when a server stops reading while the
client is still writing. The security property still holds and was confirmed:
the body is never materialised or parsed, no database round trip happens, and
**the worker stays healthy** (a normal request immediately afterwards returns
200).

> **Resolved on deploy — see the record below.** The guess written here was that
> production, sitting behind Cloudflare and Kong, might return the 413 cleanly
> at any size. Half right: it is clean to at least **200 KB** (four times the
> local ceiling, in 0.35 s), and 500 KB and 2 MB still hang. Do not "fix" that
> by removing the gate.

**Neither client fix has been run in the app.** The CSV rendering is proven by
unit tests over the real parser output, but nobody has tapped Export and opened
the file in Excel or Numbers; and `signOut({ scope: 'others' })` is proven by
nothing at all — verifying it needs two signed-in devices and a reset between
them. Both need a fresh IPA to reach a phone regardless (no OTA channel), so
the natural place to check them is the next build.

### Deliberately not fixed

Two findings were raised and closed as accepted risks by owner decision
(2026-07-31). Recorded here so they are decisions rather than oversights.

**Account deletion and password change require no reauthentication.**
`delete_account()` checks only that `auth.uid()` is not null; the "type DELETE
to confirm" gate is a `disabled` prop on a button, i.e. a client-side check on
an irreversible cascading delete. Anyone holding a valid JWT can call the RPC
directly. `updateUser({ password })` has the same shape — a session takeover
converts straight into permanent account takeover. Accepted because Sign in
with Apple is planned for the TestFlight stage (§18) and removes the password
from this flow for most users, making reauthentication work that would be
rebuilt. **If Sign in with Apple slips, this should be reopened.** The
server-enforceable version, for whoever does: `delete_account()` can require a
recent authentication itself by checking the JWT's `amr` timestamps —

```sql
if not exists (
  select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
  where (a ->> 'timestamp')::bigint > extract(epoch from now()) - 300
) then raise exception 'reauthentication required'; end if;
```

A token refresh does not add an `amr` entry, so that genuinely means "signed in
within the last five minutes" and holds against a stolen JWT.

**Capture accepts a bank-format SMS from any sender.** Step 4 of the setup
guide tells users to leave "Sender" empty, and `handler.ts` treats `sender` as
a parser hint only. Anyone who knows a user's phone number can write arbitrary
rows into their financial history. This is also the delivery vector for the
CSV-injection finding fixed in the client PR. Accepted: the per-bank automation
is what makes capture survive a card replacement, fixing the CSV sink removes
the sharp edge, and the residual harm is junk transactions the user can delete.
**It is a security decision, not just a setup instruction** — that is why it is
recorded here and not only in `shortcut-setup.tsx`.

### Owner action at merge

1. `supabase db push` for migration 20, then run the `VALIDATE CONSTRAINT`
   block at the foot of that file — a failure names the row to fix and changes
   nothing else.
2. `supabase functions deploy ingest feedback`. Both changed.
3. Re-run §23's logged-out probe set. It remains the cheapest regression test
   this project has.
4. Confirm against production what the local stack could not: that an oversized
   body returns 413 rather than hanging, and that the feedback quota fires.

### Deploy record (2026-07-31)

Pushed to `pzjroqwllrzcbpiugpxl` **ahead of the PR merging** (owner instruction).
Production therefore carried migration 20 before `main` did; the migration was
byte-identical on the branch and in the PR, so the window was procedural rather
than a divergence in content. Noted because §24 was found by exactly the kind of
drift that starts this way.

**Migration 20 applied.** `supabase db push` reported one pending migration and
applied it clean.

**All 14 constraints then VALIDATE'd against production data — every one
succeeded**, i.e. no historical row in this project violates any of the new
bounds. Confirmed in the catalogue rather than inferred from an empty result:
`select conname, convalidated from pg_constraint` returns 14 rows, 0 with
`convalidated = false`. Run with `supabase db query --linked -f`, which is the
way to execute ad-hoc SQL against the hosted project without a raw connection
string — worth knowing, it is not in any of the deploy docs here.

**Both functions deployed** (`supabase functions deploy ingest feedback`).

**`verify_jwt = false` survived the deploy** — the thing that would have broken
every capture. Confirmed twice: an invented bearer token and *no* Authorization
header at all both return the function's own
`{"status":"error","error":"invalid_token"}` 401, not a gateway JWT error.

**The body gate, measured in production:**

| body | production | local, for contrast |
|---|---|---|
| 25 KB | `413` | `413` |
| 200 KB | `413` in 0.35 s | connection hangs |
| 500 KB | hangs | hangs |
| 2 MB | hangs | hangs |

Function healthy after every one. So the ceiling for a *clean* 413 is ~200 KB
here versus ~50 KB locally — Cloudflare and Kong buffering, as guessed, but the
guess that it would hold at any size was wrong. Nothing is parsed either way.

**§23's logged-out probe set re-run, and it is now stricter than §23 recorded.**
That section noted `200 []` on every table (RLS answering) and the eight global
`categories` rows. Today every one of `transactions`, `profiles`,
`ingest_devices`, `bug_reports`, `feature_requests`, `user_cards`, `budgets`,
`savings_goals`, `savings_goal_entries`, `subscriptions`, `categories` and
`ingest_rate_limits` returns `42501 permission denied` — the *grant* answering,
before RLS is consulted. The four views likewise. That is migration 14 (SEC-8)
working: two layers where §23 still had one. Forged inserts into `transactions`,
`ingest_devices`, `bug_reports` and `savings_goal_entries` all `42501`;
`delete_account` `42501`; `create_ingest_token`, `revoke_ingest_device`,
`resolve_ingest_device` and `rate_limit_bump` all `404 PGRST202`. `/feedback`
with no auth header is `401`. **Update §23's expected output if you use it as a
checklist — `200 []` there is now stale.**

### `supabase db advisors`: a real lead, an unreliable headline

Run afterwards as an independent check. It is not in any runbook here and now
is — see `docs/db-advisors.md`, added with migration 21.

**Read this before trusting an advisory's description.** The first version of
this section said the advisor "found what three manual passes missed" and left
it there. That was too generous to the tool, and probing each advisory changed
the picture enough to be worth writing down properly.

**What the advisor said.** `handle_new_user()` "can be executed by the `anon`
role as a `SECURITY DEFINER` function via `/rest/v1/rpc/handle_new_user`."

**What is actually true.** The grant is real — EXECUTE on that function was
held by `anon` and `authenticated`, the only function in the schema whose
exposure nobody chose. **The route is not.** PostgREST does not expose
functions returning `trigger`; that path returns `PGRST202 — no matches were
found in the schema cache`, verified against production. Believing the summary
would have meant believing anon could invoke a `SECURITY DEFINER` function
against `profiles`.

**And the item it ranked quieter was the reachable one.** `base62_encode`
returns `text`, so PostgREST *does* route it — an anon call returns `PGRST102`
(function found, body rejected), not `PGRST202`. That is the one that was both
exposed to anon and inside the token-minting path.

**Neither `search_path` advisory had an exploit path here**, for two
independent reasons, both checked rather than assumed:

1. `pg_catalog` is implicitly searched **first** unless named explicitly in the
   path, so a planted `public.trunc()` could never shadow the built-ins these
   functions rely on.
2. `has_schema_privilege('anon','public','CREATE')` and the same for
   `authenticated` both return **false** — there is nowhere to plant the bait.

So: user-facing impact, none. Developer-facing value, real but modest — each
was a fact a future audit would have to re-derive, and this pass spent four
probes doing exactly that.

**Fixed anyway in migration 21**, plus a fourth item the advisor does not look
for (it only inspects `SECURITY DEFINER` functions): EXECUTE on
`base62_encode` and `touch_updated_at` revoked from the API roles altogether.
No client has ever called either — every `base62_encode` call site is inside
`create_ingest_token`, which is `SECURITY DEFINER` and so runs it as
`postgres` regardless. Pinning the search_path on an endpoint that should not
be reachable is the smaller half of the fix.

After migration 21 every function in `public` has a pinned `search_path`, and
the only ones executable by an API role are the three the app actually calls:
`create_ingest_token`, `delete_account`, `revoke_ingest_device`.

The remaining advisories are those same three RPCs (intended design) and
leaked-password protection being off (the §18 cost decision). All four are now
recorded as an explicit baseline in `docs/db-advisors.md`, so a future run
shows only what is *new*. A linter whose output is 60% known-noise gets
skimmed, then ignored, and is then worse than not running it.

**The reason to keep running it is none of the above.** It is
`rls_disabled_in_public`: `04_grants.sql` grants `authenticated` full DML on
every future table by default, so a table that ships without `enable row level
security` is readable and writable by every signed-up user, and signup is free.
Migration 14 closes with precisely that warning, enforced until now by nothing
but somebody remembering. That check is worth the whole exercise; today's three
findings were not.

### Still to verify after this deploy

The quota and the constraints were proven against **local** Postgres with two
seeded users (fifteen checks, §35 above). Against production only the
anonymous surface was probed, because doing better means writing rows into the
owner's real account — five bug reports to watch the sixth be refused, and a
savings goal to attach an entry to. Worth doing deliberately on a throwaway
account rather than incidentally here.

### Migration 21 deploy record (2026-07-31)

Verified locally on a clean `supabase db reset` (01–21) before pushing, because
two of the four changes touch things that would fail *silently* if wrong:

- **Sign-up still works after revoking EXECUTE on `handle_new_user`.** A real
  `POST /auth/v1/signup` through GoTrue, then confirming the `profiles` row
  exists with its `display_name` from `raw_user_meta_data`. A trigger's EXECUTE
  privilege is checked at `CREATE TRIGGER` time, not when it fires — worth
  proving rather than remembering, since getting it wrong breaks every new
  account and nothing else.
- **`updated_at` still advances** on an UPDATE (`touch_updated_at`, now
  `search_path = ''`).
- **`create_ingest_token` still mints a 46-character token** (`base62_encode`,
  now `search_path = ''` and revoked from the API roles).
- The full `pg_proc` table shows every function with a pinned `search_path`,
  and `anon_exec = false` on all eleven.

---

## 36. Deleting the app now signs you out (2026-07-31)

Branch `fresh-install-signs-out`. Found in the field: the owner deleted the app,
sideloaded the new IPA, and landed straight on the dashboard still signed in.

### It is standard iOS behaviour, and that is the problem

iOS wipes an app's **container** on delete — Documents, Library, Caches,
`NSUserDefaults` — and leaves the **Keychain** alone. Apple tried changing this
in an iOS 10.3 beta and reverted it before release; persistence has been the
behaviour ever since. `supabase.ts` gives supabase-js an `expo-secure-store`
adapter with `persistSession`, so the refresh token lands in the Keychain and
outlives the app. Reinstall, and `getSession()` finds a live token.

So: not a bug, and plenty of apps keep it. It is still wrong **here**. Deleting
the app is the gesture most people use to mean *my spending history is off this
phone*, and the failure case — sell, lend or hand over a handset, the next
person reinstalls, and the dashboard opens on someone else's money — is the
exact trust story this product is sold on. A fresh install starts signed out.

This is the same class as §18 SEC-1 and the theme reset in §28: Keychain
survival quietly making device-local state outlive the thing it belongs to.

### Why it lives in the storage adapter and not in `SessionProvider`

The obvious shape is an effect that calls `supabase.auth.signOut()` on a fresh
install. Both reasons it was rejected are worth keeping, because they are the
kind of thing a later "simplification" walks straight back into:

- **Ordering.** The GoTrue client reads storage *while `createClient` is still
  running*. An effect signing out afterwards is racing a session that is already
  in memory and will be re-persisted on the next refresh. Everything supabase-js
  reads goes through the adapter, so there is no race to lose.
- **The network.** `signOut` calls the logout endpoint **even at
  `scope: 'local'`**, and on any error that is not 401/403/404 it returns early
  *without* clearing local state. A fresh install with no signal would have
  stayed signed in — and permanently, because the marker is consumed on that
  same launch and never reports `true` again. Deleting the value needs no round
  trip and cannot fail open.

`readAuthKey` purges each auth key once per process, on first read. The
`purgedKeys` set is load-bearing in the other direction too: without it the
purge would fire on every read, and the read after sign-in would delete the
session just written. `setItem` marks the key as well — a value written this
session is this session's.

What this guarantees is that the credential is **gone from the handset**. The
refresh token stays valid server-side until it expires; revoking it needs the
network call this deliberately avoids.

### `isFreshInstall()` was first-caller-wins

Detection *creates* the marker, so it answers `true` exactly once per install.
`ThemeProvider` already called it — and it is a **child** of `SessionProvider`,
so React's bottom-up effect order would have handed the theme the only `true`
and left the session check believing every launch was an update. The sign-out
would have silently never happened, on a device, with green tests.

`createFreshInstallGate` memoises the *promise* (not the resolved value, so
concurrent callers share one detection) and `isFreshInstall` is now the gated
singleton. **Any future caller must go through it.** Five cases in
`test/installMarker.test.ts` cover the memoisation; the detector itself needs
expo-file-system and stays untested, which is why it is a separate function.

### What is deliberately *not* cleared

The ingest token (`bukit.ingest_token.<uid>`). Capture runs independently of the
app — the Shortcut POSTs on its own and holds its own copy in iCloud Drive — so
clearing it would break capture for a user who did nothing but reinstall, and
they would have no way to connect the two. It has been user-scoped since SEC-1,
so it cannot cross accounts. A token belonging to a previous owner of the phone
is unreadable by any other account and revocable from Settings > Capture.

### Scope, and what this does not cover

Offloading an app keeps the data container, so the marker survives and the user
stays signed in — correct, offload is not a deletion of intent. Same for
updates, and for a restore from backup (the marker comes back with the
container). Only a real delete-and-reinstall signs out.

Not covered: someone holding an unlocked phone with the app still installed.
That is an app lock (Face ID on launch), considered and deferred as a separate
piece of work — it does not remove the stale token from the Keychain, so it is
an addition to this, not an alternative.

One cost worth remembering during sideload testing: re-signing over the top of
the existing install keeps the container and the session, but a delete-first
cycle now means signing in again. That matters more than it sounds while reset
emails still land in spam (§15, Gmail SMTP).

### Verification status

`pnpm -r test` (167) and `pnpm -r typecheck` green. **Device behaviour is not
yet verified** — Node tests cover the gate's memoisation and nothing else. Still
to check on the phone:

- Delete, reinstall, launch → the landing screen, not the dashboard.
- Sign in, force-quit, relaunch → still signed in (the purge must not re-fire).
- Install the next build *over* the top → still signed in.
- After a fresh install and sign-in, capture still works without redoing the
  Shortcut setup.

---

## 37. The shortcut is called "Bukit Pennies" now (2026-07-31)

The owner rebuilt and re-shared the capture shortcut under the shorter name
**`Bukit Pennies`** (was `Bukit Pennies Capture`). New iCloud link:

```
https://www.icloud.com/shortcuts/e639f5c27dd34f1191a81eeaa80ea27e
```

`SHORTCUT_DOWNLOAD_URL` in `apps/mobile/src/lib/env.ts` points at it. The old
link is superseded; the §15 and §16.4 entries carrying it now say so.

### The rename broke Step 3, silently

"Send the token to the Shortcut" opens
`shortcuts://run-shortcut?name=Bukit%20Pennies%20Capture`, and that name was a
string literal at the call site. Renaming the shortcut left the deep link
pointing at something that no longer exists, so the token went to a shortcut
called `Bukit Pennies Capture` — the owner saw this on-device before the link
was even updated.

**How it fails is the reason to care.** iOS does not report an unresolvable
`run-shortcut` name; it opens the Shortcuts app and nothing runs. There is no
error for the user to act on and nothing for the app to catch, so the only
symptom is capture quietly never working, on the one screen where a new user
has least ability to tell setup from breakage. §17's onboarding-funnel watch
would have shown this as tokens created but `last_seen_at` staying null —
i.e. indistinguishable from ordinary drop-off.

### The name is one constant now

`SHORTCUT_NAME` sits beside `SHORTCUT_DOWNLOAD_URL` in `env.ts` — the two must
be republished together, so they belong together. It feeds the deep link *and*
every on-screen mention: setup Step 4's action list and the "Allow … to send 1
text item" note. Those were separate literals, so before this the instructions
could drift from the link, or from each other, one edit at a time.

`docs/shortcut-authoring.md` states the rename rule at the point where the
shortcut is named, and again under Publish.

### Two dead shortcut builders, deleted

`scripts/build-shortcut.mjs` and `.github/workflows/ios-shortcut.yml` are gone.
The first pass on this left them alone on the grounds that a stale name marks
them as belonging to the old design — a weak argument, and the wrong shape of
one in a change whose whole point was removing that kind of drift.

They were dead twice over:

- **They cannot run.** The workflow signs with `shortcuts sign` on a macOS
  runner, and §15 records that this needs an iCloud login on every GitHub
  runner. It has never produced an artifact and cannot.
- **They build the wrong thing.** `build-shortcut.mjs` bakes in
  `PASTE-YOUR-TOKEN-HERE` — the hardcoded-token design superseded on
  2026-07-19 by the self-configuring shortcut. The app links to the owner's
  iCloud link, not to the GitHub release these publish to.

Reviving them means rewriting `build-shortcut.mjs` for the self-configuring
design *and* solving the signing problem that killed them. Neither gets easier
for the files having sat in the tree. §15 keeps the record of why they existed
and git keeps the code.

### The visual guide is gone too

`settings/shortcut-visual-guide.tsx`, its route in `settings/_layout.tsx`, and
the "Prefer pictures? Open the visual guide" button in Step 4. Every one of its
seven slots still rendered "Screenshot coming soon", so the button promised
pictures and delivered seven empty dashed boxes — worse than not offering it,
on the screen §22 identifies as where onboarding is won or lost.

**This does not close §22's "still open — the real lever".** Screenshots or a
30-second recording of the step-4 automation remain the highest-value
onboarding work there is; what was deleted is the empty shell standing in for
them, not the plan. When they arrive, the scaffold is one `git show` away.

### Not verified

The link and the name are the owner's; neither the download nor the token
handoff has been exercised from a build carrying this change. On the phone:
download from Step 2 adds a shortcut named `Bukit Pennies`, and Step 3 lands on
the "Connected. Capture is ready." notification rather than opening Shortcuts
and stopping.

## 38. Strategy + the two next features (2026-08-02)

The owner answered the roadmap questions (§16.4) and the session's two
Transactions questions. All of it is now decision-logged (playbook §6) so it is
not re-litigated; this section is the working roadmap and the build spec for the
next implementation session. **PR #87 merged this day**: the auth coin field
now paints per-screen (each auth screen sets `colors.bg` and mounts
`<HexBackground/>`; `(auth)/_layout.tsx` is a plain Stack again),
`DismissKeyboardView` skips its dismiss on web, and money pairs render
`BND 100.00 / 500.00` via `formatMoneyPair` + cloak-aware `pair()`.

### North star and sequence

Success = a mix of installs, daily users, and captured-transaction volume. The
agreed order:

1. **Store launch readiness** — Apple Developer enrolment (owner, $99),
   `apps/mobile/eas.json` placeholders (anon key, Apple Team ID, ASC App ID),
   and the `docs/testflight-deploy.md` runbook (EAS build → TestFlight →
   on-device checklist). This is the first milestone.
2. **DAU pillar** — iOS home-screen widget, a monthly shareable spending
   report (doubles as a viral loop), and a net-worth screen.
3. **Installs pillar** — referral/invite, the shareable report's web presence,
   then Android (only after iOS ships).
4. **Capture pillar** — promote the SCB skeleton when real SMS samples arrive
   (the Review inbox is the collection loop; playbook §7 procedure), and grow
   the Brunei merchant map.

Deferred deliberately: e-wallet and recurring-bill parsers (unreliable texts;
card auto-debits already arrive via bank SMS; low ROI per parser). Freemium is
open — launch free/simple, keep the schema future-proof, no monetization
plumbing now. English-only UI. Single developer.

### Next features (agreed, built 2026-08-02 in PR #89)

**1. Transactions default = last 30 days.** On first open the Transactions
screen shows the newest transactions within the past 30 days (Brunei time),
newest-first, with infinite scroll past it. **Built**: `recentWindowStartKey()`,
`defaultListFilters()` and `isRecentWindow()` in `src/lib/txFilters.ts`
(`RECENT_WINDOW_DAYS = 30`); the list initialises from `defaultListFilters`
and the date chip reads "Last 30 days". The window is a true default, so it
does not light up "Reset all" or the empty state; "Reset all" returns to the
window, and clearing the date sheet returns to all time. Paging stays at 50.

**2. Reset all transactions.** A user-facing destructive action on
**Settings → Spending & data** (`app/(tabs)/settings/spending.tsx`), below the
Export button, confirmed by typing **RESET TRANSACTIONS** (the owner specified
that phrase — not "DELETE"). **Built**: `reset_transactions()` RPC (migrations
24 + 25) returns the count deleted, is **SECURITY INVOKER** (RLS
`transactions_delete` is the gate — no definer exception for a data-destruction
RPC, migration 25 explains), `revoke`d from `public, anon`, granted to
`authenticated`. Deletes the account's `transactions` rows only;
`transactions.category_id` is a column on the row (migration 01), so the
category mapping goes with it — there is no assignment table. Budgets, goals,
subscriptions, cards, capture tokens and settings survive; the global default
`categories` rows (user_id null) are untouched. After success the screen
invalidates every transaction-derived cache via `invalidateTransactionQueries`.
Verified locally (guard + two-user delete scope) and migrations 24–25 pushed to
hosted; advisors clean.

