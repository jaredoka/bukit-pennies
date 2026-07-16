# Hosted Supabase Deploy Guide

Set up a free-tier Supabase project so the app works on real devices.

## 1. Create the project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and sign in.
2. **New project** → name it `bukit-pennies`, pick `Southeast Asia (Singapore)`
   region for low latency from Brunei, generate a strong database password.
3. Wait for the project to provision (~2 min).

## 2. Apply migrations

```bash
# Link the CLI to the hosted project (one-time)
pnpm exec supabase link --project-ref YOUR_PROJECT_REF

# Push all migrations
pnpm exec supabase db push

# Deploy the ingest edge function
pnpm exec supabase functions deploy ingest
```

## 3. Configure auth

In the Supabase dashboard under **Authentication → Providers**:

- **Email**: enabled (the only provider for now).
- **Site URL**: set to your app's deep-link scheme: `bukitpennies://`
- **Redirect URLs**: add `bukitpennies://reset-password`
- **Email confirmations**: enable for production (prevents signup abuse with
  fake emails).

Under **Authentication → Rate Limits** (dashboard → Auth → Rate Limits):

- **Sign-up rate limit**: 3 per hour per IP (default is generous; tighten it).
- **Sign-in rate limit**: 10 per hour per IP.
- **Password recovery**: 3 per hour per IP.

These are Supabase's built-in GoTrue rate limits — no custom code needed.

## 4. Configure the app

Create `apps/mobile/.env.production` from the example:

```bash
cp apps/mobile/.env.production.example apps/mobile/.env.production
```

Fill in the values from your Supabase project's **Settings → API** page:

```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

For EAS builds, set these as EAS secrets instead:

```bash
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://YOUR_REF.supabase.co"
eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJ..."
```

## 5. Seed a test user (optional)

```sql
-- In the Supabase SQL Editor, create a test user:
-- (or just sign up through the app)
SELECT vault.create_secret('test-user-password', 'your-password-here');
```

Or sign up through the app — the profile trigger creates the `profiles` row
automatically.

## 6. Free-tier limitations

| Concern | Free tier | Paid tier ($25/mo) |
|---|---|---|
| Database pause | Pauses after ~1 week of inactivity | Always on |
| Backups | None | Point-in-time recovery |
| Edge function invocations | 500K/month | 2M/month |
| Auth MAUs | 50K | 100K |
| Storage | 1 GB | 8 GB |

**For development and early testing, free tier is fine.** Upgrade before you
have real users who depend on the ingest endpoint staying available (an iOS
Shortcut posting SMS will fail silently if the DB is paused).

To prevent pausing during testing: the Supabase dashboard itself counts as
activity, or set up a simple cron ping.
