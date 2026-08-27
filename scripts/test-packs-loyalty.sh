#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# scripts/test-packs-loyalty.sh — integration test for:
#   • the 2026 pack catalogue seed (Express / Léger / Modéré / Intégral,
#     PDF prices, legacy packs deactivated)
#   • the quarterly loyalty program: tiers CRUD + validation, quarter
#     closing (idempotent, snapshot preserved through rule edits),
#     discount application at pack-attach (no stacking), master switch
#   • RBAC: every admin/loyalty route is 403 for a dentist
#
# TEST_-data pattern: throwaway rows tagged TEST_PLOY, removed on exit;
# the real loyalty tiers are captured first and restored afterwards.
# Run from the repo root with the dev stack up:
#   bash scripts/test-packs-loyalty.sh
# ─────────────────────────────────────────────────────────────────
set -uo pipefail

API="http://127.0.0.1:3000/api"
DB() { docker compose -p oralign-app exec -T postgres psql -U oralign -d oralign_db -tA "$@"; }
TMP_DIR="$(mktemp -d)"
TEST_IDS_FILE="$TMP_DIR/ids.tsv"
: > "$TEST_IDS_FILE"

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  [ok] $1"; }
bad() { FAIL=$((FAIL+1)); echo "  [XX] $1"; }
step(){ echo; echo "-- $1"; }
db_insert() { DB -c "$1" | head -n1 | tr -d ' \r'; }
remember() { printf '%s|%s\n' "$1" "$2" >> "$TEST_IDS_FILE"; }
jget() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const o=JSON.parse(d);const v=eval("o."+process.argv[1]);process.stdout.write(v===undefined||v===null?"":String(v))}catch{process.stdout.write("")}})' "$1"; }

