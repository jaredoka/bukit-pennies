# Authoring the self-configuring "Bukit Pennies Capture" shortcut

Owner-only runbook. CI cannot sign shortcut files (`shortcuts sign` needs an
iCloud login — HANDOFF §15), so the shortcut is built by hand on the owner's
iPhone and distributed via a shared iCloud link wired into
`SHORTCUT_DOWNLOAD_URL` (`apps/mobile/src/lib/env.ts`).

## Why this version

The previous shortcut hard-coded `PASTE-YOUR-TOKEN-HERE`, forcing every user
to edit the shortcut. This version stores the token itself:

- **Setup run:** the app deep-links `shortcuts://run-shortcut` with the token
  as input; the shortcut detects the `bp_` prefix, saves the token to a file,
  and confirms. Users never open the shortcut editor.
- **Capture run:** the Message automation passes the SMS text as input; the
  shortcut reads the saved token and POSTs to ingest.
- **Fallback:** if no token file exists on a capture run, the shortcut asks
  for the token once and saves it.
- The "Logged … at …" confirmation notification (previously an optional
  manual step) is baked in.

A bank SMS can never start with `bp_`, so prefix-sniffing the input is safe.

## Build it (Shortcuts app, exact action order)

Create a new shortcut named exactly **`Bukit Pennies Capture`** (the app's
deep link targets this name — do not rename).

1. **If** — Input: **Shortcut Input** · Condition: **begins with** · text: `bp_`

   *(The If block does not pass its result to sub-steps — each sub-step uses
   **Shortcut Input** directly, the same input the whole shortcut received.)*

   1. **Save File** — File: **Shortcut Input** (the token string the app sent) ·
      Service: **iCloud Drive** · turn **Ask Where to Save** OFF ·
      Destination Path: `/Bukit Pennies/token.txt` ·
      **Overwrite If File Exists** ON
   2. **Show Notification** — Title: `Bukit Pennies` · Body:
      `Connected. Capture is ready.`
      *(No input variable needed — the body is plain text.)*
   3. **Stop Shortcut** *(no input — ends execution here for setup runs)*

2. **End If** (Otherwise branch stays empty — actions below run for SMS input)
3. **Get File** — Service: **iCloud Drive** · turn **Show Document Picker**
   OFF · File Path: `/Bukit Pennies/token.txt` · **Error If Not Found** OFF
4. **If** — Input: **File** (result of step 3) · Condition: **does not have any value**

   *(Same as step 1 — the If block does not chain its result to sub-steps.
   Step 4.1 fires independently when the condition is true; it takes no input
   from step 4.)*

   1. **Ask for Input** — Prompt:
      `Paste your Bukit Pennies token (bp_…). Create one in the app under Settings → Capture.` ·
      Input Type: **Text**
   2. **Save File** — File: **Provided Input** · same settings as step 1.1
      (`/Bukit Pennies/token.txt`, no picker, overwrite ON)
5. **End If**
6. **Get File** — same settings as step 3 (re-read so both branches converge
   on one variable). Rename its result variable to **Token** (tap the action's
   result chip → Rename).
7. **Get Contents of URL** — URL: the hosted ingest endpoint
   `https://<project-ref>.supabase.co/functions/v1/ingest`
   - Method: **POST**
   - Headers: `Authorization` = `Bearer ` + **Token** variable chip
     (type `Bearer `, space included, then insert the chip)
   - Request Body: **JSON** with:
     - `text` = **Shortcut Input** (variable chip)
     - `source` = `ios_shortcut` (plain text)
8. **Get Dictionary Value** — Key: `transaction` · from **Contents of URL**
9. **Get Dictionary Value** — Key: `merchant` · from step 8's output ·
   rename result to **Merchant**
10. **Get Dictionary Value** — Key: `amount` · from step 8's output ·
    rename result to **Amount**
11. **Show Notification** — Title: `Bukit Pennies` · Body: `Logged ` +
    **Amount** chip + ` at ` + **Merchant** chip

On duplicate/ignored/error replies there is no `transaction` key, so steps
8–11 produce a blank-bodied notification — harmless.

## Test before sharing

1. Run manually with no input → it should ask for a token (fallback path).
   Cancel.
2. From the app: Settings → Capture → iOS Shortcut setup → create a token →
   **Send the token to the Shortcut** → expect the "Connected" notification.
3. Run the shortcut on a copied real bank SMS (share sheet or Run with text) →
   transaction appears in the app; "Logged … at …" notification shows.
4. Files app → iCloud Drive → Shortcuts → `Bukit Pennies/token.txt` exists.

## Publish

Shortcuts app → long-press the shortcut → **Share** → **Copy iCloud Link**,
then update `SHORTCUT_DOWNLOAD_URL` in `apps/mobile/src/lib/env.ts` and the
link references in `docs/ios-shortcut-setup.md` / HANDOFF §16. The old link
keeps working for existing users; the new shortcut is backward-compatible
(same ingest contract).
