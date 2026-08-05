# 0005: Scope this effort to "fully functional on iOS for testing"

- **Status:** Accepted
- **Date:** 2026-07-16

## Context

The Android notification listener is the riskiest native module and could not be tested on the available devices. Shipping both platforms at once doubled the unverifiable surface.

## Decision

Scope through "fully functional on iOS for testing"; defer the Android listener module.

## Consequences

Android capture is a deferred feature with a designed (unbuilt) listener; the capture screen is gated rather than deleted (ADR-0019).