ORIG_TIERS_JSON=""
cleanup() {
  step "Cleanup"
  # Restore the pre-test loyalty tiers.
  if [ -n "$ORIG_TIERS_JSON" ] && [ -n "${ADMIN_TOKEN:-}" ]; then
    curl -sS --retry 3 --retry-all-errors --retry-delay 1 -X PUT "$API/admin/loyalty/tiers" -H "Authorization: Bearer $ADMIN_TOKEN" \
      -H "Content-Type: application/json" -d "{\"tiers\":$ORIG_TIERS_JSON}" >/dev/null 2>&1 \
      && echo "  . loyalty tiers restored"
  fi
  # Quarter results can be (re)created by the sweeper or a lazy close at
  # any point — sweep them by doctorId first, or the Restrict FK silently
  # blocks the User deletes below and leaves TEST_ users behind.
  # Settling an installment auto-generates an Invoice tied to the
  # order — sweep those first or the DentalOrder/User deletes below
  # silently fail on the FK.
  DB -c "DELETE FROM \"Invoice\" WHERE \"orderId\" IN (SELECT id FROM \"DentalOrder\" WHERE \"orderCode\" LIKE 'TESTPLOY%');" >/dev/null 2>&1
  for D in "${DOC5_ID:-}" "${DOC10_ID:-}" "${DOC0_ID:-}"; do
    [ -n "$D" ] && DB -c "DELETE FROM \"LoyaltyQuarterResult\" WHERE \"doctorId\" = '$D';" >/dev/null 2>&1
  done
  local lines=()
  while IFS= read -r line; do [ -n "$line" ] && lines+=("$line"); done < "$TEST_IDS_FILE"
  for ((i = ${#lines[@]} - 1; i >= 0; i--)); do
    local table="${lines[i]%%|*}"
    local id="${lines[i]#*|}"
    [ -z "$table" ] && continue
    [ -z "$id" ] && continue
    DB -c "DELETE FROM \"$table\" WHERE id = '$id';" >/dev/null 2>&1 && echo "  . deleted $table $id"
  done
  # Last-resort sweep: the sweeper or a lazy close can re-create
  # LoyaltyQuarterResult rows at ANY point during cleanup, and a
  # DELETE that removed 0 rows still echoes success above — so finish
  # with an order-proof pass keyed on the throwaway email pattern.
  DB -c "DELETE FROM \"LoyaltyQuarterResult\" WHERE \"doctorId\" IN (SELECT id FROM \"User\" WHERE email LIKE 'test_ploy%');" >/dev/null 2>&1
  DB -c "DELETE FROM \"User\" WHERE email LIKE 'test_ploy%';" >/dev/null 2>&1
  LEFT=$(DB -c "SELECT count(*) FROM \"User\" WHERE email LIKE 'test_ploy%';" | head -n1 | tr -d ' \r')
  [ "$LEFT" = "0" ] && echo "  . no TEST_ residue" || echo "  ! $LEFT TEST_ user(s) left behind"
  rm -rf "$TMP_DIR"
  echo
  echo "RESULT: $PASS passed, $FAIL failed"
  [ "$FAIL" -eq 0 ]
}
trap cleanup EXIT

# ─────────────────────────────────────────────────────────────────
step "1. Seed the 2026 catalogue (idempotent) + verify"

# The backend image is a production build (no ts-node, no seeds dir),
# so the seeds run in an ephemeral node container: host repo mounted,
# attached to the compose network, DATABASE_URL rebuilt from .env.
DB_PASSWORD_VAL=$(grep -E '^DB_PASSWORD=' .env | cut -d= -f2- | tr -d '\r')
MSYS_NO_PATHCONV=1 docker run --rm \
  --network oralign-app_oralign-network \
  -v "$(pwd -W 2>/dev/null || pwd)/oralign-backend:/app" -w /app \
  -e DATABASE_URL="postgresql://oralign:${DB_PASSWORD_VAL}@postgres:5432/oralign_db" \
  node:22-alpine \
  node -e "require('ts-node/register/transpile-only'); require('./prisma/seeds/run-seeds.ts')" >/dev/null || bad 'seed run failed'

check_price() { # pack, arch, expected
  local got
  got=$(DB -c "SELECT pp.price FROM \"PackPrice\" pp JOIN \"Pack\" p ON p.id=pp.\"packId\" WHERE p.name='$1' AND pp.\"archType\"='$2' AND pp.\"isActive\"=true AND p.\"deletedAt\" IS NULL;" | head -n1 | tr -d ' \r')
  [ "$got" = "$3" ] && ok "$1 / $2 = $3 DT" || bad "$1 / $2: expected $3, got '$got'"
}
check_price "Express"  "single_arch" "1190.000"
check_price "Express"  "two_arches"  "1690.000"
check_price "Léger"    "single_arch" "2250.000"
check_price "Léger"    "two_arches"  "3190.000"
check_price "Modéré"   "single_arch" "2850.000"
check_price "Modéré"   "two_arches"  "3690.000"
check_price "Intégral" "two_arches"  "4990.000"

[ "$(DB -c "SELECT \"isUnlimitedSteps\" FROM \"Pack\" WHERE name='Intégral' AND \"deletedAt\" IS NULL;" | tr -d ' \r')" = "t" ] \
  && ok "Intégral: steps follow the treatment plan (unlimited flag)" \
  || bad "Intégral should have isUnlimitedSteps"
LEGACY_ACTIVE=$(DB -c "SELECT count(*) FROM \"Pack\" WHERE name IN ('LITE','ESSENTIAL','SMART','PRO','PRO+') AND \"isActive\"=true AND \"deletedAt\" IS NULL;" | tr -d ' \r')
[ "$LEGACY_ACTIVE" = "0" ] && ok "legacy packs deactivated" || bad "$LEGACY_ACTIVE legacy pack(s) still active"

TIER_COUNT=$(DB -c "SELECT count(*) FROM \"LoyaltyTier\" WHERE \"isActive\"=true;" | tr -d ' \r')
[ "$TIER_COUNT" -ge 1 ] && ok "loyalty tiers present ($TIER_COUNT)" || bad "no active loyalty tier after seed"

# ─────────────────────────────────────────────────────────────────
step "2. Seed users + sign in"

PASSWORD='TestPloy_2026!'
PW_HASH=$(docker compose -p oralign-app exec -T backend node -e \
  "const b=require('bcryptjs');b.hash(process.argv[1],12).then(h=>process.stdout.write(h))" \
  "$PASSWORD" 2>/dev/null | tr -d '\r')
if [ -n "$PW_HASH" ]; then ok "password hashed"; else bad "bcrypt failed"; exit 1; fi

STAMP="$(date +%s%N | tail -c 10)"
seed_user() { # role name email
  db_insert "INSERT INTO \"User\" (id, \"fullName\", email, \"passwordHash\", role, \"isActive\", \"isEmailVerified\", \"verificationStatus\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), '$2', '$3', '$PW_HASH', '$1', true, true, 'approved', NOW(), NOW()) RETURNING id;"
}
ADMIN_ID=$(seed_user admin TEST_PLOY_ADMIN "test_ploy_admin_${STAMP}@oralign.test"); remember "User" "$ADMIN_ID"; ok "admin"
DOC5_ID=$(seed_user dentist TEST_PLOY_DOC5 "test_ploy_doc5_${STAMP}@oralign.test");  remember "User" "$DOC5_ID";  ok "doctor (8 treatments → 5%)"
DOC10_ID=$(seed_user dentist TEST_PLOY_DOC10 "test_ploy_doc10_${STAMP}@oralign.test"); remember "User" "$DOC10_ID"; ok "doctor (12 treatments → 10%)"
DOC0_ID=$(seed_user dentist TEST_PLOY_DOC0 "test_ploy_doc0_${STAMP}@oralign.test");  remember "User" "$DOC0_ID";  ok "doctor (no loyalty)"

signin() {
  local email="$1" attempt resp token
  for attempt in 1 2 3 4 5 6; do
    resp=$(curl -sS --retry 3 --retry-all-errors --retry-delay 1 -X POST "$API/auth/sign-in" -H "Content-Type: application/json" -d "{\"email\":\"$email\",\"password\":\"$PASSWORD\"}")
    token=$(echo "$resp" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);process.stdout.write((j.authToken&&j.authToken.accessToken)||j.accessToken||"")}catch{}})')
    if [ -n "$token" ]; then echo "$token"; return 0; fi
    if echo "$resp" | grep -q '"statusCode":429\|ThrottlerException'; then sleep 12; continue; fi
    echo "signin error: $(echo "$resp" | head -c 200)" >&2; return 1
  done
  return 1
}
ADMIN_TOKEN=$(signin "test_ploy_admin_${STAMP}@oralign.test")
DENTIST_TOKEN=$(signin "test_ploy_doc0_${STAMP}@oralign.test")
if [ -n "$ADMIN_TOKEN" ] && [ -n "$DENTIST_TOKEN" ]; then ok "2 sign-ins"; else bad "sign-in failed"; exit 1; fi
AH="Authorization: Bearer $ADMIN_TOKEN"; DH="Authorization: Bearer $DENTIST_TOKEN"

