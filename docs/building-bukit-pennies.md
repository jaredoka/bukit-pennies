# Building Bukit Pennies

The README's ["Design notes"](../README.md#design-notes) section is a condensed version
of these field notes. They are kept here so the README can stay short, and
because the reasoning matters more than the claims: each note names the exact
place a lesson is enforced, and a lesson without a test is only a story.

## Authorisation lives in the database, not in the client

Every table has a Row Level Security policy scoped to `auth.uid()`, so even a
hand-written API call cannot cross accounts, and writes go through a few
security-checked RPCs rather than the client building its own `UPDATE` or
`DELETE`. The subtle one is views: without `security_invoker`, a view runs as
its owner and silently serves everyone else's rows. Three security
passes later, each one found the same shape of bug — a rule the app stated but
the database did not enforce: text columns with no length bound, an endpoint
with no quota, a session that survived a password reset. Code can be worked
around; a constraint in Postgres cannot
([`02_rls.sql`](../supabase/migrations/02_rls.sql),
[`11_security_hardening.sql`](../supabase/migrations/11_security_hardening.sql),
[`20_input_bounds_and_quotas.sql`](../supabase/migrations/20_input_bounds_and_quotas.sql)).

## One parser, three runtimes

The highest-risk logic in the app — turning a bank SMS into a transaction — is
a single zero-dependency TypeScript package, imported by the mobile app
(offline preview), the edge function (the authoritative parse) and the test
suite, so a message previews identically everywhere. Adding a new bank format
is one module plus one golden fixture of a real message. The raw text is kept
forever, so a parser improvement can redo a transaction that was originally
read wrong ([`packages/parsers/src/index.ts`](../packages/parsers/src/index.ts)).

## Serverless functions have no memory between calls

My first rate limiter was an in-memory sliding window, and it passed every
unit test because a single test process does share memory. Supabase Edge
Functions give each request a fresh isolate, so in production the counter was
always empty and the limit never fired. The limits now live in Postgres, where
the state actually survives — and the database has the side benefit that a
hand-written API call cannot get around them
([`12_ingest_rate_limits.sql`](../supabase/migrations/12_ingest_rate_limits.sql)).

## Design for testability from the start

UI and device code cannot run in a Node test, so the pure logic is split into
its own modules — filters, CSV quoting, subscriptions, calendar arithmetic —
each with real tests. One test guards the whole app: a list of every storage
key the app builds, asserted against the characters the platform's key store
actually accepts. It caught the bug no amount of web development could
reproduce, because the browser accepts keys the phone silently rejects
([`txFilters.ts`](../apps/mobile/src/lib/txFilters.ts),
[`kvStore.test.ts`](../apps/mobile/test/kvStore.test.ts)).

## The review queue is the data engine, not a fallback

Anything the parser is not sure of lands in a review inbox instead of being
guessed at — and that inbox doubles as the collection loop for bank formats I
do not have yet. BIBD's parser went from a skeleton to verified the day a real
message arrived; Standard Chartered's stays capped below the confidence
threshold until a real sample exists. You collect the data before you trust
the model ([`packages/parsers/test/golden/`](../packages/parsers/test/golden/)).

## Friction, not features, is what loses users

The hard part of the product was never parsing a message; it was getting the
message into the app. Setup meant building an iOS automation, and the step
people abandon is the one that has to happen inside another app. I could see
the drop-off from the database alone — accounts created, versus capture tokens
created, versus tokens that ever logged a transaction. The setup flow went
from an enforced gate to an optional, resumable prompt, and the numbers are
what will tell me whether it worked.

## How it was built

The code was written with Claude Code, an AI pair programmer. The product
direction, the engineering decisions, and every merged change were mine,
reviewed and tested on real hardware before shipping.
