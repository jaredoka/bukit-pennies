# Contributing to Bukit Pennies

Thanks for taking a look. This started as a solo learning project, and it is
built with AI pair-programming under human direction — see the README's note on
how it was built. Contributions are welcome whether they are a one-line copy
fix or a whole new parser.

## Before you start

- Read [`docs/execution-playbook.md`](docs/execution-playbook.md). It records
  the phase order, verification gates, design invariants, and a decision log.
  Do not re-open decisions recorded there without talking to the maintainer
  first.
- Read [`HANDOFF.md`](HANDOFF.md) for the current state of the project.
- **The product promise:** the app never connects to a bank account, bank
  credentials, or an open-banking API. It only processes notification *text*.
  Any contribution must preserve this.

## Requirements

- Node 22+, pnpm 10, and Docker (for the local Supabase stack).

```bash
pnpm install
pnpm exec supabase start   # local Postgres, Auth, and edge functions
pnpm --filter @bukit/mobile web
```

## Commands

```bash
pnpm -r test               # parser golden tests + handler tests + app unit tests (vitest)
pnpm -r typecheck
node scripts/sync-parsers.mjs --check   # CI staleness check on the synced parser copy
```

## How to contribute (GitHub Flow)

1. Branch off `main`; never push to `main` directly.
2. Commit with a concise message describing the change.
3. Push and open a pull request. CI must be green before merge.
4. One pull request per deliverable.

## Parser contributions

- Every real bank message becomes a golden fixture in
  `packages/parsers/test/golden/<bank>/`.
- `packages/parsers` has **zero runtime dependencies** and uses explicit
  `.ts` import extensions — it must run unchanged in the Deno edge functions
  and in vitest.
- Generic or unverified parses are capped at confidence **0.70** and land in
  the review queue. Only verified bank formats (currently Baiduri) may exceed
  that cap.
- Edge functions import parsers from the **synced copy** under
  `supabase/functions/_shared/parsers`. Run `node scripts/sync-parsers.mjs`
  after changing `packages/parsers/src`; never edit the copy by hand.

## Database contributions

- Add migrations to `supabase/migrations/` in numeric order (`NN_name.sql`).
- Every table needs Row Level Security; every view needs `security_invoker`,
  or it silently runs as its owner and hands out everyone's rows.
- The write surface on `transactions` is RPC-only — keep it that way. A
  data-destruction RPC must be `SECURITY INVOKER` so RLS stays the gate.

## Testing

- Parsers: golden fixtures, one per real bank message.
- Edge functions: handler tests (vitest).
- App: unit tests for pure logic (filter translation, CSV, money formatting,
  calendar arithmetic, net-error handling).

## Reporting bugs and security issues

- Open an issue using the bug report template. Include the app version, what
  happened, and what you expected.
- For anything security-related (auth, RLS, token handling), flag it in the
  issue title and do not include credentials or real bank messages with card
  numbers.