# Capture the live tiers so cleanup can put them back.
ORIG_TIERS_JSON=$(curl -sS --retry 3 --retry-all-errors --retry-delay 1 "$API/admin/loyalty/tiers" -H "$AH" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const a=JSON.parse(d);process.stdout.write(JSON.stringify(a.map(t=>({minTreatments:t.minTreatments,discountPercent:Number(t.discountPercent)}))))}catch{process.stdout.write("")}})')
[ -n "$ORIG_TIERS_JSON" ] && ok "original tiers captured: $ORIG_TIERS_JSON" || bad "could not capture tiers"

# ─────────────────────────────────────────────────────────────────
step "3. RBAC — every admin/loyalty route is 403 for a dentist"

for route in "GET overview" "GET tiers" "POST recompute"; do
  METHOD="${route%% *}"; PATHPART="${route##* }"
  CODE=$(curl -sS --retry 3 --retry-all-errors --retry-delay 1 -o /dev/null -w '%{http_code}' -X "$METHOD" "$API/admin/loyalty/$PATHPART" -H "$DH")
  [ "$CODE" = "403" ] && ok "dentist $METHOD /admin/loyalty/$PATHPART -> 403" || bad "dentist $METHOD $PATHPART: expected 403, got $CODE"
done
CODE=$(curl -sS --retry 3 --retry-all-errors --retry-delay 1 -o /dev/null -w '%{http_code}' -X PUT "$API/admin/loyalty/tiers" -H "$DH" -H "Content-Type: application/json" -d '{"tiers":[]}')
[ "$CODE" = "403" ] && ok "dentist PUT tiers -> 403" || bad "dentist PUT tiers: expected 403, got $CODE"

# ─────────────────────────────────────────────────────────────────
step "4. Tier validation + replacement"

