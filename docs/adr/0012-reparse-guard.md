# 0012: Re-parse is a guarded module, not inline screen code

- **Status:** Accepted
- **Date:** 2026-07-31

## Context

Re-parsing on the detail screen wrote logic into the UI. BIBD messages carry no date, so re-parsing without one used to blank occurred_at and drop the row out of every dashboard query.

## Decision

Re-parse is guarded by lib/reparse.ts: it passes the row’s own timestamp back as receivedAt, never overwrites a date it cannot replace, is not offered for source=manual rows, and asks before overwriting. test/reparse.test.ts is the contract.

## Consequences

Re-parse can never blank a date it cannot reproduce; the behaviour is pinned by a test.
