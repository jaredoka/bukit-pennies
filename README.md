# Bukit Pennies

A spending tracker for Brunei that records card transactions by reading the notification text your bank already sends you.

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

**The no bank account rule shaped everything.** "Never touch a bank account" was a trust decision, not a technical one, and it determined the schema, the ingest flow and the App Store story. Keeping `raw_text` forever came from the same place: if a parser reads a message wrong today, the message is still there to try again tomorrow. If I had only stored the extracted fields, a parser bug would have been permanent data loss.

**Serverless functions have no memory.** My first rate limiter was an in memory sliding window. Supabase Edge Functions can give every request a fresh isolate, so the counter was always empty: the limiter looked like it worked and even passed its unit tests (a single test process does share memory), but it was inert in production. The limits now live in Postgres, the one piece of state that survives between invocations.
&nbsp;→ [`12_ingest_rate_limits.sql`](supabase/migrations/12_ingest_rate_limits.sql)

**A missing error can look like success.** PostgREST caps a response at 1,000 rows and says nothing about having done so. My queries that read a whole month or year had no paging, so every total quietly understated once a window passed a thousand transactions. Nothing failed; the numbers were just wrong. Paging also needs a total order: rows that tie on the sort column can swap between requests, so you lose one and repeat another.
&nbsp;→ `fetchAllPages` in [`queries.ts`](apps/mobile/src/lib/queries.ts)

**Authorisation belongs in the database, not the client.** Every table has a Row Level Security policy tying rows to the signed-in user, so isolation holds even against a hand written API call; it is not a filter the client has to remember. Capture tokens are shown once and stored only as a SHA-256 hash, so a database dump yields nothing usable. The subtle part was views: without `security_invoker`, a view runs as its owner and hands every user everyone else's rows, bypassing the RLS underneath.
&nbsp;→ [`02_rls.sql`](supabase/migrations/02_rls.sql) ·
[`11_security_hardening.sql`](supabase/migrations/11_security_hardening.sql)

**What you never deploy is a bug you cannot see.** The web demo broke in two ways that `expo start` never shows. Netlify skips the `node_modules` asset tree Metro writes, so the icon font was referenced but never deployed, and every icon was a tofu square on the live site. The shared bottom sheet had the same shape of problem: a full viewport React Native Modal that, on web, escaped the phone frame the demo renders inside. The fix for both was to stop trusting the toolchain's invisible defaults: vendor the font into the app and preload it, and let the modal import the frame's constants so it cannot outgrow its frame.
&nbsp;→ [`_layout.tsx`](apps/mobile/app/_layout.tsx) ·
[`webFrame.ts`](apps/mobile/src/lib/webFrame.ts)

## Status and scope

Working: Baiduri and BIBD messages parse and log automatically on iOS; manual entry; budgets; savings goals; subscriptions; CSV export; a review queue for anything the parser is unsure of.

Deliberately not built:

- **Standard Chartered messages are not parsed.** No real sample has been collected, so that parser is capped below the confidence threshold; SCB messages land in review rather than being guessed at.
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

## How it was built

I want to be honest about this: the code was written with Claude Code, an AI pair programmer. I set the product direction, made the engineering decisions, reviewed every change, and tested it on real hardware. The judgement calls are mine and I can explain any of them: dropping an unused table rather than leaving it dormant, cutting a dashboard banner because a badge already carried the same signal, and treating a back button that returned to the wrong screen as evidence the navigation structure was wrong rather than the button.

Alongside the project I am working through the codebase deliberately, layer by layer, from the zero dependency parser package up through the database, the edge function and the app. The goal is to be able to explain and modify any part of it unaided. The sections above are the parts I have studied closely enough to defend under questioning; that is exactly why they are written down, and the list grows as I keep going.

## Maintained by

[jaredoka](https://github.com/jaredoka) · [MIT licensed](LICENSE)
