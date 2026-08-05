# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Live web demo moved from Netlify to Cloudflare Pages (free tier: 500
  builds/month, unlimited bandwidth). The demo is now at
  https://bukit-pennies.pages.dev.
- Repo landing page polished: homepage now points at the live demo, the
  AI-assistance disclosure moved out of the README into
  `docs/building-bukit-pennies.md`, and a social preview image was added.

### Planned
- Standard Chartered parsing — capped below the confidence threshold until a
  real message arrives
- Android capture (notification listener) — planned after the iOS release
- App Store release — currently sideloaded on the owner's device

## [0.1.0] — 2026-08-05

First tagged release. The app is functional on iOS via Sideloadly, runs as a
live web demo, and its public repository is set up for contributions.

### Added
- Bank SMS capture on iOS: Baiduri and BIBD messages parse and log
  automatically via an iOS Shortcuts automation posting to the ingest endpoint
- Standard Chartered skeleton parser — capped below the confidence threshold
  until a real sample arrives
- Review queue for any message the parser is not confident about; doubles as
  the sample-collection loop for unverified bank formats
- Manual entry, budgets, savings goals, subscriptions, CSV export
- Dashboard with income donut, monthly totals, and category breakdowns;
  Insights tab with month-over-month change and stacked category trends
- Dark/light/system theme with persisted choice
- Full auth surface: email/password sign-up with breached-password screening,
  password reset, account deletion (in-app, Apple-guideline compliant)
- Live web demo at bukit-pennies.netlify.app with a built-in sample SMS
- Privacy policy, terms, and user guide

### Security
- Row Level Security on every table scoped to `auth.uid()`; all views use
  `security_invoker`
- Writes go through security-checked RPCs; a restricted RPC surface
- Ingest tokens stored only as SHA-256 fingerprints, revealed once
- Durable Postgres-based rate limiting per user and per token
- Input bounds and quotas; revoke-all-siblings on account reset
- `supabase db advisors --type security` runs as a deploy step; advisors output
  tracked in `docs/db-advisors.md`

### Changed
- Transactions list shows all time, newest first, paged by 50; filters run in
  the database rather than on a capped client array
- Dashboard trimmed to what Insights does not already cover
- Hornbill mascot removed from the app entirely; hand-drawn penny-coin brand
  mark replaces it

### Infrastructure
- CI on GitHub Actions: tests and typechecks on every pull request, plus a
  migration gate that boots a throwaway Supabase stack and proves the full
  migration history applies
- Unsigned iOS IPA built on a macOS runner for free-Apple-ID sideloading
- Netlify auto-deploy for the live web demo
- GitHub branch protection on `main`: PR required, status checks required
  (`CI / test`, `CI / migration-check`), no force-pushes or deletions
