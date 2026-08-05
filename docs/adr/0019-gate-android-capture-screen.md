# 0019: Gate the Android capture screen, don’t delete it

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

The listener is designed and deferred, not dropped (ADR-0005). On iOS the screen was a settings row promising a feature the device cannot run — placeholder content in a store build.

## Decision

Gate the screen to Platform.OS === "android" rather than delete it. The screen holds the privacy-boundary copy that Android story needs; the gate resolves when an Android build ships.

## Consequences

No placeholder in the iOS store build; the Android feature keeps a home and its privacy framing.
