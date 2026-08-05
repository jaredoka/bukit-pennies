# 0027: Transactions list has no default date filter (reverts ADR-0024)

- **Status:** Accepted (supersedes ADR-0024)
- **Date:** 2026-08-02

## Context

A default that is secretly a filter hides older transactions and reads as one. The date chip is the honest place to open a window.

## Decision

Revert to all-time, newest-first. The first screen is simply the newest page (TX_PAGE_SIZE = 50); scrolling auto-loads the next page. A date window is just another filter from the Date chip.

## Consequences

ADR-0024 is superseded. The list always shows the newest data on open; nothing is hidden by default.
