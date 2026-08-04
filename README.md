# Bukit Pennies

A spending tracker for Brunei that records card transactions by reading the notification text your bank already sends you.

I built this from scratch to track my own card spending in Brunei, and it grew into a working app. If it helps other people too, even better.

<p align="center">
  <a href="https://github.com/jaredoka/bukit-pennies/actions"><img src="https://img.shields.io/github/actions/workflow/status/jaredoka/bukit-pennies/ci.yml?label=CI" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow" alt="MIT License"></a>
  <a href="https://bukit-pennies.netlify.app"><img src="https://img.shields.io/badge/Live%20demo-online-brightgreen" alt="Live demo"></a>
</p>

**It never connects to a bank account.** No credentials, no open banking, no scraping. The only thing it ever processes is a message that has already arrived on your phone.

<p align="center">
  <img src="docs/screenshots/web-demo-frame.jpg" alt="Live web demo: the app framed as a phone screen on a desktop browser" width="24%">
  <img src="docs/screenshots/dashboard.jpg" alt="Dashboard: category donut and monthly totals" width="24%">
  <img src="docs/screenshots/transactions.jpg" alt="Transactions list with filters and the review queue badge" width="24%">
  <img src="docs/screenshots/insights.jpg" alt="Insights: spending by month, by category and by merchant" width="24%">
</p>

*Screenshots use seeded demo data, not real spending.*

