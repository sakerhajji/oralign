#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# scripts/test-cbct-submit-guard.sh — integration test for the
# server-side CBCT gate on order submission.
#
# The rule: an order flagged `useCbctWithScans` cannot be submitted
# unless it actually carries a CBCT file. The wizard blocks its own
# submit button, but POST /orders/:id/submit is callable directly —
# these asserts cover the authoritative guard.
#
# Accepted shapes mirror what the upload panel produces:
#   • a ZIP bundle            → category `zip`
#   • loose companion files   → category `other`
#   • individual DICOM slices → category `image` with a .dcm name
# Clinical photos must NOT satisfy it.
#
# TEST_-data pattern (see test-cbct-chunked.sh): throwaway rows tagged
# TEST_CBCTG, removed on exit. Run from the repo root, stack up:
#   bash scripts/test-cbct-submit-guard.sh
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

cleanup() {
  step "Cleanup"
  local lines=()
  while IFS= read -r line; do [ -n "$line" ] && lines+=("$line"); done < "$TEST_IDS_FILE"
  for ((i = ${#lines[@]} - 1; i >= 0; i--)); do
    local table="${lines[i]%%|*}"
    local id="${lines[i]#*|}"
    [ -z "$table" ] && continue
    [ -z "$id" ] && continue
    DB -c "DELETE FROM \"$table\" WHERE id = '$id';" >/dev/null 2>&1 && echo "  . deleted $table $id"
  done
  rm -rf "$TMP_DIR"
  echo
  echo "RESULT: $PASS passed, $FAIL failed"
}
trap cleanup EXIT

# ─────────────────────────────────────────────────────────────────
step "1. Seed doctor + patient"

PASSWORD='TestCbctG_2026!'
PW_HASH=$(docker compose -p oralign-app exec -T backend node -e \
  "const b=require('bcryptjs');b.hash(process.argv[1],12).then(h=>process.stdout.write(h))" \
  "$PASSWORD" 2>/dev/null | tr -d '\r')
if [ -n "$PW_HASH" ]; then ok "password hashed"; else bad "bcrypt failed"; exit 1; fi

STAMP="$(date +%s%N | tail -c 10)"
DOCTOR_ID=$(db_insert "INSERT INTO \"User\" (id, \"fullName\", email, \"passwordHash\", role, \"isActive\", \"isEmailVerified\", \"verificationStatus\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'TEST_CBCTG_DOCTOR', 'test_cbctg_doc_${STAMP}@oralign.test', '$PW_HASH', 'dentist', true, true, 'approved', NOW(), NOW()) RETURNING id;")
remember "User" "$DOCTOR_ID"; ok "doctor=$DOCTOR_ID"

PATIENT_ID=$(db_insert "INSERT INTO \"Patient\" (id, \"fullName\", \"doctorId\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'TEST_CBCTG_PATIENT', '$DOCTOR_ID', NOW(), NOW()) RETURNING id;")
remember "Patient" "$PATIENT_ID"; ok "patient"

step "2. Sign in"
signin() {
  local email="$1" attempt resp token
  for attempt in 1 2 3 4 5 6; do
    resp=$(curl -sS -X POST "$API/auth/sign-in" -H "Content-Type: application/json" -d "{\"email\":\"$email\",\"password\":\"$PASSWORD\"}")
    token=$(echo "$resp" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);process.stdout.write((j.authToken&&j.authToken.accessToken)||j.accessToken||"")}catch{}})')
    if [ -n "$token" ]; then echo "$token"; return 0; fi
    if echo "$resp" | grep -q '"statusCode":429\|ThrottlerException'; then sleep 12; continue; fi
    echo "signin error: $(echo "$resp" | head -c 200)" >&2; return 1
  done
  return 1
}
DOCTOR_TOKEN=$(signin "test_cbctg_doc_${STAMP}@oralign.test")
if [ -n "$DOCTOR_TOKEN" ]; then ok "signed in"; else bad "sign-in failed"; exit 1; fi
DH="Authorization: Bearer $DOCTOR_TOKEN"

