# Bukit Pennies — Project Handoff Document

**Status:** Planning complete and approved. **No code has been written yet** — the repo contains only this document. This file is the single source of truth for picking up implementation.

**Branch:** `claude/card-spending-logger-bem2c9`
**Date:** 2026-07-16

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
1. **Share Extension** (`expo-share-extension` config plugin): shared text → parse preview → POST /ingest; token shared via App Group keychain.
2. **Paste screen** (pure JS, works day one).
3. **Shortcuts automation** (documented + in-app guide): "When I get a message containing 'Merchant:' from [Baiduri]" → Get Contents of URL → POST /ingest with `Authorization: Bearer <token>`. Be honest in docs: may require a confirmation tap depending on iOS version/settings.

## 10. Phased delivery

| Phase | Scope | Verifiable in cloud session? |
|---|---|---|
| **0** | pnpm workspace, tsconfig, CI; `packages/parsers` complete with golden tests green | ✅ fully |
| **1** | Supabase migrations + seed + sync script + ingest function + handler unit tests; `supabase start`, `verify-ingest.sh` curl matrix | ✅ fully (Docker available) |
| **2** | Expo app: auth, dashboard charts, transactions/notes, review inbox, paste flow, settings/tokens | ✅ via `expo start --web` + seeded data |
| **3** | Kotlin listener module + config plugin, share extension, `eas.json`, EAS dev builds (Android APK first — sideloadable), hosted Supabase deploy; collect real BIBD/SCB samples → promote skeleton parsers | ⚠️ code + prebuild checks here; behavior needs user's devices |
| **4** | Store submission via `docs/store-submission.md` | ❌ user-executed |

Commit per phase; push to `claude/card-spending-logger-bem2c9`.

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
- **Supabase project** (hosted) credentials when moving past local dev; **Apple/Google developer accounts** for Phase 4.
- Product naming/branding ("Bukit Pennies" is the working name from the repo).

## 13. Environment notes for the next session

- Node v22, pnpm 10, Docker available (→ `supabase start` works). No iOS simulator; no `gh` CLI (use GitHub MCP tools).
- Outbound HTTPS goes through a pre-configured proxy — do not disable TLS verification.
- Develop on branch `claude/card-spending-logger-bem2c9`; push with `git push -u origin <branch>`; do NOT create a PR unless asked.
