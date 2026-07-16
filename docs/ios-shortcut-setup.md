# iOS Shortcut setup — near-automatic bank SMS capture

This is the automation path for iPhone: when a bank SMS arrives, an iOS
Shortcuts **Automation** forwards the message text to your private Bukit
Pennies ingest endpoint. The app never reads your SMS (iOS forbids that) and
never connects to your bank — iOS itself runs the Shortcut and only the
message *text* leaves the phone.

The in-app version of this guide lives at **Settings → iOS Shortcut setup**;
the two are kept in sync.

## Prerequisite: a hosted ingest URL

The Shortcut runs on your phone, so it must reach the ingest API over the
internet. The local dev stack (`http://127.0.0.1:54321`) will not work — you
need the hosted Supabase project (see `docs/hosted-supabase-deploy.md`). Your
ingest URL is:

```
https://<project-ref>.supabase.co/functions/v1/ingest
```

## Step 1 — create a capture token

In the app: **Settings → Capture devices → New capture device**, kind
`ios_shortcut`. Copy the `bp_…` token — **it is shown exactly once** (only its
hash is stored). If you lose it, revoke the device and create a new one.

## Step 2 — create the Automation

On your iPhone open the **Shortcuts** app → **Automation** tab → **+** →
**Message**.

## Step 3 — set the trigger

- **When**: "Message Contains" → `Merchant:` — **From**: `Baiduri`
  (the SMS sender ID, exactly as it appears in Messages).
- Choose **Run Immediately** if your iOS version offers it (otherwise iOS asks
  for a confirmation tap each time — be aware this varies by iOS version and
  settings).

## Step 4 — add the action

Add **Get Contents of URL** and configure:

```
URL:     https://<project-ref>.supabase.co/functions/v1/ingest
Method:  POST
Headers: Authorization: Bearer <your bp_… token>
         Content-Type: application/json
Body (JSON):
  text:   Shortcut Input → Message content
  source: "ios_shortcut"
  sender: Shortcut Input → Sender
```

## Step 5 — one automation per bank sender

Repeat for each bank sender ID (Baiduri today; BIBD / StanChart once their
real message formats are collected — until then their messages land in the
Review inbox, which is exactly how we collect the samples).

## Test it

Text yourself the sample from another phone (or wait for a real spend):

```
Card No.: 4x0213 Amount: BND 21.00 Merchant: GALORIES SMOOTHIES BSB BN Date: 10-07-2026 17:37:59 If suspicious, please call 2449666.
```

The transaction should appear in the app within seconds, without opening it.

## Honest limitations

- Depending on iOS version/settings, iOS may require a **confirmation tap**
  before the automation runs — it is near-automatic, not guaranteed silent.
- On the **free Supabase tier** the project pauses after ~1 week of
  inactivity; the Shortcut then fails **silently** and messages are not
  recorded. Recovery: unpause the project, then select-copy the missed
  conversation in Messages and use **bulk paste** in the Capture tab — it
  splits the blob into individual messages and the server ignores duplicates.
  The real fix is the paid tier (planned for launch).
- Automations only fire for **incoming** messages from that sender ID; old
  messages must go through bulk paste.

## Troubleshooting

- **401 / invalid_token**: token revoked or mistyped — create a new capture
  device and update the Shortcut's Authorization header.
- **Nothing appears**: run the Shortcut manually on a copied message first;
  check Settings → Capture devices "last seen" updates; confirm the project
  isn't paused (supabase.com dashboard).
- **Transaction wrong or incomplete**: it will be in the **Review** tab —
  fix inline and confirm.
