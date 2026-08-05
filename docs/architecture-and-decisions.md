# Bukit Pennies: Architecture and Decisions

**Purpose.** Why the codebase is shaped the way it is. This document is the
public record of the system's design invariants and the decisions behind them;
each decision lives in its own [ADR file](adr/) with its status, context, and
consequences. If you are looking for how to contribute, see
[CONTRIBUTING.md](../CONTRIBUTING.md).

## 1. Overview

Bukit Pennies is a spending tracker for Brunei that turns a bank's
notification text into a card transaction. It never connects to a bank account
or reads a balance: the only input is the SMS the phone already received,
posted to a private endpoint.

```
Bank SMS  →  iOS Shortcut  →  /ingest edge function  →  Postgres  →  app
             (automation)     parse · score · dedupe     (RLS)
```

TypeScript end to end. A single zero-dependency parser package
(`@bukit/parsers`) is shared between the mobile app, the edge function, and
the test suite, so a message previews identically everywhere. The app is Expo /
React Native; the backend is Supabase (Postgres, Auth, Row Level Security,
Deno edge functions); tests run on Vitest and CI on GitHub Actions.

## 2. Design invariants

These are hard constraints. If a change breaks one, the change is wrong — or
the invariant is, and the change needs an ADR that says so explicitly.

- `@bukit/parsers`: zero runtime dependencies; explicit `.ts` import
  extensions (Deno + vitest compatible); pure functions only.
- Parsers are **shared by copy**: `scripts/sync-parsers.mjs` copies
  `packages/parsers/src` → `supabase/functions/_shared/parsers`. Never edit the
  copy by hand; CI fails if it is stale.
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
  go through the single-Modal `SheetShell` in
  `apps/mobile/src/components/ui.tsx`.
- **`public.subscriptions` is a record, not an input.** Nothing may add its
  amounts to budgets, the monthly limit, or any spend total: the real charge
  is already a transaction, so doing so double-counts the same money. Totals
  across unlike cycles go through `monthlyEquivalent`; new date or merge
  behaviour needs a case in `apps/mobile/test/subscriptions.test.ts` first.
- Device-local storage keys must match SecureStore's `/^[\w.-]+$/` (no colons)
  and must be scoped per user id whenever the value derives from account
  data rather than from the handset. `apps/mobile/test/kvStore.test.ts` asserts
  both; add new key builders to its list.
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

## 3. Decision log

Every recorded decision lives in its own file under
[`docs/adr/`](adr/), numbered in order. Reversals are recorded as the
superseding ADR pointing at the one it replaces — see the index below for the
current status of each.

**[Index of ADRs](adr/README.md)**

## 4. Development conventions

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
New migration file (never edit an applied migration); keep the RLS quartet +
`security_invoker` views; verify with `supabase db reset` locally. Then
`supabase db push` and `supabase db advisors --type security --linked` against
hosted, comparing the output to `docs/db-advisors.md`.
