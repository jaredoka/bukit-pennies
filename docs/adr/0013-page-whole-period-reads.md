# 0013: Whole-period reads page through fetchAllPages

- **Status:** Accepted
- **Date:** 2026-07-31

## Context

PostgREST truncates responses at max_rows (1000) silently, so an unpaged month/year read understated every total built from it.

## Decision

Any query that reads a whole period goes through fetchAllPages; paging callbacks must order by id so range() slices are stable. REVIEW_CONFIDENCE_THRESHOLD moves into @bukit/parsers beside the weights, joining MAX_TEXT_BYTES as a number the server gate and client previews cannot state differently.

## Consequences

Totals are correct at any data size; the confidence threshold has one definition, not two.
