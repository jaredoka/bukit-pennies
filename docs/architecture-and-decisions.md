# Bukit Pennies: Architecture and Decisions

**Purpose.** How the work here is done, and why. `HANDOFF.md` is the full
approved design; this document is the operating standard: prime directives,
verification gates, design invariants, the decision log, and standard
procedures. When the two conflict, `HANDOFF.md` wins for design and this file
wins for process.

---

## 1. Prime directives

1. **Safety invariant:** never add code that connects to bank apps/accounts or
   handles bank credentials. Input is always notification *text* supplied by
   the OS/user. This is the product's trust promise and its store-review story.
2. **Don't re-litigate decided design.** The stack (Expo + Supabase), schema,
   API contract, regex designs, and phasing in `HANDOFF.md` were approved by
   the owner. Change them only when the owner asks or something is factually
   broken, and record the change in the decision log (§6).
3. **Verify, then claim.** A phase is "done" only when its verification gate
   (§4) has actually been run and passed. Report failures verbatim.

## 2. Workflow

1. Branch off `main` with a clear slug: `phase-<n>-<slug>`.
2. Implement the phase (§3), running `pnpm -r test` and `pnpm -r typecheck`
   frequently.
3. Commit with clear messages; `git push -u origin <branch>`;
   `gh pr create`; merge when CI is green (`gh pr merge --squash --delete-branch`).
4. Before finishing: **stop any `expo start` you launched** if you also stopped
   `supabase`. A dev server left running against a dead local stack looks
   exactly like a broken feature to whoever opens the tab next (HANDOFF §30).

Environment notes: Node ≥22, pnpm 10 (`npm i -g pnpm@10` if missing), Docker
for `supabase start`, `gh` CLI authenticated. On Windows, run POSIX scripts
(e.g. `verify-ingest.sh`) through Git Bash.

> **Environment note (updated 2026-07-16):** Docker Desktop is installed and
> working. The Supabase CLI is a root devDependency; invoke it as
> `pnpm exec supabase …`. The Phase 1 live matrix (`supabase start` +
> `scripts/verify-ingest.sh`) has been run and passes 8/8 (required migration
> `04_grants.sql`: newer Supabase images no longer auto-grant table DML to
> anon/authenticated/service_role). `psql` is not installed on the host; run
> the verify script with a shim that forwards to
> `docker exec -i supabase_db_bukit-pennies psql` and
> `DB_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres`.

## 3. Phase order and scope

