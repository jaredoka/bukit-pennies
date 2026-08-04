# Contributing to Bukit Pennies

Thanks for taking a look. This started as a solo learning project, and you can
read how it was built in the README. Contributions are welcome whether they are
a one-line copy fix or a whole new parser.

## Code of conduct

Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before contributing. We
are here to help each other build, not to make anyone's day worse.

## The product promise

The app never connects to a bank account, bank credentials, or an open-banking
API. It only processes notification *text*. Any contribution must preserve
this. It is the project's core trust promise and it is not open for debate.

## Where to ask questions

- Ask questions, share ideas, and get support in
  [GitHub Discussions](https://github.com/jaredoka/bukit-pennies/discussions).
- Report bugs and request features by opening an
  [issue](https://github.com/jaredoka/bukit-pennies/issues) with the matching
  template.
- Report security problems privately. See [SECURITY.md](SECURITY.md). Never
  open a public issue for a security problem.

## Getting started

Looking for a place to start? Issues labelled
[good first issue](https://github.com/jaredoka/bukit-pennies/labels/good%20first%20issue)
are small, self-contained, and picked specifically for newcomers.

### Requirements

- Node 22+, pnpm 10, and Docker (for the local Supabase stack).

```bash
pnpm install
pnpm exec supabase start   # local Postgres, Auth, and edge functions
pnpm --filter @bukit/mobile web
```

### Commands

```bash
pnpm -r test               # parser golden tests + handler tests + app unit tests (vitest)
pnpm -r typecheck
node scripts/sync-parsers.mjs --check   # CI staleness check on the synced parser copy
```

## How to contribute (GitHub Flow)

1. Branch off `main`; never push to `main` directly.
2. Commit with a `area: summary` message (see below).
3. Push and open a pull request. CI must be green before merge.
4. One pull request per deliverable.

### Commit messages

Use a lowercase area prefix and an imperative summary. Examples:

- `parsers: add BIBD format and its golden fixtures`
- `db: add migration 26_unused_indexes.sql`
- `app: fix timezone drift on the insights chart`
- `docs: clarify the review-queue flow`
- `security: tighten the ingest rate limit`

## Parser contributions

- Every real bank message becomes a golden fixture in
  `packages/parsers/test/golden/<bank>/`.
- `packages/parsers` has **zero runtime dependencies** and uses explicit
  `.ts` import extensions so it must run unchanged in the Deno edge functions
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
- The write surface on `transactions` is RPC-only, so keep it that way. A
  data-destruction RPC must be `SECURITY INVOKER` so RLS stays the gate.

## Testing

- Parsers: golden fixtures, one per real bank message.
- Edge functions: handler tests (vitest).
- App: unit tests for pure logic (filter translation, CSV, money formatting,
  calendar arithmetic, net-error handling).

## Reporting bugs

- Open an issue using the bug report template. Include the app version, what
  happened, and what you expected.
- Redact any card numbers before pasting anything.

## License

Bukit Pennies is [MIT licensed](LICENSE). By contributing, you agree that your
contributions are licensed under the same terms.
