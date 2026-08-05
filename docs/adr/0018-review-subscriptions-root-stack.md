# 0018: Review and Subscriptions are root stack routes, not tabs

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

A screen reached by pushing cannot be a hidden tab: navigating to a tab is a tab switch, so there is no history to pop, canGoBack() is false, and no back button is drawn. Subscriptions had two entry points in different tabs, so a hand-rolled back button always guessed wrong.

## Decision

Review and Subscriptions are root stack routes (app/review.tsx, app/subscriptions/). Pushed screens above the tab bar also need headerBackTitle, or the back button reads the group’s route name, literally "(tabs)".

## Consequences

Real navigation history for these screens; the "(tabs)" back-button bug is documented so it is not reintroduced.
