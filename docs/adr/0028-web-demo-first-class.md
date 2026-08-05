# 0028: The web demo is a first-class surface

- **Status:** Accepted
- **Date:** 2026-08-03

## Context

A bare Netlify deploy of the app looked broken: dark theme jarred, no sample data meant nothing to watch, and icons were missing because Netlify skips the __node_modules asset tree (PRs #98–#100).

## Decision

Make the demo a first-class surface: default to light theme (Settings can still pin Light/Dark/System); the welcome hero exits to the dashboard with a one-tap sample Baiduri SMS (BND 10.00) so anyone can watch a parse; icons deploy via a vendored Ionicons.ttf; ingest/feedback share edge-function CORS handling in supabase/functions/_shared/cors.ts.

## Consequences

The demo works for someone who has never touched the product; one CORS implementation for the public functions.