CODE=$(curl -sS --retry 3 --retry-all-errors --retry-delay 1 -o "$TMP_DIR/r.json" -w '%{http_code}' -X PUT "$API/admin/loyalty/tiers" -H "$AH" -H "Content-Type: application/json" \
  -d '{"tiers":[{"minTreatments":8,"discountPercent":5},{"minTreatments":8,"discountPercent":10}]}')
[ "$CODE" = "400" ] && grep -q 'LOYALTY_TIERS_DUPLICATE' "$TMP_DIR/r.json" \
  && ok "duplicate threshold rejected (400 + errorCode)" || bad "duplicate: got $CODE $(head -c 120 "$TMP_DIR/r.json")"

CODE=$(curl -sS --retry 3 --retry-all-errors --retry-delay 1 -o "$TMP_DIR/r.json" -w '%{http_code}' -X PUT "$API/admin/loyalty/tiers" -H "$AH" -H "Content-Type: application/json" \
  -d '{"tiers":[{"minTreatments":8,"discountPercent":10},{"minTreatments":12,"discountPercent":5}]}')
[ "$CODE" = "400" ] && grep -q 'LOYALTY_TIERS_NOT_MONOTONIC' "$TMP_DIR/r.json" \
  && ok "non-monotonic discounts rejected" || bad "monotonic: got $CODE"

CODE=$(curl -sS --retry 3 --retry-all-errors --retry-delay 1 -o "$TMP_DIR/r.json" -w '%{http_code}' -X PUT "$API/admin/loyalty/tiers" -H "$AH" -H "Content-Type: application/json" \
  -d '{"tiers":[{"minTreatments":8,"discountPercent":5},{"minTreatments":12,"discountPercent":10}]}')
[ "$CODE" = "200" ] && ok "PDF tiers installed (8→5%, 12→10%)" || bad "tier install: got $CODE"

# ─────────────────────────────────────────────────────────────────
step "5. Previous-quarter treatments → quarter closing"

# A treatment = a PACK quotation - the backdated quotes must carry a
# packId or countsByDoctor ignores them.
LOY_PACK_ID=$(DB -c "SELECT id FROM \"Pack\" WHERE name='Express' AND \"deletedAt\" IS NULL LIMIT 1;" | head -n1 | tr -d ' \r')
[ -n "$LOY_PACK_ID" ] || bad "no Express pack for backdated quotes"

PATIENT_ID=$(db_insert "INSERT INTO \"Patient\" (id, \"fullName\", \"doctorId\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'TEST_PLOY_PATIENT', '$DOC5_ID', NOW(), NOW()) RETURNING id;")
remember "Patient" "$PATIENT_ID"

seed_approved_quote() { # doctor, index — an approved pack quote dated LAST quarter
  local oid qid
  oid=$(db_insert "INSERT INTO \"DentalOrder\" (id, \"orderCode\", \"doctorId\", \"patientId\", status, \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'TESTPLOY_${STAMP}_$2_$RANDOM', '$1', '$PATIENT_ID', 'fabrication', NOW(), NOW()) RETURNING id;")
  remember "DentalOrder" "$oid"
  qid=$(db_insert "INSERT INTO \"Quotation\" (id, \"orderId\", \"packId\", status, \"doctorApprovedAt\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), '$oid', '$LOY_PACK_ID', 'approved', date_trunc('quarter', now()) - interval '1 day' - interval '$2 hours', NOW(), NOW()) RETURNING id;")
  remember "Quotation" "$qid"
}
for i in $(seq 1 8);  do seed_approved_quote "$DOC5_ID" "$i"; done
ok "8 approved quotes last quarter for DOC5"
for i in $(seq 1 12); do seed_approved_quote "$DOC10_ID" "$i"; done
ok "12 approved quotes last quarter for DOC10"

# The boot sweeper may have closed the quarter WHILE the backdated rows
# were being inserted, freezing partial counts (closed results are
# immutable by design). Drop any result rows for the throwaway doctors
# so the explicit recompute below re-creates them from complete data.
DB -c "DELETE FROM \"LoyaltyQuarterResult\" WHERE \"doctorId\" IN ('$DOC5_ID','$DOC10_ID','$DOC0_ID');" >/dev/null

