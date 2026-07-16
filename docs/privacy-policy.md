# Bukit Pennies — Privacy Policy

**Effective date:** 16 July 2026
**Contact:** jaredoka@gmail.com

Bukit Pennies is a personal spending tracker for Brunei that works by parsing
bank **notification text**. This policy describes exactly what data the app
handles, where it lives, and what control you have over it.

## The core promise

Bukit Pennies **never connects to your bank**. It does not ask for, store, or
transmit bank usernames, passwords, PINs, card numbers (beyond the last four
digits your bank already prints in its own messages), or any open-banking
credential. The only financial input it ever processes is notification text
that you, or an automation you set up on your own phone, choose to send it.

## What we collect

| Data | Source | Why |
|---|---|---|
| Email address and a salted password hash | You, at sign-up | Account sign-in |
| Display name (optional) | You | Shown in the app |
| Bank notification text you submit | Pasted by you, or forwarded by your iOS Shortcut / Android listener | Parsed into transactions; the original text is kept so you can audit and re-parse it |
| Parsed transaction fields (amount, merchant, date, card last-4, bank) | Derived from the text above | Your spending history and dashboard |
| Notes and categories | You | Organizing your spending |
| Capture-device names and token fingerprints (SHA-256) | You, when creating a capture token | Authenticating your capture paths; the plaintext token is shown once and never stored server-side |
| Timestamps of token use | Generated | So you can spot a lost or misused token and revoke it |

We do **not** collect location, contacts, advertising identifiers, or
analytics events. The app contains no advertising or analytics SDKs.

## Where your data is stored

Your data is stored in a [Supabase](https://supabase.com) project (a hosted
PostgreSQL database). Access is enforced by database row-level security: every
row is tagged with your account id, and the database itself refuses to return
another user's rows regardless of what the app requests. Your sign-in session
is stored on your device (iOS Keychain / Android Keystore secure storage, or
browser storage on web) and removed when you sign out.

## Sharing

Your data is not sold, shared, or transferred to any third party. It is
processed only by the app's own backend (Supabase infrastructure) to provide
the service to you.

## Your controls

- **Export/inspect:** every transaction shows the original message it came from.
- **Delete a transaction:** removes it from the database immediately.
- **Revoke a capture token:** Settings → Capture devices, at any time.
- **Delete your account:** Settings → Delete account. This permanently removes
  your account and every row attached to it (transactions, notes, categories,
  cards, tokens) via database cascade — immediately and irreversibly.

## Children

Bukit Pennies is not directed at children under 13 and does not knowingly
collect data from them.

## Changes

Material changes to this policy will be announced in the app and reflected on
this page with a new effective date.

## Contact

Questions or requests: **jaredoka@gmail.com**
