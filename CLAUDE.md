# Bukit Pennies

Multi-user mobile app (iOS-first) that logs card spending in Brunei by parsing
bank **notification text** (Baiduri SMS today; BIBD/SCB later). Expo (React
Native/TS) + Supabase (Postgres, Auth, RLS, Edge Functions).

**Read `docs/execution-playbook.md` before building anything** — it holds the
phase order, verification gates, design invariants, and the decision log. Do
not re-open decisions recorded there. `HANDOFF.md` is the full original design.

## Non-negotiable safety invariant

The system **never connects to bank apps or accounts** — it only processes
notification *text*. No credentials, no open banking, no scraping. This is the
product's core trust promise; nothing may violate it.

## Workflow (GitHub Flow)

- Never commit to `main` directly. Feature branch off `main` → commit → `git push -u origin <branch>` → `gh pr create` → merge PR.
- One PR per delivery phase; merge only with CI green.
- Build autonomously within a phase, but **stop after each phase and ask the user before starting the next**.

## Commands

```
pnpm install            # workspace root
pnpm -r test            # parser golden tests + handler tests (vitest)
pnpm -r typecheck
node scripts/sync-parsers.mjs          # copy packages/parsers/src → supabase/functions/_shared/parsers
node scripts/sync-parsers.mjs --check  # CI staleness check
supabase start          # local Postgres+Auth+Functions (Docker)
```

## Architecture rules

- `packages/parsers` (`@bukit/parsers`): **zero runtime deps**, pure TS,
  **explicit `.ts` import extensions** (must run in Deno edge functions and
  vitest unchanged). Every real bank message becomes a golden fixture in
  `packages/parsers/test/golden/<bank>/`.
- Generic/unverified parses are capped at confidence 0.70 → always
  `needs_review`. Only verified bank formats (currently Baiduri) may exceed it.
- Edge functions import parsers from the **synced copy** under
  `supabase/functions/_shared/parsers` — never edit the copy by hand.
