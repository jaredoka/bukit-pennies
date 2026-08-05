# 0022: Money pairs render with one currency, left

- **Status:** Accepted
- **Date:** 2026-08-02

## Context

Repeated "BND X / BND Y" was noisy; privacy cloaking had to apply consistently to both halves of a pair.

## Decision

Money pairs render as "BND 100.00 / 500.00" (currency once, left) via formatMoneyPair plus a cloak-aware pair() on usePrivacy; goal amounts are single-line (adjustsFontSizeToFit) (PR #87).

## Consequences

Consistent, compact money display; cloaking covers both values.