| Phase | Branch | Scope | Status |
|---|---|---|---|
| 0 | `phase-0-workspace-parsers` | pnpm workspace, tsconfig, CI, `@bukit/parsers` + golden tests, this document | this PR |
| 1 | `phase-1-supabase-ingest` | migrations 01–04, seed, `sync-parsers.mjs`, ingest edge function + handler tests, `verify-ingest.sh` | merged + live-verified 2026-07-16 |
| 2 | `phase-2-mobile-app` | Expo app: email/password auth, dashboard, transactions+notes, review inbox, paste capture, settings/devices | live-verified 2026-07-16 (this PR) |
| 3 | `phase-3-ios-testing` | unsigned-IPA GitHub Actions workflow, Sideloadly + Shortcuts docs, hosted-Supabase deploy doc, `eas.json` stub | merged 2026-07-16 (PRs #9–#13); IPA workflow verified green (run 29503884211, 10.8 MB artifact); device checklist = owner-executed (`docs/ios-sideloadly.md`) |
| deferred | n/a | Android Kotlin `NotificationListenerService` module + config plugin (HANDOFF §9) | after iOS testing |
| 3.5 | `phase-3.5-store-blockers` | account deletion (RPC + screen), password reset, privacy policy + terms, real branding (HANDOFF §14) | merged + live-verified 2026-07-16 (PR #17); policies live at jaredoka.github.io/bukit-pennies |
| 4 | n/a | store submission (owner-executed checklist) | after real-device validation |
| 4.5 | `phase-4.5-launch-ops` | Sentry integration (`@sentry/react-native`), structured ingest logging, hosted Supabase deploy guide, env template (HANDOFF §14); free tiers for both; TestFlight deferred until paid Apple account | code complete 2026-07-17 |
| 5 | `phase-5-product-gaps` | manual entry, budgets, CSV export, recurring detection (HANDOFF §14) | merged 2026-07-17 (PR #21) |
| 6 | `phase-6-auto-capture` | hosted Supabase go-live (owner's free project), bulk paste (`splitBankMessages` + capture UI), `verify-ingest-hosted.sh`, `docs/ios-shortcut-setup.md` | this PR |

Per-phase implementation detail lives in `HANDOFF.md` §4–§10; follow it
literally (schema SQL in §5, ingest flow in §6, parser contract in §7, app
structure in §8, Sideloadly constraints in §10).

## 4. Verification gates (run before calling a phase done)

- **Phase 0:** `pnpm -r test` and `pnpm -r typecheck` green; CI green on the PR.
- **Phase 1:** `supabase start` + `supabase functions serve ingest`; run
  `scripts/verify-ingest.sh`: Baiduri sample → `created`; resend → `duplicate`;
  garbage text → `needs_review` row; bad token → 401. psql-assert the parsed
  row (amount 21.00, merchant `GALORIES SMOOTHIES BSB BN`, occurred_at
  `2026-07-10 17:37:59+08`, bank `baiduri`, status `parsed`). RLS proof: user B
  selecting user A's transactions gets 0 rows.
- **Phase 2:** `expo start --web` against local Supabase + seed: dashboard
  charts render, day-sectioned list, review-inbox fix/merge, paste the Baiduri
  sample end-to-end through the real local ingest function.
- **Phase 3:** workflow YAML valid; `expo prebuild --no-install` succeeds; app
  still green on web. Device behavior = owner-executed checklist in
  `docs/ios-sideloadly.md`.
- **Phase 4.5:** `pnpm -r typecheck` and `pnpm -r test` green;
  `@sentry/react-native` installed and plugin in `app.json`; `initSentry()`
  called in root layout; `Sentry.wrap()` around root component; ingest function
  emits structured JSON logs; `.env.production.example` template present;
  `docs/hosted-supabase-deploy.md` and `docs/sentry-setup.md` cover owner-executed
  setup steps.
- **Phase 5:** `pnpm -r typecheck` and `pnpm -r test` green; `supabase db reset`
  applies `06_budgets.sql` cleanly with the RLS quartet present
  (`pg_policy` shows all four `budgets_*` policies); live psql inserts prove the
  budget upsert path and a manual-entry-shaped transaction row
  (`source='manual'`, `parse_status='parsed'`, unique `manual:` raw_hash);
  `expo export --platform web` compiles with the new screens
  (`transactions/new`, `settings/budgets`) and dashboard cards.
- **Phase 6:** `pnpm -r test` (incl. `golden/split` fixtures) and
  `pnpm -r typecheck` green; `node scripts/sync-parsers.mjs --check` clean;
  hosted curl matrix passes via `scripts/verify-ingest-hosted.sh` (bad token
  401, Baiduri sample created+parsed, re-send duplicate, OTP ignored); bulk
  paste of a 3-message blob through the hosted ingest on `expo start --web`
  shows per-message results with correct statuses.

## 5. Design invariants (do not drift)

- `@bukit/parsers`: zero runtime dependencies; explicit `.ts` import
  extensions (Deno + vitest compatible); pure functions only.
- Parsers are **shared by copy**: `scripts/sync-parsers.mjs` copies
  `packages/parsers/src` → `supabase/functions/_shared/parsers`. Never edit the
  copy; CI fails if it's stale.
- Confidence weights: amount .40 / merchant .25 / date .20 / card .15;
  `exact`=1, `heuristic`=0.5, `missing`=0. Generic fallback and UNVERIFIED
  skeleton parsers are capped at **0.70** (`UNVERIFIED_CONFIDENCE_CAP`) so they
  always land in `needs_review` (server gate: confidence < 0.75 or missing
  amount).
- Non-transactional messages (OTP/promo/balance) are rejected **before**
  parsing and never inserted.
- All timestamps are Brunei time (`+08:00`, no DST); months bucket in
  `Asia/Brunei`.
- Every table has RLS (`auth.uid() = user_id` quartet); ingest tokens are
  stored **only as sha256** and revealed once as `bp_<base62>`.
- Free-Apple-ID constraint (until the paid dev account exists): **no Sign in
  with Apple** (email/password only), **no share extension** in sideload
  builds, weekly re-sideload cadence. iOS capture = paste screen + Shortcuts
  automation.
- Amounts are `numeric(12,2)` server-side; dedup key is
  `sha256(user_id || ':' || normalized(raw_text))`.
- **Never render two `Modal`s at once.** iOS presents one per view controller
  and silently drops the second: the app freezes with no way out. All sheets
  go through the single-Modal `SheetShell` (HANDOFF §28).
- **`public.subscriptions` is a record, not an input.** Nothing may add its
  amounts to budgets, the monthly limit, or any spend total: the real charge is
  already a transaction, so doing so double-counts the same money. Totals across
  unlike cycles go through `monthlyEquivalent`; new date or merge behaviour needs
  a case in `apps/mobile/test/subscriptions.test.ts` first (HANDOFF §29).
- Device-local storage keys must match SecureStore's `/^[\w.-]+$/` (no colons)
  and must be scoped per user id whenever the value derives from account
  data rather than from the handset. `test/kvStore.test.ts` asserts both;
  add new key builders to its list (HANDOFF §28).
- **Any query that reads a whole period goes through `fetchAllPages`.**
  PostgREST truncates a response at `max_rows` (1000, `supabase/config.toml`)
  and says nothing about having done so, so an unpaged read of a month or a
  year silently understates every total built from it. The paging callback must
  end its ordering with `id`: `range()` slices an ordered result, and rows that
  tie on the sort column can swap between requests, dropping one and repeating
  another. Screens that show a list rather than a total (the transactions list,
  the review inbox) page or cap on purpose instead.
- **Nothing in this app can produce a negative amount.** `parseAmount` refuses
  anything at or below zero, and both manual entry and Review confirmation
  require a positive figure. Any feature phrased as "money in" (refunds,
  credits, reversals) is therefore new work with a golden fixture, not a
  filter over data that already exists.

## 6. Decision log

Recorded decisions stand unless the owner reverses one; a reversal is itself a
new entry. Each row says what changed and why; rows that reverse an earlier
decision say so.

| Date | Decision |
|---|---|
| 2026-07-16 | Expo over Flutter (one TS parser codebase across app/server/tests); Supabase over custom Node API. |
| 2026-07-16 | GitHub Flow; PR per phase; `gh pr create/merge`. |
| 2026-07-16 | Paid Apple Developer account deferred until production-ready; iOS device testing via Sideloadly + free Apple ID + unsigned IPA from GitHub Actions macOS runner. |
| 2026-07-16 | Build Baiduri-first (only real sample); BIBD/SCB stay UNVERIFIED skeletons; review inbox is the sample-collection loop. |
| 2026-07-16 | Scope this effort through "fully functional on iOS for testing"; Android listener module deferred. |
| 2026-07-16 | Phase-by-phase cadence: stop after each merged phase and ask the owner before continuing. |
| 2026-07-30 | Transaction filters run in the database and the list pages (50/page); the client no longer filters a capped array. Filter pickers read the `transaction_facets` view, not the loaded rows. |
| 2026-07-30 | `apps/mobile` carries vitest for pure logic only (no component rendering); picked up by `pnpm -r test` and CI unchanged. |
| 2026-07-30 | The hornbill mascot is removed from the app entirely (HANDOFF §29) and its art and generator scripts are deleted from `art/` (§32). The owner is drawing replacement pixel art by hand; until it lands the app has no mascot and the penny coin is the only brand mark. Do not reintroduce a mascot or regenerate the bird. |
| 2026-07-30 | Dashboard drops Daily spend, Month by month and Top merchants: Insights covers the last two better. Day-level spending now exists nowhere; if it returns it goes on Insights (HANDOFF §30). |
| 2026-07-30 | Subscriptions (migration 18) live on a dashboard card → full screen, not a sixth tab. Declared rows and `detectRecurring` clusters merge into one list. **Display-only: never a budget input**; the captured transaction is what counts toward the monthly limit. No reminders are scheduled from subscriptions (HANDOFF §29). |
| 2026-07-31 | Re-parse is guarded by `lib/reparse.ts`, not written inline on the detail screen: it passes the row's own timestamp back as `receivedAt` (BIBD messages carry no date, so re-parsing without one used to blank `occurred_at` and drop the row out of every dashboard query), never overwrites a date it cannot replace, is not offered for `source='manual'`, and asks before overwriting. `test/reparse.test.ts` is the contract. |
| 2026-07-31 | Whole-period reads page through `fetchAllPages` (§5). `REVIEW_CONFIDENCE_THRESHOLD` moves into `@bukit/parsers` beside the weights, joining `MAX_TEXT_BYTES` as a number the server gate and the client previews cannot state differently. |
| 2026-07-31 | The Direction (incoming/outgoing) filter is removed rather than fixed: no write path can produce a negative amount, so "Incoming" could only ever return nothing. It returns with refunds, if refunds are ever built. |
| 2026-07-31 | Review stays off the tab bar (five tabs is the maximum) and is reached from exactly one place: a permanent tray button in the Transactions header, carrying a `useReviewCount()` badge. A dismissible dashboard banner was built and then removed: the badge is persistent and Transactions is a primary tab, so the banner was a second copy of a signal that was already being carried. Do not reintroduce it. **A screen hidden with `href: null` needs an explicit link in the same PR**: `review` and `capture` were both hidden in PR #32 and neither got one. `capture.tsx` is deleted outright: `CaptureSheet` in `transactions/index.tsx` is the reachable copy of the same feature. |
| 2026-07-31 | Migration 22 drops `merchant_totals` (the dashboard card it fed was removed 2026-07-30; Insights computes merchants from rows it already has) and `user_cards` (created in migration 01 for card labels, written only by the dev seed, read by nothing). Card labels are still a good idea: when built, the table returns in a migration alongside the screen that reads it, shaped for what that screen needs. Same reasoning as migration 21: an object that exists is something every future audit has to re-derive, and `04_grants.sql` gives `authenticated` DML on every table by default. |
| 2026-07-31 | Settings navigation rows go through one `NavRow` in `components/ui.tsx` (`inset` for the bare grouped list on the index, default for rows inside a `Card`). There were three byte-identical copies. TypeScript is pinned to one version (`~6.0.3`) across all three packages. |
| 2026-08-01 | Review and Subscriptions are **root stack routes, not tabs** (`app/review.tsx`, `app/subscriptions/`). A screen reached by pushing cannot be a hidden tab: navigating to one is a tab switch, so there is no history to pop, `canGoBack()` is false and no back button is drawn. Subscriptions proved it: two entry points in different tabs, so a hand-rolled back button had to guess and always guessed wrong. Pushed screens above the tab bar also need `headerBackTitle`, or the back button reads the group's route name, literally `(tabs)`. |
| 2026-08-01 | The Android capture screen is gated to `Platform.OS === 'android'` rather than deleted. The listener is designed (HANDOFF §9) and deferred, not dropped, and the screen holds the privacy-boundary copy that story needs; on iOS it was a settings row promising a feature the device cannot run, which is placeholder content in a store build. The gate resolves itself when an Android build ships. |
| 2026-08-02 | Auth screens render the coin field themselves: each screen paints `colors.bg` and mounts `<HexBackground/>`, and `(auth)/_layout.tsx` is a plain Stack again. A transparent screen over a native-stack container hid the field and cost compositing (PR #87). |
| 2026-08-02 | `DismissKeyboardView` drops its tap-to-dismiss on web: RN-web's `Keyboard.dismiss` blurs the focused field via the bubbling click (PR #87). |
| 2026-08-02 | Money pairs render as `BND 100.00 / 500.00` (currency once, left) via `formatMoneyPair` + a cloak-aware `pair()` on `usePrivacy`; goals amounts are single-line (`adjustsFontSizeToFit`) (PR #87). |
| 2026-08-02 | Strategy: north star is a mix of installs, DAU, and capture volume; first milestone is store launch readiness. E-wallet and recurring-bill parsers are deferred (unreliable texts; card auto-debits already arrive via bank SMS; low ROI per parser). Freemium stays open: launch free/simple, no monetization plumbing. English-only UI. Single developer. |
| 2026-08-02 | The transactions list defaults to the **last 30 days** on first open (newest-first, infinite scroll beyond). A count-based "first page" means different things for different users; a time window is predictable and matches the monthly mental model. |
| 2026-08-02 | "Reset all transactions" is a user-facing destructive action moved onto its own Settings page (linked from Settings → Spending & data), confirmed by typing the phrase **RESET-TRANSACTIONS**. It deletes the account's transactions only, and with them each row's category mapping (`transactions.category_id` is a column; there is no assignment table). Budgets, goals, subscriptions, cards, and settings survive. |
| 2026-08-02 | The owner's hand-drawn **coin_v2** replaces coin_v1 as the app icon. `coin_platform_icons.py` now derives the complete icon set (icon, favicon, splash, Android adaptive foreground/monochrome/background) from `art/raw/coin_v2.png`, and the Android adaptive background becomes solid white: it was the last hornbill-era colour left over from §32. The coin is white-backed in every surface now. |
| 2026-08-02 | The transactions list **reverts to no default date filter** (all time, newest-first), reversing the earlier 30-day-window decision. The first screen is simply the newest page (`TX_PAGE_SIZE = 50`); scrolling auto-loads the next page. A date window is just another filter the user opens from the Date chip: a default that is secretly a filter hides older transactions and reads as one. |
| 2026-08-03 | The **web demo is a first-class surface**, not an afterthought (PRs #98–#100): the app defaults to **light** theme (Settings can still pin Light/Dark/System), the welcome hero exits to the **dashboard** with a one-tap **sample Baiduri SMS** (BND 10.00) so anyone can watch a parse without a bank message, icons deploy correctly via a **vendored `Ionicons.ttf`** (Netlify skips the `__node_modules` asset tree), and `ingest`/`feedback` share edge-function CORS handling in `supabase/functions/_shared/cors.ts`. |
| 2026-08-03 | On wide web windows the demo renders inside a **phone-width frame** (420px, rounded, shadowed, breakpoint 520px; full-bleed below that and on native) so a bare desktop link reads as a mobile app. The shared `SheetShell` modal **sizes itself to that frame** instead of the viewport, keeping dim and panel inside the phone screen (PRs #101–#102). Frame constants live in `apps/mobile/src/lib/webFrame.ts` so the frame and its sheets cannot drift apart. |
| 2026-08-05 | This document, formerly the "Execution Playbook", is renamed to **Architecture and Decisions** and reframed for a public audience: the agent workflow and the blocked-on-owner registry move to `CLAUDE.md`, and the decision log becomes the public record of choices. A follow-up will split the decision log into standalone ADRs (`docs/adr/`) with linking from the README; this single file stays until that split lands. |

## 7. Standard procedures

### Promote a skeleton parser (BIBD/SCB) when a real sample arrives
1. Add the raw message (redacted ok) as a golden fixture:
   `packages/parsers/test/golden/<bank>/<slug>.json` with the expected fields.
2. Rewrite `src/banks/<bank>.ts` with label-anchored regexes (mirror
   `baiduri.ts`: anchor each field to its label; terminate merchant at the next
   label; day-first dates → `buildBruneiIso`).
3. Give the bank a real body `FINGERPRINT`; remove the
   `UNVERIFIED_CONFIDENCE_CAP` clamp. Exact matches must score ≥ 0.95.
4. `pnpm -r test`; run `node scripts/sync-parsers.mjs`; commit both the package
   and the synced copy in the same PR.

### Add any new parser behavior
Golden fixture first (failing), then code. Never change parser code without a
fixture pinning the new behavior. Negative cases go in `golden/negative/`.

### Touching the DB schema
New migration file (never edit an applied migration); keep RLS quartet +
`security_invoker` views; verify with `supabase db reset` locally. Then
`supabase db push` and `supabase db advisors --type security --linked` against
hosted, comparing the output to `docs/db-advisors.md`. **Hosted is at migration
22 as of 2026-08-01**; local and hosted are in step.

### Writing something down: pick the file by the question it answers
Most of what happens in a session does not belong in a document at all. Before
adding prose anywhere, name the question a future reader will ask:

| The question | Where the answer belongs |
|---|---|
| "Why does this line exist?" | the commit message (found via `git blame`) |
| "Why was this change made this way?" | the PR description |
| "Why did we choose X over Y?" | §6 decision log, one row |
| "What must I not break?" | §5 invariants |
| "How does the system work now?" | `HANDOFF.md` §1–§13, edited in place |
| "What happened on some date?" | nothing; git history covers it |

If no question fits, it does not need writing down. **`HANDOFF.md` §14+ is a
frozen archive, not a place to append** (see its header). New sessions update
§1–§13 when the design actually changed, add a §6 row when a decision was made,
and otherwise let the commits and PRs carry the narrative, which they already
do better.
