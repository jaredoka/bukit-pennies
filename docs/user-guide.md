# Bukit Pennies — User Guide

Bukit Pennies logs your card spending in Brunei by reading the **notification
text** your bank already sends you (like Baiduri's SMS), and turns it into a
personal spending dashboard.

**The one promise that never changes:** Bukit Pennies **never connects to your
bank**. No bank passwords, no account linking, no open banking. The only thing
it ever processes is notification *text* that you (or your phone, with your
permission) hand to it. If a message can't be parsed, it waits for you in the
Review inbox — nothing is guessed silently.

---

## 1. Getting started

1. **Create an account** with an email and password (8+ characters). No social
   logins, no bank logins.
2. Sign in. You land on the **Dashboard** — empty until your first capture.

## 2. Capturing a transaction

Every capture path feeds the same pipeline: the text is parsed for **amount,
merchant, date, and card**, checked against messages you've already saved (so
double-captures don't double-count), and stored.

### Paste (works everywhere, day one)
1. Copy the bank message text (from SMS or a bank-app notification).
2. Open the **Capture** tab and paste it.
3. A live **preview** shows what was understood — amount, merchant, date, card,
   and a confidence score — *before* anything is saved. The preview runs
   entirely on your device.
4. Tap **Save transaction**. If you paste the same message twice, the app tells
   you it's already recorded.

### iPhone — near-automatic via Shortcuts
iOS doesn't let apps read SMS, so Bukit Pennies uses an Apple **Shortcuts
automation** instead: when a message from your bank arrives, the Shortcut
forwards its text to your private inbox endpoint. Set it up once via
**Settings → iOS Shortcut setup** (you'll create a capture token there).
Depending on your iOS version, iOS may ask for one confirmation tap per
message.

### Android — automatic (coming later)
An optional notification listener will capture bank SMS and app notifications
automatically. Until it ships, use Paste.

## 3. The Dashboard

- **This month vs last month** — total spend and the percentage change.
- **Average per day** and your **top merchant** this month.
- **Daily spend** — a day-by-day line of the current month.
- **Where it went** — a donut of spending by category.
- **Monthly totals** and **all-time top merchants**.

All dates and month boundaries use Brunei time (+08:00).

## 4. Transactions, notes, and categories

The **Transactions** tab lists everything by day, searchable by merchant, note
text, or the original message. Tap a transaction to:

- add **notes** ("dinner with Sarah", "reimbursable"),
- set a **category** (defaults like Food & Drink, Groceries, Transport are
  built in; add your own from the same screen),
- **re-parse** it from the original text (after parser improvements),
- **delete** it.

The original message text is always kept with the transaction, so nothing is
ever lost in translation.

## 5. The Review inbox

Messages the parser wasn't confident about land in **Review** instead of being
silently guessed:

- **Needs review** — fill in the amount/merchant/date yourself and confirm.
- **Possible duplicate** — when two captures look like the same purchase
  (same amount and card within minutes), the copy is flagged: **merge** it
  away or **keep both**.

Unparseable messages you fix here also help improve the parsers for your bank.

## 6. Capture devices and tokens

Each capture path authenticates with its own **token** (Settings → Capture
devices). Tokens look like `bp_…`, are shown **exactly once** when created, and
can be **revoked** any time — revoking one path (say, a lost phone's Shortcut)
doesn't affect the others.

## 7. Where your data is stored

| What | Where | Notes |
|---|---|---|
| Transactions, notes, categories | A [Supabase](https://supabase.com) cloud project (Postgres database) | Every row is tagged with your user id; **row-level security** enforced by the database means each account can only ever read or write its own rows. |
| Original message text | Same database, alongside each transaction | Kept so you can re-parse and audit; it's the text your bank sent, nothing more. |
| Your password | Supabase Auth | Stored as a salted hash — the app never sees it. |
| Capture tokens | Same database | Only a SHA-256 fingerprint is stored; the plaintext token exists only on your device (and is shown once at creation). |
| Your sign-in session | On your device — iOS Keychain / Android Keystore (secure storage), browser storage on web | Deleted on sign-out. |
| Bank credentials | **Nowhere.** | The app never asks for them and has nowhere to put them. |

Deleting a transaction deletes it from the database. Nothing is shared with
third parties, and there is no analytics or ad SDK in the app.

## 8. Frequently asked

- **Why did my transaction land in Review?** The message format wasn't
  recognized confidently (common for BIBD/Standard Chartered until their real
  formats are collected). Fix it once — it still counts in your dashboard after
  you confirm it.
- **A purchase shows twice?** If both a Shortcut and a manual paste captured
  it with different wording, the copy is flagged in Review — merge it there.
  Identical text is deduplicated automatically.
- **Can the app read my other messages?** No. On iOS only messages matching
  your Shortcut's filter (e.g. sender = Baiduri) are ever forwarded; paste only
  sees what you paste.
