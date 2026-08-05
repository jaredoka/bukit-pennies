# Transactional email: migrating off Gmail SMTP

**Status:** not migrated. Supabase Auth still sends through Gmail SMTP
(`bukitpennies@gmail.com`), and password-reset mails land in spam often enough
that the forgot-password screen carries a "check your spam folder" note.

**Blocked on one owner decision: buying a domain.** Everything else below is a
20-minute job once that exists. See "Why a domain is unavoidable".

## Why this matters before TestFlight

Today the only person who receives a reset email is the owner, who knows to
check spam. The moment a second tester exists, a reset mail in spam becomes a
support request with no self-service answer — and password reset is the only
account-recovery path in the app (there is no social login until the Apple
Developer account exists, and no magic-link flow).

Account recovery landing in spam is a worse practical risk than any password
policy, which is why this outranks the password-strength work in §18.

## Why a domain is unavoidable

Resend's free tier sends 3,000 emails/month, which is far more than this app
needs. But **without a verified sending domain it will only deliver to the
account owner's own address** (via its `onboarding@resend.dev` test sender).
That is enough to prove the integration works and nothing more — the first
external tester would get nothing.

Verifying a domain is what lets the receiving side check SPF and DKIM, which is
the actual reason Gmail-relayed mail from a non-Google sender scores badly. So
the domain is not incidental to the fix; it *is* the fix.

Cost: roughly US$12/year. §15 already anticipated `bukitpennies.com`, which
would also serve as the App Store support URL and eventually the public site —
so it is not a single-purpose purchase.

**Cheaper interim option if you would rather not buy yet:** keep Gmail SMTP,
and accept that you personally check spam. This is fine while you are the only
tester. Revisit the moment you invite anyone else.

## What it costs: the domain and nothing else

A domain does **not** oblige you to buy a mailbox. Sending and receiving are
separate problems with separate costs, and this app only strictly needs the
first.

| | Cost |
|---|---|
| Domain | ~US$12/yr |
| Resend sending, 3,000/mo | $0 |
| Cloudflare Email Routing (receiving) | $0 |
| Gmail "send mail as", via Resend SMTP | $0 |
| A real mailbox — **not needed**, see below | US$1–7/user/mo |

**Sending needs no mailbox.** Resend sends *as* `noreply@<domain>` because you
proved control of the domain through DNS. There is no inbox behind that
address and there does not need to be one — it is an identity assertion, not
an account.

**Receiving is still worth setting up**, because both stores require a support
contact and people reply to auth mail no matter what you call the sender. But
it is free: **Cloudflare Email Routing** (move DNS to Cloudflare's free plan)
forwards `support@<domain>` to `bukitpennies@gmail.com` in minutes. Most
registrars — Namecheap, Porkbun — offer equivalent forwarding.

The wrinkle with forwarding is that replies leave *from* the Gmail address,
which reads as sloppy on a support thread. Fix it for free: Gmail's **Send mail
as** accepts SMTP credentials, so point it at Resend's SMTP (same host,
username and API key as step 4 below). You then receive at `support@` and reply
from `support@` with no mailbox and no subscription.

A paid mailbox (Zoho ~US$1/user/mo, Google Workspace ~US$7/user/mo) buys a
standalone inbox with its own storage and apps. **Not worth it here** — it
would be a second inbox to remember to check, replacing a forward into the one
you already read. Revisit only if the project grows past one person.

**Keep the two addresses distinct:** `noreply@` for auth mail, `support@` for
humans. One address doing both trains people to reply into a void.

## Migration steps (once a domain exists)

