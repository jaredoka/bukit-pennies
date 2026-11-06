# 0034: Optional transaction directions

- **Status:** Accepted
- **Date:** 2026-11-06
- **Supersedes:** [0014](0014-remove-direction-filter.md)

## Context

Every transaction used to be a spend: amounts were positive and every read path
summed them. That made a salary, a shop refund and a bank withdrawal either
impossible to record or silently wrong. ADR-0014 removed the direction filter
because no write path could produce anything but an outgoing row, and noted that
it would return with refunds.

Two requirements shape the design:

1. **Direction is optional.** Forcing a choice on a quick cash entry is friction
   for no benefit, and some people do not want to tag anything.
2. **"Money in" means money arriving**, not accounting income. A salary, a gift
   and someone repaying you all count; a refund is a different thing.

If "Not set" were excluded from totals, every existing transaction would drop
out of the dashboard and budgets the moment this shipped. If a refund were also
counted as money in, one shop refund would improve the dashboard twice: once by
raising money in and once by lowering spending.

## Decision

Add a nullable `transactions.direction` with values `out`, `in`, `refund` and
`transfer`.

- **`NULL` means Not set and is an effective `out` in every aggregate.** This
  preserves every existing total and lets people ignore the feature entirely.
  Existing rows are backfilled to `out`; new rows stay `NULL` unless a capture
  or the user says otherwise.
- **Bank ingest writes `out` explicitly.** The parser only understands debit
  messages, so inferring anything else would be a guess.
- **`refund` is a subtype of money in that reduces its category's spending**
  rather than adding to money in. It therefore requires a category, enforced by
  a database check constraint.
- **`transfer` is recorded but excluded from spending, money in, budgets and
  Insights.** It moves the user's own money.
- The summary table stores the **effective** direction
  (`coalesce(direction, 'out')`), so no RPC needs a nullable branch. Transfers
  never enter the summary.
- Spending is `out + not set − refund`, floored per category at zero so a period
  cannot show a negative slice.
- **Dashboard Remaining/Saved uses recorded money in for the month**, falling
  back to the static monthly income in Settings only when no money-in entries
  exist.
- The transaction list regains a direction filter; `NULL` is handled with an
  explicit `is null` / `or`, the same way Uncategorised is.
- The CSV export gains `direction` and `signed_amount`, blank for Not set and
  for transfers respectively.

## Consequences

- Totals for people who never tag anything are unchanged.
- The app can now record salary, refunds and transfers without inventing a
  negative-amount convention.
- Refunds and money in are separate concepts in code and copy, which keeps the
  dashboard honest.
- A refund that exceeds the period's spending for its category disappears from
  that period's breakdown rather than drawing a negative slice.
- Money in is not the same as accounting income; reports that later need an
  income concept will have to define it separately.
