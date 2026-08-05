# 0025: "Reset all transactions" is a confirmed destructive action

- **Status:** Accepted
- **Date:** 2026-08-02

## Context

A destructive, user-facing action belonged somewhere deliberate, not buried in a settings row.

## Decision

Move it to its own Settings page (Settings → Spending & data), confirmed by typing the phrase RESET-TRANSACTIONS. It deletes the account’s transactions only, and with them each row’s category mapping (transactions.category_id is a column; there is no assignment table). Budgets, goals, subscriptions, cards, and settings survive.

## Consequences

A destructive action that cannot be triggered by a stray tap; scope of the deletion is precise and documented.