1. **Resend account** — sign up at [resend.com](https://resend.com), free tier.

2. **Decide root vs. subdomain first** — this is the one choice that is
   annoying to undo, and getting it wrong breaks SPF *silently*.

   **Only one SPF `TXT` record may exist per name.** Two of them do not merge;
   they invalidate each other, which is precisely the failure the domain was
   bought to fix — and nothing visibly errors. If you use Cloudflare Email
   Routing for receiving *and* send from the root domain, both want an SPF
   record at the root and you have exactly this collision.

   Two ways out:

   - **Send from a subdomain** — `noreply@send.<domain>`. Resend recommends
     this anyway: root SPF stays Cloudflare's, sending SPF lives on the
     subdomain, no collision possible. It also isolates reputation, so a
     deliverability problem with auth mail cannot contaminate ordinary
     correspondence on the root domain. **Recommended.**
   - **Send from the root** and hand-merge every `include:` directive into one
     SPF record. Works, but every future change to either service is another
     chance to break it.

3. **Add and verify the domain** — Resend dashboard → Domains → Add Domain,
   entering the root or the sending subdomain per the decision above. It issues
   DNS records to add at the registrar:
   - an **SPF** `TXT` record,
   - **DKIM** records,
   - optionally **DMARC**, which is worth adding.

   Verification usually completes in minutes once DNS propagates. Do not skip
   DMARC: without it a spoofer can send as your domain, and the app's whole
   pitch is that it is trustworthy with financial data.

4. **Create an API key** — Resend → API Keys → Create, with send permission.
   This is the SMTP password in the next step. Treat it as a secret: **it must
   never enter this repo**, which is public (§19).

5. **Point Supabase at it** — Dashboard → Authentication → Emails → SMTP
   Settings → enable custom SMTP:

   | Field | Value |
   |---|---|
   | Host | `smtp.resend.com` |
   | Port | `465` (implicit TLS; `587` STARTTLS also works) |
   | Username | `resend` — the literal string, not an email address |
   | Password | the Resend API key from step 4 |
   | Sender email | `noreply@<your-domain>` |
   | Sender name | `Bukit Pennies` |

   Confirm the current values against Resend's SMTP docs before saving — they
   are the kind of detail that changes.

6. **Raise the auth rate limits** — Supabase caps custom-SMTP sends
   conservatively by default (Authentication → Rate Limits). The default is
   low enough to throttle a burst of testers signing up at once.

7. **Set up receiving** — free, and needed for the store support contact.
   Cloudflare → the domain → Email → Email Routing: forward
   `support@<domain>` to `bukitpennies@gmail.com`. (Requires the domain's DNS
   on Cloudflare's free plan. If you chose the subdomain option in step 2,
   this adds Cloudflare's SPF at the root with nothing to collide with.)

   Then make replies come from the right address: Gmail → Settings → Accounts
   → **Send mail as** → add `support@<domain>`, using the same SMTP host,
   username and API key from step 5. Without this, replies go out from the
   Gmail address and the support thread looks broken.

8. **Decide on email confirmations.** They are currently **disabled** (§15,
   `enable_confirmations = false`), which was right for solo testing. With
   working deliverability, re-enable them before external testers so addresses
   are verified — otherwise a typo'd signup is an unrecoverable account.

## Verifying it worked

1. Trigger a reset from the app's forgot-password screen to a **non-Gmail**
   address (Gmail is the most forgiving of Gmail-relayed mail, so it hides the
   problem you are fixing). Outlook or Yahoo are good tests.
2. Confirm it lands in the inbox, not spam.
3. Check the message headers show `SPF: pass` and `DKIM: pass`.
4. Confirm the reset deep link still opens the app — the redirect URL is
   unchanged by this migration, but it costs nothing to check.
5. Send one to a Gmail address too, to be sure nothing regressed.

## Last steps, in the app and the docs

1. **Remove the spam-folder note** from
   `apps/mobile/app/(auth)/forgot-password.tsx` ("If you don't see it within a
   minute, check your spam or junk folder"). Harmless to leave, but it
   advertises a problem you no longer have.

2. **If you switch the support address** to `support@<domain>`, change every
   occurrence at once. Only the app reads a constant; the docs each hardcode
   it, and several files mention it twice:
   - `apps/mobile/src/lib/env.ts` — `SUPPORT_EMAIL`, the only real constant
   - `docs/privacy-policy.md` — twice (header block and Contact section)
   - `docs/terms.md` — twice (header block and Contact section)
   - `docs/index.md` — the Pages landing page
   - `docs/testflight-deploy.md` — the App Store metadata checklist

   The first four are **published** by GitHub Pages, so a partial change
   leaves a live policy listing a contact you have stopped reading. Verify with
   `grep -rn "bukitpennies@gmail.com" --exclude-dir=node_modules .` and expect
   zero hits outside git history.

3. **Update `docs/email-deliverability.md`'s status notes** once Gmail SMTP
   stops being current and this migration is no longer blocked.
