# 0015: Review stays off the tab bar behind a badge button

- **Status:** Accepted
- **Date:** 2026-07-31

## Context

Five tabs is the practical maximum, and a dismissible dashboard banner was a second copy of a signal a persistent badge already carried.

## Decision

Review is reached from exactly one place: a permanent tray button in the Transactions header carrying a useReviewCount() badge. The banner is removed and not reintroduced. A screen hidden with href:null needs an explicit link in the same PR (review and capture both failed this). capture.tsx is deleted; CaptureSheet in transactions/index.tsx is the reachable copy of the same feature.

## Consequences

One entry point per secondary feature; hiding a route without a replacement link is now a recognized mistake.
