# Standard Chartered (Brunei) golden fixtures — sample collection

The SCB parser is an **UNVERIFIED skeleton**: no real SCB notification text has
been collected yet, so `guessed-format.json` only pins the skeleton behavior
(generic extraction + confidence cap ⇒ always `needs_review`).

**How real samples arrive:** the app's review inbox is the collection loop —
SCB messages ingest as `needs_review`, the user fixes them in-app, and the raw
text (redact card digits beyond the last 4 if desired) becomes a fixture here.

**To promote the parser** (see `docs/execution-playbook.md`):
1. Add the real message as a fixture in this directory.
2. Replace the guessed patterns in `src/banks/scb.ts` with label-anchored regexes.
3. Remove the `UNVERIFIED_CONFIDENCE_CAP` clamp; exact matches should score ≥ 0.95.
