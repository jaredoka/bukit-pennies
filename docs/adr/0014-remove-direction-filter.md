# 0014: Remove the Direction (incoming/outgoing) filter

- **Status:** Accepted
- **Date:** 2026-07-31

## Context

No write path can produce a negative amount, so an "Incoming" filter could only ever return nothing. The filter promised a dimension the data could not have.

## Decision

Remove the Direction filter rather than fix it. It returns with refunds, if refunds are ever built.

## Consequences

One fewer dead UI affordance; refunds (money-in) are recognised as new work when they arrive (see invariant: nothing can produce a negative amount).
