# 0007: Transaction filters run in the database

- **Status:** Accepted
- **Date:** 2026-07-30

## Context

Filtering a client-cached, capped array meant filters silently covered only the loaded page — totals and lists disagreed once data exceeded one page.

## Decision

Filters run in the database on the list pages (50/page); the client stops filtering a capped array. Filter pickers read the transaction_facets view, not the loaded rows.

## Consequences

Filtered results are correct at any page depth; the facets view is maintained as the source of truth for filter options.
