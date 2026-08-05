# 0024: Transactions list defaults to the last 30 days

- **Status:** Superseded by ADR-0027
- **Date:** 2026-08-02

## Context

A count-based "first page" means different things for different users; a time window is predictable and matches the monthly mental model.

## Decision

The transactions list defaults to the last 30 days on first open (newest-first, infinite scroll beyond).

## Consequences

Superseded 2026-08-02 by ADR-0027, which reverted to no default filter.
