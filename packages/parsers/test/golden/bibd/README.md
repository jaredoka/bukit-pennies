# BIBD golden fixtures

The BIBD parser is **verified**: `real-sample.json` is a real BIBD SMS
(collected 2026-07-17). Notes on the format:

- No date/time in the message — `occurredAt` uses the ingest receive time
  (heuristic), so confidence tops out at 0.90 rather than Baiduri's 0.95+.
- BIBD truncates merchant names ("HUA HO DEPARTME") — normalization keeps the
  truncated string as the grouping key.
- `guessed-format.json` predates the real sample; it now pins the *fallback*
  path (sender hint + generic extraction + confidence cap) for BIBD messages
  that don't match the verified "Purchase of" wording (e.g. a future format
  change) — keep it.

New real variants (refunds, foreign currency, ATM withdrawals…) should be
added here as fixtures as they land in the review inbox.
