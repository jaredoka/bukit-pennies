# 0021: DismissKeyboardView drops tap-to-dismiss on web

- **Status:** Accepted
- **Date:** 2026-08-02

## Context

RN-web’s Keyboard.dismiss blurs the focused field via the bubbling click (PR #87).

## Decision

DismissKeyboardView drops its tap-to-dismiss behaviour on web.

## Consequences

Field focus survives taps on web; native tap-to-dismiss is unchanged.
