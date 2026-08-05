# 0029: Wide web renders inside a phone-width frame

- **Status:** Accepted
- **Date:** 2026-08-03

## Context

A bare desktop link to a mobile app reads as a broken website (PRs #101–#102).

## Decision

On wide web windows the demo renders inside a phone-width frame (420px, rounded, shadowed, breakpoint 520px; full-bleed below that and on native). The shared SheetShell modal sizes itself to that frame instead of the viewport. Frame constants live in apps/mobile/src/lib/webFrame.ts so the frame and its sheets cannot drift apart.

## Consequences

Desktop visitors see a phone, not a stretched page; the frame and modal share one source of truth.
