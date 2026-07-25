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

## Migration steps (once a domain exists)

1. **Resend account** — sign up at [resend.com](https://resend.com), free tier.

2. **Add and verify the domain** — Resend dashboard → Domains → Add Domain.
   It issues DNS records to add at the registrar:
   - an **SPF** `TXT` record,
   - **DKIM** records,
   - optionally **DMARC**, which is worth adding.

   Verification usually completes in minutes once DNS propagates. Do not skip
   DMARC: without it a spoofer can send as your domain, and the app's whole
   pitch is that it is trustworthy with financial data.

3. **Create an API key** — Resend → API Keys → Create, with send permission.
   This is the SMTP password in the next step. Treat it as a secret: **it must
   never enter this repo**, which is public (§19).

4. **Point Supabase at it** — Dashboard → Authentication → Emails → SMTP
   Settings → enable custom SMTP:

   | Field | Value |
   |---|---|
   | Host | `smtp.resend.com` |
   | Port | `465` (implicit TLS; `587` STARTTLS also works) |
   | Username | `resend` — the literal string, not an email address |
   | Password | the Resend API key from step 3 |
   | Sender email | `noreply@<your-domain>` |
   | Sender name | `Bukit Pennies` |

   Confirm the current values against Resend's SMTP docs before saving — they
   are the kind of detail that changes.

5. **Raise the auth rate limits** — Supabase caps custom-SMTP sends
   conservatively by default (Authentication → Rate Limits). The default is
   low enough to throttle a burst of testers signing up at once.

6. **Decide on email confirmations.** They are currently **disabled** (§15,
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

## Last step

Once delivery is reliable, remove the spam-folder note from
`apps/mobile/app/(auth)/forgot-password.tsx` ("If you don't see it within a
minute, check your spam or junk folder"), and update §15 in `HANDOFF.md`,
which still records Gmail SMTP as current. Leaving the note in place is
harmless but it advertises a problem you no longer have.