# ── helpers ──────────────────────────────────────────────────────
new_order() { # $1 = useCbctWithScans (true|false) ; echoes order id
  local oid
  oid=$(db_insert "INSERT INTO \"DentalOrder\" (id, \"orderCode\", \"doctorId\", \"patientId\", status, \"useCbctWithScans\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'TESTCBCTG_${STAMP}_$RANDOM', '$DOCTOR_ID', '$PATIENT_ID', 'draft', $1, NOW(), NOW()) RETURNING id;")
  remember "DentalOrder" "$oid"
  echo "$oid"
}
add_file() { # $1 order, $2 category, $3 originalName
  local fid
  fid=$(db_insert "INSERT INTO \"OrderFile\" (id, \"orderId\", category, \"originalName\", \"fileName\", \"relativePath\", \"mimeType\", size, \"createdAt\") VALUES (gen_random_uuid(), '$1', '$2', '$3', '$3', 'orders/$1/$3', 'application/octet-stream', 1024, NOW()) RETURNING id;")
  remember "OrderFile" "$fid"
}
submit_code() { # $1 order id — echoes the HTTP status, body left in resp.json
  curl -sS -o "$TMP_DIR/resp.json" -w '%{http_code}' -X POST "$API/orders/$1/submit" \
    -H "$DH" -H "Content-Type: application/json" -d '{"termsAccepted":true}'
}
accepted() { [ "$1" = "200" ] || [ "$1" = "201" ]; }

# ─────────────────────────────────────────────────────────────────
step "3. CBCT on, no file at all -> refused"
O1=$(new_order true)
CODE=$(submit_code "$O1")
[ "$CODE" = "400" ] && ok "submit refused (400)" || bad "expected 400, got $CODE"
grep -q 'CBCT_FILES_MISSING' "$TMP_DIR/resp.json" \
  && ok "errorCode CBCT_FILES_MISSING" \
  || bad "errorCode missing: $(head -c 160 "$TMP_DIR/resp.json")"
[ "$(DB -c "SELECT status FROM \"DentalOrder\" WHERE id='$O1';" | tr -d ' \r')" = "draft" ] \
  && ok "order stayed draft" || bad "order status changed despite refusal"

step "4. CBCT on, only a clinical photo -> still refused"
O2=$(new_order true)
add_file "$O2" "right_photo" "joue-droite.jpg"
CODE=$(submit_code "$O2")
[ "$CODE" = "400" ] && ok "photos do not satisfy the CBCT gate" || bad "expected 400, got $CODE"

step "5. CBCT on + ZIP bundle -> accepted"
O3=$(new_order true)
add_file "$O3" "zip" "volume-cbct.zip"
CODE=$(submit_code "$O3")
accepted "$CODE" && ok "submit accepted ($CODE)" || bad "expected 200/201, got $CODE"
[ "$(DB -c "SELECT status FROM \"DentalOrder\" WHERE id='$O3';" | tr -d ' \r')" = "submitted" ] \
  && ok "order is submitted" || bad "order not submitted"

step "6. CBCT on + loose file under 'other' -> accepted"
O4=$(new_order true)
add_file "$O4" "other" "scan-notes.txt"
CODE=$(submit_code "$O4")
accepted "$CODE" && ok "loose 'other' file accepted ($CODE)" || bad "expected 200/201, got $CODE"

step "7. CBCT on + single .dcm slice filed as image -> accepted"
O5=$(new_order true)
add_file "$O5" "image" "slice-0001.DCM"
CODE=$(submit_code "$O5")
accepted "$CODE" && ok ".dcm slice accepted, case-insensitive ($CODE)" || bad "expected 200/201, got $CODE"

step "8. CBCT OFF, no file -> guard does not fire"
O6=$(new_order false)
CODE=$(submit_code "$O6")
accepted "$CODE" && ok "non-CBCT order submits freely ($CODE)" || bad "expected 200/201, got $CODE"

step "9. Soft-deleted CBCT file must not count"
O7=$(new_order true)
FID=$(db_insert "INSERT INTO \"OrderFile\" (id, \"orderId\", category, \"originalName\", \"fileName\", \"relativePath\", \"mimeType\", size, \"createdAt\", \"deletedAt\") VALUES (gen_random_uuid(), '$O7', 'zip', 'supprime.zip', 'supprime.zip', 'orders/$O7/supprime.zip', 'application/zip', 1024, NOW(), NOW()) RETURNING id;")
remember "OrderFile" "$FID"
CODE=$(submit_code "$O7")
[ "$CODE" = "400" ] && ok "deleted bundle does not satisfy the gate" || bad "expected 400, got $CODE"
