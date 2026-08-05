# 0001: Expo + Supabase as the stack

- **Status:** Accepted
- **Date:** 2026-07-16

## Context

The whole product — parser, edge function, mobile app, tests — is TypeScript, and the parser code must run in all four places. The alternative was a separate Node API and a second language on the client.

## Decision

Expo/React Native over Flutter so the parser stays one TS codebase across app, server, and tests; Supabase over a hand-built Node API for Postgres, Auth, RLS, and Deno edge functions.

## Consequences

One language everywhere; the parser package has to run in Deno and vitest unchanged (zero deps, explicit .ts extensions). Supabase hosting limits and the serverless model are accepted.
