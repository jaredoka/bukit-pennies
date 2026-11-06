# Bukit Pennies — Privacy Policy

**Effective date:** 30 July 2026
**Contact:** bukitpennies@gmail.com

Bukit Pennies is a personal spending tracker for Brunei that works by parsing
bank **notification text**. This policy describes exactly what data the app
handles, where it lives, who else ever touches it, and what control you have
over it.

## The core promise

Bukit Pennies **never connects to your bank**. It does not ask for, store, or
transmit bank usernames, passwords, PINs, card numbers (beyond the last four
digits your bank already prints in its own messages), or any open-banking
credential. There is no bank aggregator behind this app — no Plaid, no MX, no
Yodlee, no screen scraping. The only financial input it ever processes is
notification text that you, or an automation you set up on your own phone,
choose to send it.

That single design choice is why the sharing section below is as short as it
is: because no third party sits between you and your bank, **no third party
ever receives your transactions.**

## What we collect

Everything below is either typed by you or derived from text you sent us.

### Your account

| Data | Source | Why |
|---|---|---|
| Email address and a salted password hash | You, at sign-up | Account sign-in and password reset |
| Display name (optional) | You | Shown in the app |
| How you heard about the app (optional) | You, from Settings → About | Learning which channels reach users; an aggregate count, never used to profile or target you |

### Your spending record

| Data | Source | Why |
|---|---|---|
| Bank notification text you submit | Pasted by you, or forwarded by an iOS Shortcut you set up | Parsed into transactions; the original text is kept so you can audit and re-parse it |
| Parsed transaction fields (amount, currency, merchant, date, card last-4, bank) | Derived from the text above | Your spending history, dashboard and insights |
| Manually added transactions and cash entries | You | Spending that never produced a bank message |
| Notes and categories | You | Organizing your spending |
| Card labels and last-4 digits | You, optionally | Naming your cards in filters |
| Budgets, savings goals, and subscriptions you record | You | Monthly limits, savings targets, and a record of what you subscribe to |

### Capture setup

| Data | Source | Why |
|---|---|---|
| Capture-device names and token fingerprints (SHA-256) | You, when creating a capture token | Authenticating your capture paths; the plaintext token is shown once and never stored server-side |
| Timestamps of token use | Generated | So you can spot a lost or misused token and revoke it |

### If you contact us

| Data | Source | Why |
|---|---|---|
| Bug reports and feature requests: your description, the area of the app, the app version, and an 8-character fragment of your account id | You, when you submit one | Diagnosing and prioritizing; the id fragment lets us reply about the right report without identifying you |

We do **not** collect location, contacts, advertising identifiers, or analytics
events. **The app contains no advertising SDK, no analytics SDK, and no
tracking SDK of any kind.** Nothing you do in the app is measured or profiled.

### Kept only on your device

Some settings never leave your phone: your theme choice, your primary
currency, the privacy cloak, your bill-reminder and alert preferences, your
capture-setup progress, and your sign-in session. Bill reminders, the weekly
summary and overspend alerts are **local notifications scheduled on your own
device** — they are not sent from a server, so nothing about them is
transmitted anywhere.

## Where your data is stored

Your data is stored in a [Supabase](https://supabase.com) project (a hosted
PostgreSQL database). Access is enforced by database row-level security in two
layers: every row is tagged with your account id, and the database itself
refuses to return another user's rows regardless of what the app requests. Your
sign-in session is stored on your device (iOS Keychain / Android Keystore
secure storage, or browser storage on web) and removed when you sign out.

## Sharing

**Your data is never sold, never rented, and never shared for anyone else's
purposes.** There is no advertising partner, no data broker, no analytics
vendor, and no bank aggregator.

Three service providers process data strictly on our instructions, and only
for the narrow purpose named. This list is exhaustive:

| Provider | What it receives | What it never receives |
|---|---|---|
| **Supabase** — database and hosting | Everything described above; it is the database the app runs on | — |
| **Resend** — email delivery | Bug reports and feature requests you submit: your description, the app area, app version, and an 8-character fragment of your account id | Your email address, your name, or any transaction, amount, merchant or balance |
| **Have I Been Pwned** — password breach check | The first five characters of a hash of a password you are choosing (see below) | Your password, your email address, or anything identifying you |

Password-reset and account emails are delivered through the email provider
configured on our Supabase project. That provider handles your email address
and the contents of that message only.

We may disclose data if required by law, and will tell you unless legally
prevented from doing so.

### Password breach check

When you choose a password — at sign-up or when resetting it — the app checks
whether that password already appears in publicly known data breaches, using
the [Have I Been Pwned](https://haveibeenpwned.com/Passwords) Pwned Passwords
service.

**Your password is never sent.** The app computes a cryptographic hash of the
password on your device and transmits only the **first five characters** of
that hash, which thousands of unrelated passwords also share. The service
returns a list of candidate hashes and the comparison happens entirely on your
device. The service cannot learn your password, and it receives nothing that
identifies you or your account. If the check cannot be completed — no network,
for example — it is skipped and does not block you.

## Your controls

- **Inspect:** every transaction shows the original message it came from.
- **Export:** Settings → Spending & data → export your transactions as a CSV
  file you keep.
- **Correct:** edit any transaction's merchant, amount, date, category or
  notes; anything the parser was unsure about waits in your Review inbox
  rather than being silently guessed.
- **Delete a transaction:** removes it from the database immediately.
- **Revoke a capture token:** Settings → Capture → Capture devices, at any
  time. Revoking is immediate and cannot be undone. You can also remove
  already-revoked devices from the list.
- **Delete your account:** Settings → Account → Danger zone. This permanently
  removes your account and every row attached to it — transactions, notes,
  categories, cards, budgets, goals, subscriptions and capture tokens — via
  database cascade, immediately and irreversibly.

## Retention

Your data is kept until you delete it. Deleting a transaction or your account
removes the rows immediately; there is no soft-delete and no archive copy.
Bug reports and feature requests you submit are kept after account deletion
only as the email copy already delivered to us.

## Children

Bukit Pennies is not directed at children under 13 and does not knowingly
collect data from them. If you believe a child has created an account, contact
us and we will delete it.

## Changes

Material changes to this policy will be announced in the app and reflected on
this page with a new effective date.

## Contact

Questions or requests: **bukitpennies@gmail.com**
