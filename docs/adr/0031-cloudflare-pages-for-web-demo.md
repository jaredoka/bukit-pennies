# 0031: Cloudflare Pages hosts the web demo

- **Status:** Accepted
- **Date:** 2026-08-05

## Context

The live web demo auto-deployed on Netlify. Netlify's free tier caps at 300
build minutes/month, and by 2026-08-05 the repo had used ~75% of the August
period: Netlify builds **deploy previews on every branch push**, and the
HANDOFF history purge force-pushed eight branches in one day on top of the
normal `main` pushes. GitHub Pages was considered as the replacement but is
already serving the privacy policy and terms from `docs/`
(`jaredoka.github.io/bukit-pennies`), and GitHub allows only one Pages source
per project repo — moving the demo there would break the policy URLs the app
links to (`apps/mobile/src/lib/env.ts`).

## Decision

Host the web demo on **Cloudflare Pages** free tier (500 builds/month,
unlimited bandwidth, `_redirects` SPA fallback honored), served from
`apps/mobile/dist` via the repo's build command. Turn off Netlify deploy
previews immediately, and retire Netlify once the Pages site is verified.
Details: `docs/cloudflare-pages-deploy.md`.

## Consequences

- The demo build ceiling goes from 300 min/mo to 500 builds/mo with no
  bandwidth cap; the purge-style push storm no longer threatens the demo.
- GitHub Pages keeps serving the policies; no app code change is needed.
- The demo URL changes from `bukit-pennies.netlify.app` to `<project>.pages.dev`
  (or a custom domain), so README / CHANGELOG / `cors.ts` comment references
  must be updated in the cleanup PR.
- Netlify still holds the old URL until the site is deleted; the short overlap
  keeps the old link working for anyone who already has it.
