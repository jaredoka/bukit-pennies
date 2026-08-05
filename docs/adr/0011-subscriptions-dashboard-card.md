# 0011: Subscriptions live on a dashboard card, display-only

- **Status:** Accepted
- **Date:** 2026-07-30

## Context

Declared subscriptions and detectRecurring clusters both describe recurring charges, but the charge itself is already a transaction. Counting it again in budgets would double-count the same money.

## Decision

Subscriptions (migration 18) live on a dashboard card that opens a full screen, not a sixth tab. Declared rows and detectRecurring clusters merge into one list. Display-only: never a budget input; the captured transaction is what counts toward the monthly limit. No reminders are scheduled from subscriptions.

## Consequences

Subscriptions inform but never sum into spend totals; the monthly limit is always the sum of real transactions.