CODE=$(curl -sS --retry 3 --retry-all-errors --retry-delay 1 -o "$TMP_DIR/r.json" -w '%{http_code}' -X POST "$API/admin/loyalty/recompute" -H "$AH")
[ "$CODE" = "201" ] || [ "$CODE" = "200" ] && ok "recompute accepted ($(jget closed < "$TMP_DIR/r.json"))" || bad "recompute: got $CODE"

check_result() { # doctor, expectedCount, expectedPercent, label
  local row
  row=$(DB -c "SELECT \"treatmentCount\"||'|'||\"discountPercent\" FROM \"LoyaltyQuarterResult\" WHERE \"doctorId\"='$1' AND (year*10+quarter)=(SELECT (EXTRACT(YEAR FROM d)*10+EXTRACT(QUARTER FROM d))::int FROM (SELECT now() - interval '3 months' AS d) q);" | head -n1 | tr -d ' \r')
  [ "$row" = "$2|$3" ] && ok "$4: $row" || bad "$4: expected $2|$3, got '$row'"
}
check_result "$DOC5_ID" 8 "5.00" "DOC5 closed at 5%"
check_result "$DOC10_ID" 12 "10.00" "DOC10 closed at 10%"
# Cleanup bookkeeping for the created results.
for D in "$DOC5_ID" "$DOC10_ID"; do
  RID=$(DB -c "SELECT id FROM \"LoyaltyQuarterResult\" WHERE \"doctorId\"='$D' ORDER BY \"computedAt\" DESC LIMIT 1;" | head -n1 | tr -d ' \r')
  [ -n "$RID" ] && remember "LoyaltyQuarterResult" "$RID"
done

# Idempotence: recompute again → same snapshot untouched.
curl -sS --retry 3 --retry-all-errors --retry-delay 1 -o /dev/null -X POST "$API/admin/loyalty/recompute" -H "$AH"
check_result "$DOC5_ID" 8 "5.00" "recompute is idempotent"

# ─────────────────────────────────────────────────────────────────
step "6. Overview reflects the program"

curl -sS --retry 3 --retry-all-errors --retry-delay 1 "$API/admin/loyalty/overview" -H "$AH" > "$TMP_DIR/ov.json"
OV_ENABLED=$(jget enabled < "$TMP_DIR/ov.json")
[ "$OV_ENABLED" = "true" ] && ok "overview: program enabled" || bad "overview enabled=$OV_ENABLED"
ROW5=$(node -e 'const o=require(process.argv[1]);const r=o.doctors.find(d=>d.doctorId===process.argv[2]);process.stdout.write(r?`${r.activeDiscountPercent}|${r.previousCount}`:"")' "$TMP_DIR/ov.json" "$DOC5_ID")
[ "$ROW5" = "5|8" ] && ok "DOC5 row: active 5% from 8 treatments" || bad "DOC5 row: got '$ROW5'"
ROW10=$(node -e 'const o=require(process.argv[1]);const r=o.doctors.find(d=>d.doctorId===process.argv[2]);process.stdout.write(r?`${r.activeDiscountPercent}|${r.previousCount}`:"")' "$TMP_DIR/ov.json" "$DOC10_ID")
[ "$ROW10" = "10|12" ] && ok "DOC10 row: active 10% from 12 treatments" || bad "DOC10 row: got '$ROW10'"

# ─────────────────────────────────────────────────────────────────
step "7. Pack-attach applies the discount exactly once"

# Dedicated test pack with a round price (1000 → 5% = 50, net 950).
PACK_ID=$(db_insert "INSERT INTO \"Pack\" (id, name, \"isActive\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'TEST_PLOY_PACK', true, NOW(), NOW()) RETURNING id;")
remember "Pack" "$PACK_ID"
PRICE_ID=$(db_insert "INSERT INTO \"PackPrice\" (id, \"packId\", \"archType\", price, currency, \"isActive\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), '$PACK_ID', 'two_arches', 1000.000, 'TND', true, NOW(), NOW()) RETURNING id;")
remember "PackPrice" "$PRICE_ID"

