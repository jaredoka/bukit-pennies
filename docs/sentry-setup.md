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

For source-map uploads (readable stack traces), set the Sentry auth token as
an EAS secret:

```bash
eas secret:create --name SENTRY_AUTH_TOKEN --value "sntrys_..."
```

The `@sentry/react-native/expo` plugin handles source-map upload
automatically during EAS builds when this token is present.

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
