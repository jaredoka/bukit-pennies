# Architecture Decision Records

Decisions that shaped Bukit Pennies, recorded one file per decision. New
decisions and reversals get a new number in order; a decision that reverses an
earlier one says so and links back.

Each ADR follows the same shape: **Status** (Accepted or Superseded), **Date**,
**Context** (why the decision needed making), **Decision** (what was chosen),
and **Consequences** (what it means to live with it).

## Index

| # | Decision | Date | Status |
|---|---|---|---|
| [0001](0001-expo-and-supabase.md) | Expo + Supabase as the stack | 2026-07-16 | Accepted |
| [0002](0002-github-flow.md) | GitHub Flow with one PR per phase | 2026-07-16 | Accepted |
| [0003](0003-defer-paid-apple-account.md) | Defer the paid Apple Developer account | 2026-07-16 | Accepted |
| [0004](0004-baiduri-first.md) | Baiduri-first parser with the review inbox as the collection loop | 2026-07-16 | Accepted |
| [0005](0005-scope-to-ios-testing.md) | Scope this effort to "fully functional on iOS for testing" | 2026-07-16 | Accepted |
| [0006](0006-phase-by-phase-cadence.md) | Stop after each merged phase and ask the owner | 2026-07-16 | Accepted |
| [0007](0007-server-side-transaction-filters.md) | Transaction filters run in the database | 2026-07-30 | Accepted |
| [0008](0008-vitest-pure-logic-only.md) | Vitest covers pure logic only in the app | 2026-07-30 | Accepted |
| [0009](0009-remove-hornbill-mascot.md) | Remove the hornbill mascot | 2026-07-30 | Accepted |
| [0010](0010-dashboard-cuts.md) | Dashboard drops Daily spend, Month by month, and Top merchants | 2026-07-30 | Accepted |
| [0011](0011-subscriptions-dashboard-card.md) | Subscriptions live on a dashboard card, display-only | 2026-07-30 | Accepted |
| [0012](0012-reparse-guard.md) | Re-parse is a guarded module, not inline screen code | 2026-07-31 | Accepted |
| [0013](0013-page-whole-period-reads.md) | Whole-period reads page through `fetchAllPages` | 2026-07-31 | Accepted |
| [0014](0014-remove-direction-filter.md) | Remove the Direction (incoming/outgoing) filter | 2026-07-31 | Accepted |
| [0015](0015-review-off-tab-bar.md) | Review stays off the tab bar behind a badge button | 2026-07-31 | Accepted |
| [0016](0016-drop-merchant-totals-and-user-cards.md) | Migration 22 drops `merchant_totals` and `user_cards` | 2026-07-31 | Accepted |
| [0017](0017-navrow-consolidation.md) | Consolidate settings rows into one `NavRow`; pin TypeScript | 2026-07-31 | Accepted |
| [0018](0018-review-subscriptions-root-stack.md) | Review and Subscriptions are root stack routes, not tabs | 2026-08-01 | Accepted |
| [0019](0019-gate-android-capture-screen.md) | Gate the Android capture screen, don't delete it | 2026-08-01 | Accepted |
| [0020](0020-auth-screens-own-background.md) | Auth screens render their own background | 2026-08-02 | Accepted |
| [0021](0021-dismisskeyboardview-web.md) | `DismissKeyboardView` drops tap-to-dismiss on web | 2026-08-02 | Accepted |
| [0022](0022-money-pair-format.md) | Money pairs render with one currency, left | 2026-08-02 | Accepted |
| [0023](0023-product-strategy.md) | Product strategy: store-ready freemium, English-only, solo | 2026-08-02 | Accepted |
| [0024](0024-default-30-day-window.md) | Transactions list defaults to the last 30 days | 2026-08-02 | [Superseded](0027-no-default-date-filter.md) |
| [0025](0025-reset-transactions-page.md) | "Reset all transactions" is a confirmed destructive action | 2026-08-02 | Accepted |
| [0026](0026-coin-v2-icon.md) | Hand-drawn `coin_v2` becomes the app icon set | 2026-08-02 | Accepted |
| [0027](0027-no-default-date-filter.md) | Transactions list has no default date filter | 2026-08-02 | Accepted (supersedes [0024](0024-default-30-day-window.md)) |
| [0028](0028-web-demo-first-class.md) | The web demo is a first-class surface | 2026-08-03 | Accepted |
| [0029](0029-phone-width-web-frame.md) | Wide web renders inside a phone-width frame | 2026-08-03 | Accepted |
| [0030](0030-docs-reframe-and-adr-split.md) | Public docs reframe + ADR split | 2026-08-05 | Accepted |