new_draft_quote() { # doctor → echoes quotation id
  local oid qid
  oid=$(db_insert "INSERT INTO \"DentalOrder\" (id, \"orderCode\", \"doctorId\", \"patientId\", status, \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'TESTPLOYQ_${STAMP}_$RANDOM', '$1', '$PATIENT_ID', 'treatment_approved', NOW(), NOW()) RETURNING id;")
  remember "DentalOrder" "$oid"
  qid=$(db_insert "INSERT INTO \"Quotation\" (id, \"orderId\", status, \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), '$oid', 'draft', NOW(), NOW()) RETURNING id;")
  remember "Quotation" "$qid"
  echo "$qid"
}

Q5=$(new_draft_quote "$DOC5_ID")
CODE=$(curl -sS --retry 3 --retry-all-errors --retry-delay 1 -o "$TMP_DIR/r.json" -w '%{http_code}' -X PATCH "$API/quotations/$Q5/attach-pack" -H "$AH" -H "Content-Type: application/json" -d "{\"packId\":\"$PACK_ID\"}")
[ "$CODE" = "200" ] && ok "attach-pack accepted" || bad "attach-pack: got $CODE $(head -c 150 "$TMP_DIR/r.json")"
ROW=$(DB -c "SELECT \"totalPrice\"||'|'||\"loyaltyDiscountPercent\"||'|'||\"loyaltyDiscountAmount\"||'|'||\"discountAmount\" FROM \"Quotation\" WHERE id='$Q5';" | head -n1 | tr -d ' \r')
[ "$ROW" = "950.000|5.00|50.000|50" ] && ok "5% applied: net 950, snapshot 5%/50 ($ROW)" || bad "quote figures: got '$ROW'"

# Re-attach: derived from the gross price again — no stacking.
curl -sS --retry 3 --retry-all-errors --retry-delay 1 -o /dev/null -X PATCH "$API/quotations/$Q5/attach-pack" -H "$AH" -H "Content-Type: application/json" -d "{\"packId\":\"$PACK_ID\"}"
ROW=$(DB -c "SELECT \"totalPrice\"||'|'||\"loyaltyDiscountAmount\" FROM \"Quotation\" WHERE id='$Q5';" | head -n1 | tr -d ' \r')
[ "$ROW" = "950.000|50.000" ] && ok "re-attach does not stack (still 950 / 50)" || bad "re-attach stacked: '$ROW'"

Q10=$(new_draft_quote "$DOC10_ID")
curl -sS --retry 3 --retry-all-errors --retry-delay 1 -o /dev/null -X PATCH "$API/quotations/$Q10/attach-pack" -H "$AH" -H "Content-Type: application/json" -d "{\"packId\":\"$PACK_ID\"}"
ROW=$(DB -c "SELECT \"totalPrice\"||'|'||\"loyaltyDiscountPercent\" FROM \"Quotation\" WHERE id='$Q10';" | head -n1 | tr -d ' \r')
[ "$ROW" = "900.000|10.00" ] && ok "10% tier: net 900" || bad "DOC10 quote: got '$ROW'"

Q0=$(new_draft_quote "$DOC0_ID")
curl -sS --retry 3 --retry-all-errors --retry-delay 1 -o /dev/null -X PATCH "$API/quotations/$Q0/attach-pack" -H "$AH" -H "Content-Type: application/json" -d "{\"packId\":\"$PACK_ID\"}"
ROW=$(DB -c "SELECT \"totalPrice\"||'|'||COALESCE(\"loyaltyDiscountPercent\"::text,'null') FROM \"Quotation\" WHERE id='$Q0';" | head -n1 | tr -d ' \r')
[ "$ROW" = "1000.000|null" ] && ok "no-loyalty doctor pays gross (1000, no snapshot)" || bad "DOC0 quote: got '$ROW'"

