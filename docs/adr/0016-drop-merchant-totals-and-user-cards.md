# 0016: Migration 22 drops merchant_totals and user_cards

- **Status:** Accepted
- **Date:** 2026-07-31

## Context

merchant_totals fed a dashboard card removed 2026-07-30 (Insights computes merchants from rows it already has). user_cards was created for card labels, written only by the dev seed, read by nothing. 04_grants.sql grants authenticated DML on every table by default, so an object that exists is a liability every future audit must re-derive.

## Decision

Drop both tables in migration 22. Card labels remain a good idea: when built, the table returns in a migration alongside the screen that reads it, shaped for what that screen needs.

## Consequences

A smaller schema with no dormant surfaces; dormant ideas are documented in the ADR instead of occupying the database.
