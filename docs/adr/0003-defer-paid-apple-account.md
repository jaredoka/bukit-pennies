# 0003: Defer the paid Apple Developer account

- **Status:** Accepted
- **Date:** 2026-07-16

## Context

A $99/year Apple Developer account is a sunk cost before the app is production-ready. Real-device iOS testing was needed sooner than that budget was.

## Decision

Defer the paid account until production-ready. Test on a real iPhone via Sideloadly + a free Apple ID + an unsigned IPA built on a GitHub Actions macOS runner.

## Consequences

A weekly re-sideload cadence, no Sign in with Apple, no share extension in sideload builds. TestFlight stays deferred (ADR-0003 companion constraint).
