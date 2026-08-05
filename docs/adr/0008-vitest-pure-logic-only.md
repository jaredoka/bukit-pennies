# 0008: Vitest covers pure logic only in the app

- **Status:** Accepted
- **Date:** 2026-07-30

## Context

UI and device code cannot run in a Node test; component-rendering tests added a framework with little payoff for a solo project.

## Decision

apps/mobile carries vitest for pure logic only (no component rendering); picked up by pnpm -r test and CI unchanged.

## Consequences

Logic that must be tested is extracted into pure modules; device behaviour is verified by the owner checklist instead.
