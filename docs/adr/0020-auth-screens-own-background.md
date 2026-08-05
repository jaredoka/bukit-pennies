# 0020: Auth screens render their own background

- **Status:** Accepted
- **Date:** 2026-08-02

## Context

A transparent screen over a native-stack container hid the coin field and cost compositing (PR #87).

## Decision

Auth screens paint colors.bg themselves and mount <HexBackground/>; (auth)/_layout.tsx is a plain Stack again.

## Consequences

The coin field renders reliably on every auth screen; layout stack is simpler.
