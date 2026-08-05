# Bukit Pennies

A spending tracker for Brunei that records card transactions by reading the notification text your bank already sends you.

I built this to track my own card spending, and learning the whole stack to do it meant wrong turns, rewritten code, and a working app on my phone at the end. If it helps other people too, it's an app I'd be proud to have built.

<p align="center">
  <a href="https://github.com/jaredoka/bukit-pennies/actions"><img src="https://img.shields.io/github/actions/workflow/status/jaredoka/bukit-pennies/ci.yml?label=CI" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow" alt="MIT License"></a>
  <a href="https://bukit-pennies.netlify.app"><img src="https://img.shields.io/badge/Live%20demo-online-brightgreen" alt="Live demo"></a>
</p>

<p align="center">
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=fff" alt="TypeScript"></a>
  <a href="https://expo.dev"><img src="https://img.shields.io/badge/Expo-000020?logo=expo" alt="Expo"></a>
  <a href="https://reactnative.dev"><img src="https://img.shields.io/badge/React%20Native-61DAFB?logo=react&logoColor=000" alt="React Native"></a>
  <a href="https://supabase.com"><img src="https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=000" alt="Supabase"></a>
  <a href="https://vitest.dev"><img src="https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=fff" alt="Vitest"></a>
  <a href="https://pnpm.io"><img src="https://img.shields.io/badge/pnpm-F69220?logo=pnpm&logoColor=000" alt="pnpm"></a>
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

## Contents

- [Why it works this way](#why-it-works-this-way)
- [How it works](#how-it-works)
- [Architecture](#architecture)
- [Design notes](#design-notes)
- [Status and scope](#status-and-scope)
- [Running it locally](#running-it-locally)
- [How it was built](#how-it-was-built)
- [Maintained by](#maintained-by)

---

## Why it works this way

Brunei's banks have no open banking API. The realistic options were to ask for bank credentials or to use something people already receive: the SMS a bank sends when a card is used.

That choice drives the whole architecture, and its limits too. There are no balances, no historical import, and no record of a purchase the bank never messaged about. You trust it with a text message, never with a bank account.

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

## Design notes

Short versions of the lessons the architecture is built on; the full essays live in [Building Bukit Pennies](docs/building-bukit-pennies.md).

- **Authorisation lives in the database.** Every table has Row Level Security scoped to `auth.uid()`; views use `security_invoker` or they silently run as their owner. Writes go through security-checked RPCs, never client-built `UPDATE`/`DELETE`.
- **One parser, three runtimes.** The bank-SMS parser is a single zero-dependency TypeScript package used by the app, the edge function, and the test suite, so a message previews identically everywhere. Every real bank message becomes a golden fixture.
- **Serverless functions have no memory.** The rate limiter is a table, not an in-memory counter — an edge function gets a fresh isolate per request, so anything that must survive lives in Postgres.
- **The review queue is the data engine.** Anything the parser isn't sure of goes to a review inbox, which doubles as the collection loop for bank formats that lack a real sample yet.
- **Test the logic you can, without the device.** Pure logic lives in its own modules with real tests; one test pins every storage key the app builds against what the platform's key store actually accepts.

## Status and scope

**Working**
- [x] Baiduri and BIBD capture on iOS — messages parse and log automatically
- [x] Manual entry, budgets, savings goals, subscriptions, CSV export
- [x] A review queue for anything the parser isn't sure of

**Next up**
- [ ] Standard Chartered parsing — capped below the confidence threshold until a real message arrives; a redacted screenshot would fix it
- [ ] Android capture — planned after the iOS release
- [ ] App Store release — in progress; currently sideloaded on my own phone

**Deliberately not built**
- Bank aggregation. No balances, no imports, no connection to a bank account — by design, and why the app only ever sees a text message.

## Running it locally

Requires Node 22+, pnpm 10, and Docker.

```bash
pnpm install
pnpm exec supabase start     # local Postgres, Auth and functions
pnpm --filter @bukit/mobile web
```

`pnpm -r test` runs the suite; `pnpm -r typecheck` checks types across every package.

Deeper docs: [architecture and decisions](docs/architecture-and-decisions.md) ·
[user guide](docs/user-guide.md) ·
[hosted deploy](docs/hosted-supabase-deploy.md) ·
[building this app](docs/building-bukit-pennies.md) ·
[privacy policy](docs/privacy-policy.md)

Release history: [CHANGELOG.md](CHANGELOG.md) · tag [`v0.1.0`](https://github.com/jaredoka/bukit-pennies/releases/tag/v0.1.0)

Contributions are welcome; [CONTRIBUTING.md](CONTRIBUTING.md) explains the
conventions (parser golden fixtures, GitHub Flow, RLS rules).

## How it was built

I want to be honest about this: the code was written with Claude Code, an AI pair programmer. I set the product direction, made the engineering decisions, reviewed every change, and tested it on real hardware. The judgement calls are mine and I can explain any of them: dropping an unused table rather than leaving it dormant, cutting a dashboard banner because a badge already carried the same signal, and treating a back button that returned to the wrong screen as evidence the navigation structure was wrong rather than the button. A fuller account of the lessons behind the architecture is in [Building Bukit Pennies](docs/building-bukit-pennies.md).

## Maintained by

[jaredoka](https://github.com/jaredoka) · [MIT licensed](LICENSE)
