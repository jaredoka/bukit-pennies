# iOS device testing with Sideloadly (no paid Apple Developer account)

Until the paid Apple Developer account exists, iOS testing uses an **unsigned
IPA** built by GitHub Actions, re-signed on your Windows PC with a **free Apple
ID** via **Sideloadly**, and installed over USB.

## Free-signing limits (design constraints — expect them)

- The signature **expires after 7 days** → re-sideload the app weekly
  (your data lives in Supabase, so nothing is lost when it expires).
- Max **3 sideloaded apps** per device; max **10 App IDs per 7 days**.
- **No Sign in with Apple**, no push, **no share extension** in these builds —
  the app uses email/password auth, and capture is the paste screen + the
  Shortcuts automation (which doesn't depend on app signing at all).
- Use a **throwaway/secondary Apple ID** if you're uncomfortable typing your
  main one into Sideloadly (it authenticates against Apple to generate the
  free certificate).

## One-time setup

1. Deploy the hosted Supabase project first — see
   [supabase-hosted-deploy.md](supabase-hosted-deploy.md). The phone can't
   reach your PC's local stack; the build needs a real URL.
2. Install [Sideloadly](https://sideloadly.io/) on Windows. It bundles the
   Apple drivers it needs; if the device isn't detected, install iTunes
   (Apple's installer, not the Microsoft Store version).
3. On the iPhone: Settings → Privacy & Security → **Developer Mode** → on
   (iOS 16+; the phone reboots).

## Per-build loop (weekly)

1. GitHub → Actions → **iOS unsigned IPA** → *Run workflow*, filling in:
   - `supabase_url` — your hosted project URL (`https://<ref>.supabase.co`)
   - `supabase_anon_key` — the project's anon/publishable key
2. When the run finishes, download the `bukit-pennies-unsigned-ipa` artifact
   and unzip it to get `bukit-pennies-unsigned.ipa`.
3. Connect the iPhone over USB → open Sideloadly → select the `.ipa` →
   enter the Apple ID → **Start**. Approve the 2FA prompt if asked.
4. First install only: on the iPhone, Settings → General → VPN & Device
   Management → trust the developer certificate.
5. Launch Bukit Pennies, sign up / sign in, and run the checklist below.

## Device checklist (user-executed — report results back)

- [ ] App launches; sign-up creates an account; sign-in persists after
      relaunch (session in SecureStore).
- [ ] Dashboard renders charts with your data.
- [ ] Capture tab: paste a real Baiduri SMS → preview parses → save →
      appears in Transactions.
- [ ] Settings → Capture devices: create an `ios_shortcut` token (shown
      once — keep it for the next step).
- [ ] Set up the Shortcuts automation per the in-app guide (Settings → iOS
      Shortcut setup). Send yourself the Baiduri sample text from another
      phone → transaction appears in the app without opening it.
- [ ] Review inbox: paste an unparseable message → fix inline → confirm.
- [ ] Note anything BIBD/SCB sends you — raw message text (redact card
      numbers) becomes golden fixtures to promote those parsers.

## Troubleshooting

- **"Unable to verify app" 7 days later** — expected; re-sideload.
- **Sideloadly error `Guru Meditation`** / provisioning errors — usually the
  10-App-IDs-per-week limit; wait or use another Apple ID.
- **App can't reach Supabase** — the URL/key are baked at build time; check
  you passed the hosted values to the workflow run, not the local ones.
