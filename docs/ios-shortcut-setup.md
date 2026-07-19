# iOS Shortcut setup — near-automatic bank SMS capture

When a bank SMS arrives, an iOS Shortcuts **Automation** forwards the message
text to your private Bukit Pennies ingest endpoint. The app never reads your
SMS (iOS forbids that) and never connects to your bank — iOS itself runs the
Shortcut and only the message *text* leaves the phone.

The in-app version of this guide lives at **Settings → iOS Shortcut setup**;
the two are kept in sync.

## The easy way — ready-made shortcut (4 steps, ~3 min)

A pre-built shortcut with the ingest URL, headers, and JSON body already
wired up is distributed via the owner's shared iCloud link (wired into the
app as `SHORTCUT_DOWNLOAD_URL`; CI cannot sign shortcut files — see
`docs/shortcut-authoring.md` for how it is built and republished).

The shortcut is **self-configuring**: it stores your token itself, so you
never open the shortcut editor.

1. **Create your token.** In the app: Settings → iOS Shortcut setup →
   Step 1 creates a `bp_…` token inline (shown exactly once).
2. **Download the shortcut.** Same screen → **Download the Shortcut** →
   tap Add Shortcut. No edits needed.
3. **Connect with one tap.** Same screen → **Send the token to the
   Shortcut**. The app deep-links `shortcuts://run-shortcut` with the token
   as input; the shortcut saves it to `Bukit Pennies/token.txt` in iCloud
   Drive and shows a "Connected" notification. (Alternative: run the
   shortcut once manually — it asks for the token and remembers it.)
4. **Create the automation — one per card.** Shortcuts app → Automation tab →
   **+** → **Message**. Leave **Sender** empty — bank sender IDs ("Baiduri",
   "BIBD") are alphanumeric, not phone numbers, so iOS's contact-based Sender
   picker cannot select them; the Message Contains filter does the work. Set
   **Message Contains** from the per-card template below, choose **Run
   Immediately** if offered, and set the action to **Run Shortcut → Bukit
   Pennies Capture**.

   | Bank | Message Contains template | Example |
   |---|---|---|
   | Baiduri | `Card No.: ` + masked card from a real SMS | `Card No.: 4x0213` |
   | BIBD | `card ending with ` + last 4 digits | `card ending with 0298` |

   Copy the card string from a real message — Message Contains is a literal
   match, one wrong character and it never fires.

   Notes:
   - Add one automation per card you want tracked; cards you skip are simply
     not captured.
   - **Card replacements change the digits** (expiry/loss) — capture silently
     stops until you update the automation.
   - To capture *all* cards of a bank with a single automation, use the
     template without digits (`Merchant:` for Baiduri, `card ending with` for
     BIBD) — broader, still transaction-specific.
   - StanChart's format is still uncollected — its messages land in the
     Review inbox, which is exactly how we collect samples.

## "Logged …" confirmation notification — built in

The ready-made shortcut already shows "Logged BND 5.10 at HUA HO"-style
notifications on every capture (it reads `transaction.merchant` /
`transaction.amount` from the success reply). On duplicate/ignored/error
replies there is no `transaction` key, so the notification body is blank —
harmless. If you built the shortcut manually, the recipe is in
`docs/shortcut-authoring.md` steps 8–11.

## Test it

Text yourself the sample from another phone (or wait for a real spend):

```
Card No.: 4x0213 Amount: BND 21.00 Merchant: GALORIES SMOOTHIES BSB BN Date: 10-07-2026 17:37:59 If suspicious, please call 2449666.
```

The transaction should appear in the app within seconds, without opening it.

## Manual setup (fallback — if the download is unavailable)

Create a new shortcut with a single **Get Contents of URL** action:

```
URL:     https://<project-ref>.supabase.co/functions/v1/ingest
Method:  POST
Headers: Authorization: Bearer <your bp_… token>
         Content-Type: application/json
Body (JSON):
  text:   Shortcut Input
  source: "ios_shortcut"
```

Then create the Message automation exactly as in step 4 above.

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

## Duplicate messages

If the same SMS arrives twice (e.g. the bank resends it), only the **first** is stored. The server deduplicates by a hash of the raw message text — identical text always maps to the same hash, so the second run is silently ignored. The notification still fires but the transaction is not double-counted. This is intentional: use **bulk paste** in the Capture tab if you need to re-ingest a corrected or re-sent message after editing it.

## Troubleshooting

- **401 / invalid_token**: token revoked or mistyped — create a new capture
  device, then either tap **Send the token to the Shortcut** again in the
  setup screen, or delete `Bukit Pennies/token.txt` in iCloud Drive so the
  shortcut asks for the new token on its next run.
- **Nothing appears**: run the Shortcut manually on a copied message first;
  check Settings → Capture devices "last seen" updates; confirm the project
  isn't paused (supabase.com dashboard).
- **Transaction wrong or incomplete**: it will be in the **Review** tab —
  fix inline and confirm.
