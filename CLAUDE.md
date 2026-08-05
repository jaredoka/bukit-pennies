# Bukit Pennies

Multi-user mobile app (iOS-first) that logs card spending in Brunei by parsing
bank **notification text** (Baiduri SMS today; BIBD/SCB later). Expo (React
Native/TS) + Supabase (Postgres, Auth, RLS, Edge Functions).

This file is the agent-operating manual: how to build, in what order, what to
verify, and what never to touch. The public-facing story lives in
`docs/architecture-and-decisions.md` (invariants + ADR index) and `README.md`.

## Non-negotiable safety invariant

The system **never connects to bank apps or accounts** — it only processes
notification *text*. No credentials, no open banking, no scraping. This is the
product's core trust promise; nothing may violate it.

## Prime directives

1. **Safety invariant:** never add code that connects to bank apps/accounts or
   handles bank credentials. Input is always notification *text* supplied by
   the OS/user. This is the product's trust promise and its store-review story.
2. **Don't re-litigate decided design.** The stack (Expo + Supabase), schema,
   API contract, regex designs, and phasing in `HANDOFF.md` were approved by
   the owner. Change them only when the owner asks or something is factually
   broken, and record the change as an ADR.
3. **Verify, then claim.** A phase is "done" only when its verification gate
   (below) has actually been run and passed. Report failures verbatim.

## Workflow (GitHub Flow)

- Never commit to `main` directly. Feature branch off `main` with a clear slug:
  `phase-<n>-<slug>` → commit → `git push -u origin <branch>` → `gh pr create`
  → merge only when CI is green (`gh pr merge --squash --delete-branch`).
- One PR per delivery phase; merge only with CI green.
- Build autonomously within a phase, but **stop after each phase and ask the user before starting the next**.
- Before finishing: **stop any `expo start` you launched** if you also stopped
  `supabase`. A dev server left running against a dead local stack looks
  exactly like a broken feature to whoever opens the tab next (HANDOFF §30).

## Environment notes

Node ≥22, pnpm 10 (`npm i -g pnpm@10` if missing), Docker for `supabase start`,
`gh` CLI authenticated. On Windows, run POSIX scripts (e.g. `verify-ingest.sh`)
through Git Bash.

Docker Desktop is installed and working. The Supabase CLI is a root
devDependency; invoke it as `pnpm exec supabase …`. The Phase 1 live matrix
(`supabase start` + `scripts/verify-ingest.sh`) has been run and passes 8/8
(required migration `04_grants.sql`: newer Supabase images no longer auto-grant
table DML to anon/authenticated/service_role). `psql` is not installed on the
host; run the verify script with a shim that forwards to
`docker exec -i supabase_db_bukit-pennies psql` and
`DB_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres`.

**Encoding trap (HANDOFF §43):** never restore a file with a PowerShell
`>`/`Set-Content` redirect — it re-encodes (UTF-16 by default) and the
console codepage mangles non-ASCII glyphs. To restore a tracked file to
disk, write the raw blob bytes byte-exact, e.g. `cmd /c "git cat-file -p
<blob> > file"`. Mojibake like `┬º`/`ΓÇô`/`Ã` means a console-codepage
double-encode; the fix is rewriting from the raw git blob, not hand-fixing
characters.

## Commands

```
pnpm install            # workspace root
pnpm -r test            # parser golden tests + handler tests (vitest)
pnpm -r typecheck
node scripts/sync-parsers.mjs          # copy packages/parsers/src → supabase/functions/_shared/parsers
node scripts/sync-parsers.mjs --check  # CI staleness check
supabase start          # local Postgres+Auth+Functions (Docker)
```

## Phase order and scope

