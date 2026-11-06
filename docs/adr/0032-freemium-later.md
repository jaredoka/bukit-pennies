# 0032: Freemium later; core and shipped features stay free

- **Status:** Accepted
- **Date:** 2026-08-10

## Context

ADR-0023 deferred monetization ("monetization is decided later") and the
terms of service said the app had "no paid tiers, subscriptions or adverts".
A future freemium turn would need to reverse that wording; the project
prefers to record the direction deliberately rather than discover it later.

## Decision

Bukit Pennies stays free today. Freemium is the agreed future direction:
the core job — capturing bank notification text and seeing your spending —
stays free forever, and every feature already shipped stays free. Paid
features, when introduced, are new depth features only. The privacy promise
is unaffected: no ads, no analytics SDK, no data sharing.

## Consequences

Terms may be updated to reflect paid tiers; the review-queue flywheel,
capture, and existing features never sit behind a paywall. The hosted
service is what may eventually be charged for, not the code (MIT).
