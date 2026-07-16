#!/usr/bin/env bash
# End-to-end ingest verification matrix (HANDOFF.md §11 items 2–4).
# Prereqs: Docker running, `supabase start` done (which applies migrations +
# seed), and in another terminal: `supabase functions serve ingest`.
# Run from repo root (Git Bash on Windows): bash scripts/verify-ingest.sh
set -euo pipefail

FUNC_URL="${FUNC_URL:-http://127.0.0.1:54321/functions/v1/ingest}"
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
TOKEN="bp_devSeedToken0000000000000000000000000001"   # seeded dev token
DEMO_USER="11111111-1111-1111-1111-111111111111"
RLS_USER="22222222-2222-2222-2222-222222222222"
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

sql() { psql "$DB_URL" -X -A -t -c "$1"; }

# Clean slate for the sample row so the script is re-runnable.
sql "delete from transactions where user_id = '$DEMO_USER' and raw_text like 'Card No.: 4x0213 Amount: BND 21.00 Merchant: GALORIES%'" >/dev/null
sql "delete from transactions where user_id = '$DEMO_USER' and source = 'ios_shortcut' and raw_text like '%garbage%'" >/dev/null

# SAMPLE contains no JSON-special characters, so plain interpolation is safe.
body="{\"text\":\"$SAMPLE\",\"source\":\"ios_shortcut\",\"sender\":\"Baiduri\"}"

# 1. Real Baiduri sample → created
r=$(post "$TOKEN" "$body"); check "baiduri sample -> created" "$r" '"status":"created"'

# 2. Same text again → duplicate
r=$(post "$TOKEN" "$body"); check "re-send -> duplicate" "$r" '"status":"duplicate"'

# 3. Garbage text → created as needs_review
r=$(post "$TOKEN" '{"text":"totally garbage text with no amount","source":"ios_shortcut"}')
check "garbage -> created" "$r" '"status":"created"'
check "garbage -> needs_review" "$r" '"parse_status":"needs_review"'

# 4. Bad token → 401
r=$(post "bp_invalidtoken" "$body"); check "bad token -> 401" "$r" '401'

# 5. OTP → ignored, never inserted
r=$(post "$TOKEN" '{"text":"Your Baiduri OTP is 123456. Do not share this code.","source":"ios_shortcut"}')
check "otp -> ignored" "$r" '"status":"ignored"'

# 6. psql-assert the parsed sample row
row=$(sql "select amount, merchant, occurred_at, bank, parse_status from transactions
           where user_id = '$DEMO_USER' and raw_hash is not null
             and merchant = 'GALORIES SMOOTHIES BSB BN' and amount = 21.00
             and occurred_at = '2026-07-10 17:37:59+08' and bank = 'baiduri'
             and parse_status = 'parsed'")
check "psql row assertions (amount/merchant/occurred_at/bank/status)" "$row" "GALORIES SMOOTHIES BSB BN"

# 7. RLS proof: as user B, user A's transactions are invisible
# Output mixes command tags (BEGIN/SET/COMMIT) and rows — take the last
# purely numeric line (the count).
count=$(sql "begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub','$RLS_USER','role','authenticated')::text, true);
  select count(*) from transactions where user_id = '$DEMO_USER';
  commit;" | grep -Ex '[0-9]+' | tail -1)
check "RLS: user B sees 0 of user A's rows" "$count" "0"

echo
echo "passed: $pass  failed: $fail"
[[ $fail -eq 0 ]]
