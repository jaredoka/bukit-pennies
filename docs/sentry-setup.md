# Sentry Setup Guide

Crash and error reporting for the Bukit Pennies mobile app using Sentry's
free Developer plan.

## 1. Create a Sentry project

1. Sign up at [sentry.io](https://sentry.io) (free Developer plan: 5K
   errors/month, 1 user).
2. **Create project** → platform **React Native** → name it `bukit-pennies-mobile`.
3. Copy the **DSN** from **Settings → Client Keys (DSN)**.

## 2. Configure the app

Add the DSN to your environment:

```
# In apps/mobile/.env.production (or EAS secrets)
EXPO_PUBLIC_SENTRY_DSN=https://YOUR_KEY@o0.ingest.us.sentry.io/0
```

For EAS builds:

```bash
eas secret:create --name EXPO_PUBLIC_SENTRY_DSN --value "https://..."
```

The Sentry plugin in `app.json` is already configured. Update the
`organization` and `project` fields if your Sentry org/project names differ:

```json
["@sentry/react-native/expo", {
  "organization": "your-sentry-org",
  "project": "your-sentry-project"
}]
```

## 3. Source maps (EAS builds)

**`eas.json`'s production profile ships `SENTRY_DISABLE_AUTO_UPLOAD=true`.**
That is deliberate: the `@sentry/react-native/expo` plugin otherwise tries to
upload source maps during the build and **fails the build** when
`SENTRY_AUTH_TOKEN` is absent. A first TestFlight build that dies 20 minutes in
over missing source maps is a worse outcome than one that succeeds with
unminified stack traces.

To turn uploads on — worth doing once you are past the first successful build:

```bash
eas secret:create --name SENTRY_AUTH_TOKEN --value "sntrys_..."
```

then delete the `SENTRY_DISABLE_AUTO_UPLOAD` line from `eas.json`. Without it
crashes still report; the stack traces are just minified.

## 3a. Preflight before every production build

Two Sentry switches fail *quietly* in opposite directions — no DSN means the
app ships with reporting silently off, and auto-upload left on means the build
dies. Neither is visible until it bites, so:

```bash
pnpm release:check
```

It reads `eas.json` and `app.json` and reports both switches, along with
leftover `FILL-ME` placeholders, a missing EAS `projectId`, an unbumped
version, and — the one it treats as an outright error — a
non-`anon` Supabase key, which would ship an RLS-bypassing credential inside
the app binary. Errors exit non-zero; warnings do not, because some are
legitimate choices and a gate you learn to ignore is worthless.

It cannot see EAS secrets (those live server-side), so if it warns about a
missing DSN, confirm with `eas secret:list` before worrying.

## 4. What gets reported

- **Unhandled JS exceptions** and native crashes (automatic).
- **Low-confidence parses** in the ingest function are logged as structured
  warnings (visible in Supabase function logs, not Sentry — the edge function
  runs in Deno, not the app).
- Sentry is **disabled in development** (`__DEV__` check) and on **web**
  (web is dev-only).
- No PII is sent (`sendDefaultPii: false`).

## 5. Edge function monitoring

The ingest edge function logs structured JSON to stdout/stderr. View these in
the Supabase dashboard under **Edge Functions → ingest → Logs**.

Structured fields emitted:

| Level | `msg` | When |
|---|---|---|
| `warn` | `low_confidence_parse` | A transaction was created with `needs_review` status |
| `error` | `ingest_failed` | An unhandled exception in the ingest handler |

To set up alerts on these, use Supabase's log drain feature (available on
paid tier) to forward to Sentry, Datadog, or any HTTP endpoint.
