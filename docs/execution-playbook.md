# Bukit Pennies — Execution Playbook

**Audience:** any Claude model (Sonnet, Opus, Haiku, Fable) or human continuing
this project. This document captures *how the work is done here* so execution
stays consistent regardless of who/what picks it up. `HANDOFF.md` is the full
approved design; this playbook is the operating procedure. **When they appear
to conflict, HANDOFF.md wins for design, this file wins for process.**

---

## 1. Prime directives

1. **Safety invariant:** never add code that connects to bank apps/accounts or
   handles bank credentials. Input is always notification *text* supplied by
   the OS/user. This is the product's trust promise and its store-review story.
2. **Don't re-litigate decided design.** The stack (Expo + Supabase), schema,
   API contract, regex designs, and phasing in `HANDOFF.md` were approved by
   the user. Change them only when the user asks or something is factually
   broken — and record the change in the decision log (§6).
3. **Verify, then claim.** A phase is "done" only when its verification gate
   (§4) has actually been run and passed. Report failures verbatim.
4. **Stop between phases.** Build autonomously within a phase; after the
   phase's PR is merged and verified, stop and ask the user whether to proceed.

## 2. Workflow procedure (every session)

1. Read `CLAUDE.md`, this file, and skim `HANDOFF.md`.
2. `git checkout main && git pull`, then a feature branch: `phase-<n>-<slug>`.
3. Implement the phase (§3), running `pnpm -r test` / `pnpm -r typecheck`
   frequently.
4. Commit(s) with clear messages; `git push -u origin <branch>`;
   `gh pr create`; merge when CI is green (`gh pr merge --squash --delete-branch`).
5. Stop; summarize what was verified; ask the user to continue.

Environment notes: Node ≥22, pnpm 10 (`npm i -g pnpm@10` if missing), Docker
for `supabase start`, `gh` CLI authenticated. On Windows, run POSIX scripts
(e.g. `verify-ingest.sh`) through Git Bash.

> **Environment note (updated 2026-07-16):** Docker Desktop is installed and
> working. The Supabase CLI is a root devDependency — invoke it as
> `pnpm exec supabase …`. The Phase 1 live matrix (`supabase start` +
> `scripts/verify-ingest.sh`) has been run and passes 8/8 (required migration
> `04_grants.sql`: newer Supabase images no longer auto-grant table DML to
> anon/authenticated/service_role). `psql` is not installed on the host —
> run the verify script with a shim that forwards to
> `docker exec -i supabase_db_bukit-pennies psql` and
> `DB_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres`.

## 3. Phase order and scope

| Phase | Branch | Scope | Status |
|---|---|---|---|
| 0 | `phase-0-workspace-parsers` | pnpm workspace, tsconfig, CI, `@bukit/parsers` + golden tests, this playbook | this PR |
| 1 | `phase-1-supabase-ingest` | migrations 01–04, seed, `sync-parsers.mjs`, ingest edge function + handler tests, `verify-ingest.sh` | merged + live-verified 2026-07-16 |
| 2 | `phase-2-mobile-app` | Expo app: email/password auth, dashboard, transactions+notes, review inbox, paste capture, settings/devices | live-verified 2026-07-16 (this PR) |
| 3 | `phase-3-ios-testing` | unsigned-IPA GitHub Actions workflow, Sideloadly + Shortcuts docs, hosted-Supabase deploy doc, `eas.json` stub | merged 2026-07-16 (PRs #9–#13); IPA workflow verified green (run 29503884211, 10.8 MB artifact); device checklist = user-executed (`docs/ios-sideloadly.md`) |
| deferred | — | Android Kotlin `NotificationListenerService` module + config plugin (HANDOFF §9) | after iOS testing |
| 3.5 | `phase-3.5-store-blockers` | account deletion (RPC + screen), password reset, privacy policy + terms, real branding (HANDOFF §14) | merged + live-verified 2026-07-16 (PR #17); policies live at jaredoka.github.io/bukit-pennies |
| 4 | — | store submission (user-executed checklist) | after real-device validation |
| 4.5 | `phase-4.5-launch-ops` | Sentry integration (`@sentry/react-native`), structured ingest logging, hosted Supabase deploy guide, env template (HANDOFF §14); free tiers for both; TestFlight deferred until paid Apple account | code complete 2026-07-17 |
| 5 | `phase-5-product-gaps` | manual entry, budgets, CSV export, recurring detection (HANDOFF §14) | pending |

Per-phase implementation detail lives in `HANDOFF.md` §4–§10 — follow it
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
  still green on web. Device behavior = user-executed checklist in
  `docs/ios-sideloadly.md`.
- **Phase 4.5:** `pnpm -r typecheck` and `pnpm -r test` green;
  `@sentry/react-native` installed and plugin in `app.json`; `initSentry()`
  called in root layout; `Sentry.wrap()` around root component; ingest function
  emits structured JSON logs; `.env.production.example` template present;
  `docs/hosted-supabase-deploy.md` and `docs/sentry-setup.md` cover user-executed
  setup steps.

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

## 6. Decision log (do not re-open without user say-so)

| Date | Decision |
|---|---|
| 2026-07-16 | Expo over Flutter (one TS parser codebase across app/server/tests); Supabase over custom Node API. |
| 2026-07-16 | GitHub Flow; PR per phase; `gh pr create/merge` pre-allowed in `.claude/settings.json`. |
| 2026-07-16 | Paid Apple Developer account deferred until production-ready; iOS device testing via Sideloadly + free Apple ID + unsigned IPA from GitHub Actions macOS runner. |
| 2026-07-16 | Build Baiduri-first (only real sample); BIBD/SCB stay UNVERIFIED skeletons; review inbox is the sample-collection loop. |
| 2026-07-16 | Scope this effort through "fully functional on iOS for testing"; Android listener module deferred. |
| 2026-07-16 | Phase-by-phase cadence: stop after each merged phase and ask the user before continuing. |

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
`security_invoker` views; verify with `supabase db reset` locally.

## 8. Blocked-on-user registry

- Real BIBD / Standard Chartered notification samples (→ §7 promotion).
- Exact Android package names for the three bank apps (Phase 3+, real device).
- Hosted Supabase project credentials (needed for on-device iOS testing).
- Apple ($99, deferred) / Google ($25) developer accounts (Phase 4).
- Product naming/branding decision ("Bukit Pennies" is the working name) —
  blocks Phase 3.5 branding + store listings.
- Public hosting choice for privacy policy/terms (GitHub Pages suggested) and a
  support contact email (Phase 3.5).
- Paid Supabase tier + Sentry account for launch ops (Phase 4.5).
