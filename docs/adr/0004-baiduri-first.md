# 0004: Baiduri-first parser with the review inbox as the collection loop

- **Status:** Accepted
- **Date:** 2026-07-16

## Context

Only one real bank SMS format (Baiduri) existed. BIBD and Standard Chartered formats could only be guessed.

## Decision

Build Baiduri fully from the real sample; keep BIBD/SCB as UNVERIFIED skeleton parsers; route everything unverifiable into the review inbox, which doubles as the sample-collection loop.

## Consequences

Confidence caps keep guessed formats out of auto-logging until a real message exists. Promoting a bank is a defined procedure, not an ad-hoc rewrite.
