#!/usr/bin/env bash
# Hosted ingest verification matrix — no psql, no seed data.
# Prereqs: hosted project deployed (supabase db push + functions deploy ingest),
# a real account created in the app, and an ingest token from
# Settings → Capture devices (any kind).
#
# Usage (Git Bash):
#   FUNC_URL=https://<ref>.supabase.co/functions/v1/ingest TOKEN=bp_... \
#     bash scripts/verify-ingest-hosted.sh
set -euo pipefail

: "${FUNC_URL:?set FUNC_URL to https://<ref>.supabase.co/functions/v1/ingest}"
: "${TOKEN:?set TOKEN to a bp_... ingest token created in the app}"

SAMPLE='Card No.: 4x0213 Amount: BND 21.00 Merchant: GALORIES SMOOTHIES BSB BN Date: 10-07-2026 17:37:59 If suspicious, please call 2449666.'

pass=0; fail=0
check() { # check <name> <actual> <expected-substring>
  if [[ "$2" == *"$3"* ]]; then echo "PASS: $1"; pass=$((pass+1));
  else echo "FAIL: $1"; echo "  expected substring: $3"; echo "  actual: $2"; fail=$((fail+1)); fi
}

post() { # post <token> <json-body>
  curl -s -w $'\n%{http_code}' -X POST "$FUNC_URL" \
    -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -d "$2"
}

body="{\"text\":\"$SAMPLE\",\"source\":\"ios_shortcut\",\"sender\":\"Baiduri\"}"

# 1. Bad token → 401
r=$(post "bp_invalidtoken" "$body"); check "bad token -> 401" "$r" '401'

# 2. Real Baiduri sample → created + parsed (or duplicate on re-runs)
r=$(post "$TOKEN" "$body")
if [[ "$r" == *'"status":"duplicate"'* ]]; then
  echo "NOTE: sample already ingested previously; treating as pass"
  check "baiduri sample -> created-or-duplicate" "$r" '"status":"duplicate"'
else
  check "baiduri sample -> created" "$r" '"status":"created"'
  check "baiduri sample -> parsed" "$r" '"parse_status":"parsed"'
fi

# 3. Same text again → duplicate
r=$(post "$TOKEN" "$body"); check "re-send -> duplicate" "$r" '"status":"duplicate"'

# 4. OTP → ignored, never inserted
r=$(post "$TOKEN" '{"text":"Your Baiduri OTP is 123456. Do not share this code.","source":"ios_shortcut"}')
check "otp -> ignored" "$r" '"status":"ignored"'

echo
echo "passed: $pass, failed: $fail"
[[ $fail -eq 0 ]]
