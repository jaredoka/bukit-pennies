# Cloudflare Pages Deploy Guide (web demo)

Moved the live web demo to Cloudflare Pages in **2026-08-05**. Reason: Netlify's
free tier caps at **300 build minutes/month** and the repo blew through 75% of
it in three days (deploy previews build for *every* branch push; the history
purge force-pushed eight branches in one day). Cloudflare Pages gives **500
builds/month and unlimited bandwidth** on its free tier, and does not conflict
with GitHub Pages, which already serves the privacy policy / terms at
`jaredoka.github.io/bukit-pennies` (GitHub Pages allows only one source per
repo — see `docs/adr/0031-cloudflare-pages-for-web-demo.md`).

## What moved

| | Before (Netlify) | After (Cloudflare Pages) |
|---|---|---|
| Demo URL | `bukit-pennies.netlify.app` | `<project>.pages.dev` |
| Build allowance | 300 min/mo | 500 builds/mo |
| Bandwidth | 100 GB/mo | unlimited |
| SPA fallback | `_redirects` | `_redirects` (same file, already committed) |
| Policies | GitHub Pages `docs/` | unchanged, still GitHub Pages |

The `apps/mobile/public/_redirects` file (`/* /index.html 200`) carries over
as-is — Expo copies `public/` into `dist/` and Cloudflare Pages honors it.

## 1. Create the project

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) and sign in (free).
2. Left sidebar → **Workers & Pages** → **Create** → **Pages** tab →
   **Connect to Git**.
3. Authorize GitHub, pick `jaredoka/bukit-pennies`.
4. On the build settings screen, enter exactly:

| Setting | Value |
|---|---|
| Project name | `bukit-pennies` |
| Production branch | `main` |
| Framework preset | `None` |
| Build command | `pnpm install --frozen-lockfile && pnpm --filter @bukit/mobile exec expo export --platform web` |
| Build output directory | `apps/mobile/dist` |
| Root directory | `.` (leave blank) |

> **Root directory:** Cloudflare's monorepo detection may offer
> `apps/mobile`. Set it back to the repo root (blank) — same trap Netlify
> had — or the output path doubles up.

5. **Environment variables** (Advanced build settings → Environment variables):

| Name | Value |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `https://pzjroqwllrzcbpiugpxl.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | (the anon key from the hosted Supabase dashboard: Project Settings → API → `anon`/`public` key) |
| `SENTRY_DISABLE_AUTO_UPLOAD` | `true` |

   The anon key is public by design (it ships in every client build). The
   Supabase URL/key are the same values Netlify used.
6. **Node version:** Cloudflare Pages defaults to Node 22. If a build fails
   with a Node version error, add a `NODE_VERSION = "22"` build env var.

7. Click **Save and Deploy**. First build takes a few minutes (same `expo
   export` as Netlify).

## 2. Verify

- Open the `*.pages.dev` URL: the demo should render, and a deep link like
  `/transactions` should fall back to the SPA (via `_redirects`).
- Push a trivial commit to `main` and confirm a fresh build deploys
  automatically.

## 3. Clean up Netlify

Do this **only after the Pages site is confirmed working**:

1. Netlify dashboard → the `bukit-pennies` site → **Site configuration** →
   **Deploy contexts** → **Deploy previews** → *None*. (Do this first — it
   stops the credit burn immediately.)
2. Netlify dashboard → **Settings** → **Delete site** (or keep it pointing at
   the old URL until you have told anyone who follows the old link to switch).
3. Repo cleanup (one PR):
   - Delete `netlify.toml`.
   - Update `README.md` lines 10 and 33 to the `*.pages.dev` URL (or a custom
     domain).
   - Update the `cors.ts` comment that names `bukit-pennies.netlify.app`.
   - Add a CHANGELOG entry.
4. If you want a branded URL instead of `*.pages.dev`: Cloudflare dashboard →
   site → **Custom domains** → add `demo.bukit-pennies.com` (needs a paid
   domain; skip on the free plan).

## 4. Previews (avoid the Netlify trap)

Cloudflare Pages **does not build previews by default** — it only builds the
production branch on push. That is the whole reason this host no longer burns
minutes. Leave **preview deployments off** unless you actively want
branch-push previews, in which case cap them to pull requests only.