> **Try the live demo:** [bukit-pennies.netlify.app](https://bukit-pennies.netlify.app). A sample SMS is built in, so you can watch a transaction parse in a few seconds without an iPhone.

---

## Why it works this way

Brunei's banks have no open banking API. The realistic options were to ask for bank credentials or to use something people already receive: the SMS a bank sends when a card is used.

That choice drives the whole architecture, and its limits too. There are no balances, no historical import, and no record of a purchase the bank never messaged about. In exchange, using the app means trusting it with nothing.

## How it works

```
Bank SMS  →  iOS Shortcut  →  /ingest edge function  →  Postgres  →  app
             (automation)     parse · score · dedupe     (RLS)
```

1. An **iOS Shortcuts automation** fires when a message from the bank arrives and posts its text to a private endpoint.
2. The **ingest function** parses it (amount, merchant, date, card) and scores how confident it is.
3. Confident parses are stored as `parsed`. Anything doubtful goes to a **review queue** instead of being guessed at.
4. The **app** reads it back, scoped by row in the database so an account can only ever see its own data.

The raw message is kept forever, so a parser improvement can reprocess a transaction that was originally read wrong.

## Architecture

TypeScript end to end. One zero dependency parser package is shared between the app and the server, so a message previews identically on the phone and on the backend. The app is Expo / React Native (iOS first, also runs on web and Android); the backend is Supabase (Postgres, Auth, Row Level Security, Deno edge functions); tests run on Vitest and CI on GitHub Actions.

```
┌────────────────────────────── app ──────────────────────────────┐
│  Expo / React Native (iOS-first, also runs on web + Android)     │
│  expo-router  ·  TanStack Query  ·  @bukit/parsers              │
└───────────────────────────────┬─────────────────────────────────┘
                                │ RLS-scoped queries + security-checked RPCs
┌───────────────────────────────▼────────────────── Supabase ─────┐
│  Postgres — 25 migrations, RLS on every table                    │
│  Edge Functions (Deno) — ingest, parse, dedupe, rate-limit       │
│  Auth — email/password, SecureStore session                      │
└──────────────────────────────────────────────────────────────────┘
```

The most interesting work is in the database layer, not the UI:

- **Row Level Security on every table.** `transactions`, `budgets`, `goals`, and `subscriptions` are scoped to `auth.uid()`, so isolation holds even against a hand written API call. See the RLS section of [Things I learned](#things-i-learned-building-it).
- **Writes go through RPCs.** Transactions are written through security checked functions; the client never builds its own `UPDATE` or `DELETE` against a table.
- **Views use `security_invoker`.** Without it a view runs as its owner and silently bypasses the RLS underneath. A subtle bug, fixed in migration 11.
- **Rate limits live in Postgres.** A serverless function has no memory between invocations, so the counter that survives is the one in the database (migration 12).
- **Token hygiene.** Ingest tokens are stored only as SHA-256 fingerprints; the plaintext is shown once, and a database dump yields nothing usable.
- **CI.** Tests and typechecks run on every pull request, and a GitHub Actions macOS runner builds the unsigned iOS IPA.

## Things I learned building it

**My first rate limiter did nothing.** I wrote it as an in memory sliding window, and it passed every unit test, because a single test process does share memory. Supabase Edge Functions can give each request a fresh isolate, so in production the counter was always empty and the limit never fired. The limits now live in Postgres, where the state actually survives (migration [`12_ingest_rate_limits.sql`](supabase/migrations/12_ingest_rate_limits.sql)).

**The quiet bug took the longest.** PostgREST caps a response at 1,000 rows and says nothing about it. Months in, a monthly total was a little low and nothing was throwing. The cause was that my queries read a whole period without paging, so once a window passed a thousand transactions the total just stopped counting. Noticing the number was wrong was the hard part; fixing it was a small paging helper, `fetchAllPages` in [`queries.ts`](apps/mobile/src/lib/queries.ts). Paging also needs a total order, because rows that tie on a sort column can swap between requests, dropping one and repeating another.

**Authorisation belongs in the database, not in the client.** Every table has a Row Level Security policy scoped to `auth.uid()`, so even a hand written API call cannot cross accounts. The one that keeps biting people is views: without `security_invoker`, a view runs as its owner and serves everyone everyone else's rows. I hit it once and fixed it in migration 11; it is now the rule every new view follows ([`02_rls.sql`](supabase/migrations/02_rls.sql), [`11_security_hardening.sql`](supabase/migrations/11_security_hardening.sql)).

**A font that is not deployed is just a square.** The live demo shipped with every icon as a tofu box, while `expo start` looked fine. Netlify skips the `node_modules` asset tree, so the icon font was referenced but never uploaded. Vendoring it into the app and preloading it fixed it. Obvious in hindsight; it took a live site to catch ([`_layout.tsx`](apps/mobile/app/_layout.tsx), [`webFrame.ts`](apps/mobile/src/lib/webFrame.ts)).

## Status and scope

Working: Baiduri and BIBD messages parse and log automatically on iOS; manual entry; budgets; savings goals; subscriptions; CSV export; a review queue for anything the parser is unsure of.

Deliberately not built:

- **Standard Chartered messages are not parsed.** No real sample has been collected, so that parser is capped below the confidence threshold; SCB messages land in review rather than being guessed at. If you bank with Standard Chartered, a redacted SMS screenshot would fix that parser.
- **Android capture is not implemented.** iOS first by choice. The app runs on Android but without automatic capture.
- **It is not on the App Store.** It runs on my own phone, sideloaded.

## Running it locally

Requires Node 22+, pnpm 10, and Docker.

```bash
pnpm install
pnpm exec supabase start     # local Postgres, Auth and functions
pnpm --filter @bukit/mobile web
```

`pnpm -r test` runs the suite; `pnpm -r typecheck` checks types across every package.

Deeper docs: [architecture and decisions](docs/execution-playbook.md) ·
[user guide](docs/user-guide.md) ·
[hosted deploy](docs/hosted-supabase-deploy.md) ·
[privacy policy](docs/privacy-policy.md)

Contributions are welcome; [CONTRIBUTING.md](CONTRIBUTING.md) explains the
conventions (parser golden fixtures, GitHub Flow, RLS rules).

## How it was built

I want to be honest about this: the code was written with Claude Code, an AI pair programmer. I set the product direction, made the engineering decisions, reviewed every change, and tested it on real hardware. The judgement calls are mine and I can explain any of them: dropping an unused table rather than leaving it dormant, cutting a dashboard banner because a badge already carried the same signal, and treating a back button that returned to the wrong screen as evidence the navigation structure was wrong rather than the button.

Alongside the project I am working through the codebase deliberately, layer by layer, from the zero dependency parser package up through the database, the edge function and the app. The goal is to be able to explain and modify any part of it unaided. The sections above are the parts I have studied closely enough to defend under questioning; that is exactly why they are written down, and the list grows as I keep going.

## Maintained by

[jaredoka](https://github.com/jaredoka) · [MIT licensed](LICENSE)
