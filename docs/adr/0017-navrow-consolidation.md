# 0017: Consolidate settings rows into one NavRow; pin TypeScript

- **Status:** Accepted
- **Date:** 2026-07-31

## Context

Three byte-identical copies of the settings navigation row had drifted; two TypeScript versions across packages could diverge behaviour.

## Decision

Settings navigation rows go through one NavRow in components/ui.tsx (inset for the bare grouped list, default for rows inside a Card). TypeScript is pinned to one version (~6.0.3) across all three packages.

## Consequences

One implementation of a repeated UI; a single compiler version across the workspace.
