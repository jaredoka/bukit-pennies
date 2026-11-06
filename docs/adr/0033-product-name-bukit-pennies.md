# 0033: The product name is "Bukit Pennies"

- **Status:** Accepted
- **Date:** 2026-09-26

## Context

"Bukit Pennies" had been the working name from the repo, and Phase 3.5
branding plus store listings were blocked until the owner confirmed it (the
repo carried that as an open item). A rename was explored: candidates were
checked against App Store name availability and domain registrability. The
leading candidate, "TapLog", was rejected because several live apps already
use the exact name (including in the Brunei and Singapore stores) and every
good domain was taken, so it could be neither uniquely named nor defended.

## Decision

Keep **"Bukit Pennies"** as the product name, permanently. No rename.

The name is distinctive, carries no availability conflict, and matches the
app's origin (a hill of small, individually unremarkable transactions).
Keeping it also avoids a cross-cutting rename of display strings, the Expo
identity, the `@bukit/*` workspace scope, device-local keys, and the
out-of-repo systems that reference the name.

## Consequences

Phase 3.5 branding and store listings are unblocked and proceed under this
name. No code or identifier changes are required. The remaining branding work
is display-only: app icon/splash assets already exist (`coin_v2`, ADR-0026)
and do not depend on the name.