| Phase | Branch | Scope | Status |
|---|---|---|---|
| 0 | `phase-0-workspace-parsers` | pnpm workspace, tsconfig, CI, `@bukit/parsers` + golden tests, docs | merged |
| 1 | `phase-1-supabase-ingest` | migrations 01–04, seed, `sync-parsers.mjs`, ingest edge function + handler tests, `verify-ingest.sh` | merged + live-verified 2026-07-16 |
| 2 | `phase-2-mobile-app` | Expo app: email/password auth, dashboard, transactions+notes, review inbox, paste capture, settings/devices | live-verified 2026-07-16 |
| 3 | `phase-3-ios-testing` | unsigned-IPA GitHub Actions workflow, Sideloadly + Shortcuts docs, hosted-Supabase deploy doc, `eas.json` stub | merged 2026-07-16 (PRs #9–#13); IPA workflow verified green (run 29503884211, 10.8 MB artifact); device checklist = owner-executed (`docs/ios-sideloadly.md`) |
| deferred | n/a | Android Kotlin `NotificationListenerService` module + config plugin (HANDOFF §9) | after iOS testing |
| 3.5 | `phase-3.5-store-blockers` | account deletion (RPC + screen), password reset, privacy policy + terms, real branding | merged + live-verified 2026-07-16 (PR #17); policies live at jaredoka.github.io/bukit-pennies |
| 4 | n/a | store submission (owner-executed checklist) | after real-device validation |
| 4.5 | `phase-4.5-launch-ops` | Sentry integration (`@sentry/react-native`), structured ingest logging, hosted Supabase deploy guide, env template; free tiers for both; TestFlight deferred until paid Apple account | code complete 2026-07-17 |
| 5 | `phase-5-product-gaps` | manual entry, budgets, CSV export, recurring detection | merged 2026-07-17 (PR #21) |
| 6 | `phase-6-auto-capture` | hosted Supabase go-live (owner's free project), bulk paste (`splitBankMessages` + capture UI), `verify-ingest-hosted.sh`, `docs/ios-shortcut-setup.md` | merged |

Per-phase implementation detail lives in `HANDOFF.md` §4–§10; follow it
literally (schema SQL in §5, ingest flow in §6, parser contract in §7, app
structure in §8, Sideloadly constraints in §10).

## Verification gates (run before calling a phase done)

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

## Architecture rules

- `packages/parsers` (`@bukit/parsers`): **zero runtime deps**, pure TS,
  **explicit `.ts` import extensions** (must run in Deno edge functions and
  vitest unchanged). Every real bank message becomes a golden fixture in
  `packages/parsers/test/golden/<bank>/`.
- Generic/unverified parses are capped at confidence 0.70 → always
  `needs_review`. Only verified bank formats (currently Baiduri) may exceed it.
- Edge functions import parsers from the **synced copy** under
  `supabase/functions/_shared/parsers` — never edit the copy by hand.
- Parsers are **shared by copy**: `scripts/sync-parsers.mjs` copies
  `packages/parsers/src` → `supabase/functions/_shared/parsers`. CI fails if
  the copy is stale.

## Standard procedures

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
| "Why did we choose X over Y?" | an ADR under `docs/adr/` |
| "What must I not break?" | `docs/architecture-and-decisions.md` invariants |
| "How does the system work now?" | `HANDOFF.md` §1–§13, edited in place |
| "What happened on some date?" | nothing; git history covers it |

If no question fits, it does not need writing down. **`HANDOFF.md` §14+ is a
frozen archive, not a place to append** (see its header). New sessions update
§1–§13 when the design actually changed, add an ADR when a decision was made,
and otherwise let the commits and PRs carry the narrative, which they already
do better.

## Blocked on owner input

- Real BIBD / Standard Chartered notification samples (→ promote the skeleton
  parsers).
- Exact Android package names for the three bank apps (Phase 3+, real device).
- ~~Hosted Supabase project credentials~~ — received 2026-07-17; project
  `pzjroqwllrzcbpiugpxl` linked, migrations 01–06 pushed, ingest deployed,
  hosted curl matrix 5/5 (`scripts/verify-ingest-hosted.sh`).
- Apple ($99, deferred) / Google ($25) developer accounts (Phase 4).
- Product naming/branding decision ("Bukit Pennies" is the working name) —
  blocks Phase 3.5 branding + store listings.
- Public hosting choice for privacy policy/terms (GitHub Pages suggested) and a
  support contact email (Phase 3.5).
- Paid Supabase tier + Sentry account for launch ops (Phase 4.5).
