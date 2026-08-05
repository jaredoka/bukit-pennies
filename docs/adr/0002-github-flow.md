# 0002: GitHub Flow with one PR per phase

- **Status:** Accepted
- **Date:** 2026-07-16

## Context

A solo project still benefits from a reviewable, reversible history. The alternative (commit to main) was rejected as hard to audit.

## Decision

Feature branch off main, one PR per delivery phase, merge only when CI is green via gh pr merge.

## Consequences

Every phase is a reviewable unit; branch protection on main becomes enforceable.