# ── 7bis. Implicit acceptance stamps doctorApprovedAt ──────────
# The doctor view has no Approve button: paying a SENT quote IS the
# acceptance, and the loyalty program counts treatments by
# doctorApprovedAt — so that path must stamp it.
DB -c "UPDATE \"Quotation\" SET status='sent' WHERE id='$Q0';" >/dev/null
INST0=$(db_insert "INSERT INTO \"QuoteInstallment\" (id, \"quotationId\", \"installmentNumber\", amount, \"availableFrom\", status, \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), '$Q0', 1, 1000.000, NOW(), 'pending', NOW(), NOW()) RETURNING id;")
remember "QuoteInstallment" "$INST0"
CODE=$(curl -sS --retry 3 --retry-all-errors --retry-delay 1 -o "$TMP_DIR/r.json" -w '%{http_code}' -X POST "$API/admin/quotations/$Q0/installments/$INST0/record-cash" -H "$AH" -H "Content-Type: application/json" -d '{"receiptNumber":"TEST_PLOY_CASH_1"}')
PAY0=$(DB -c "SELECT id FROM \"Payment\" WHERE \"installmentId\"='$INST0';" | head -n1 | tr -d ' \r')
[ -n "$PAY0" ] && remember "Payment" "$PAY0"
ROW=$(DB -c "SELECT status||'|'||(\"doctorApprovedAt\" IS NOT NULL)||'|'||\"paymentStatus\" FROM \"Quotation\" WHERE id='$Q0';" | head -n1 | tr -d ' \r')
[ "$CODE" = "201" ] || [ "$CODE" = "200" ] || bad "record-cash: got $CODE $(head -c 150 "$TMP_DIR/r.json")"
[ "$ROW" = "approved|true|paid" ] && ok "pay-first acceptance stamps doctorApprovedAt ($ROW)" || bad "implicit approval: got '$ROW'"

# ─────────────────────────────────────────────────────────────────
step "8. History survives rule edits"

curl -sS --retry 3 --retry-all-errors --retry-delay 1 -o /dev/null -X PUT "$API/admin/loyalty/tiers" -H "$AH" -H "Content-Type: application/json" \
  -d '{"tiers":[{"minTreatments":8,"discountPercent":7},{"minTreatments":12,"discountPercent":15}]}'
check_result "$DOC5_ID" 8 "5.00" "closed quarter still says 5% after tier edit"
ROW=$(DB -c "SELECT \"loyaltyDiscountPercent\" FROM \"Quotation\" WHERE id='$Q5';" | head -n1 | tr -d ' \r')
[ "$ROW" = "5.00" ] && ok "issued quote still snapshots 5%" || bad "quote snapshot mutated: '$ROW'"
# New attach under the NEW rules picks up... still the CLOSED 5% (the
# closed quarter is the source, not the live tier list).
QN=$(new_draft_quote "$DOC5_ID")
curl -sS --retry 3 --retry-all-errors --retry-delay 1 -o /dev/null -X PATCH "$API/quotations/$QN/attach-pack" -H "$AH" -H "Content-Type: application/json" -d "{\"packId\":\"$PACK_ID\"}"
ROW=$(DB -c "SELECT \"loyaltyDiscountPercent\" FROM \"Quotation\" WHERE id='$QN';" | head -n1 | tr -d ' \r')
[ "$ROW" = "5.00" ] && ok "new quote uses the CLOSED snapshot (5%), not the edited ladder" || bad "new quote: got '$ROW'"

# ─────────────────────────────────────────────────────────────────
step "9. Master switch off → no discount"

SETTINGS_ID=$(DB -c 'SELECT id FROM "CompanyBillingSettings" WHERE "isActive"=true ORDER BY "updatedAt" DESC LIMIT 1;' | tr -d ' \r')
if [ -n "$SETTINGS_ID" ]; then
  DB -c "UPDATE \"CompanyBillingSettings\" SET \"loyaltyEnabled\"=false WHERE id='$SETTINGS_ID';" >/dev/null
  QOFF=$(new_draft_quote "$DOC5_ID")
  curl -sS --retry 3 --retry-all-errors --retry-delay 1 -o /dev/null -X PATCH "$API/quotations/$QOFF/attach-pack" -H "$AH" -H "Content-Type: application/json" -d "{\"packId\":\"$PACK_ID\"}"
  ROW=$(DB -c "SELECT \"totalPrice\"||'|'||COALESCE(\"loyaltyDiscountPercent\"::text,'null') FROM \"Quotation\" WHERE id='$QOFF';" | head -n1 | tr -d ' \r')
  [ "$ROW" = "1000.000|null" ] && ok "program off: gross price, no snapshot" || bad "program off: got '$ROW'"
  DB -c "UPDATE \"CompanyBillingSettings\" SET \"loyaltyEnabled\"=true WHERE id='$SETTINGS_ID';" >/dev/null
  ok "master switch restored"
else
  ok "no active billing settings — master-switch check skipped"
fi
