#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# scripts/test-cbct-chunked.sh — integration test for:
#   • chunked / resumable CBCT ZIP uploads (init → chunks → resume
#     view → complete → duplicate guard → security scan → RBAC)
#   • CBCT paid-supplement pricing (config → snapshot on create →
#     frozen against config changes → cleared on toggle-off)
#
# Follows the TEST_-data pattern of scripts/test-packs-payments.sh:
# throwaway rows tagged TEST_CBCT, cleaned up on exit; the billing
# settings row is restored to its original values.
#
# Run from the repo root with the dev stack up:
#   bash scripts/test-cbct-chunked.sh
# ─────────────────────────────────────────────────────────────────
set -uo pipefail

API="http://127.0.0.1:3000/api"
DB() { docker compose -p oralign-app exec -T postgres psql -U oralign -d oralign_db -tA "$@"; }
TMP_DIR="$(mktemp -d)"
TEST_IDS_FILE="$TMP_DIR/ids.tsv"
: > "$TEST_IDS_FILE"

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✔ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✘ $1"; }
step(){ echo; echo "── $1"; }

db_insert() { DB -c "$1" | head -n1 | tr -d ' \r'; }
remember() { printf '%s\t%s\n' "$1" "$2" >> "$TEST_IDS_FILE"; }

ORIG_CBCT_ENABLED=""; ORIG_CBCT_FEE=""; SETTINGS_ID=""
cleanup() {
  step "Cleanup"
  # Restore billing settings to their pre-test CBCT values.
  if [ -n "$SETTINGS_ID" ] && [ -n "$ORIG_CBCT_ENABLED" ]; then
    DB -c "UPDATE \"CompanyBillingSettings\" SET \"cbctSupplementEnabled\"='$ORIG_CBCT_ENABLED', \"cbctSupplementFee\"='$ORIG_CBCT_FEE' WHERE id='$SETTINGS_ID';" >/dev/null 2>&1 \
      && echo "  · billing settings restored"
  fi
  # Remove uploaded test files from the container volume.
  docker compose -p oralign-app exec -T backend sh -c 'rm -rf /app/uploads/orders/TESTCBCT* 2>/dev/null' >/dev/null 2>&1
  # Upload directories are named by order UUID, not by the TESTCBCT tag,
  # so the glob above never matched them and every run leaked one folder.
  # Guarded + quoted: an empty id here would expand to the whole
  # /app/uploads/orders tree inside the container.
  if [ -n "${ORDER_ID:-}" ]; then
    docker compose -p oralign-app exec -T backend sh -c "rm -rf '/app/uploads/orders/$ORDER_ID'" >/dev/null 2>&1 || true
  fi
  local lines=()
  while IFS= read -r line; do [ -n "$line" ] && lines+=("$line"); done < "$TEST_IDS_FILE"
  for ((i = ${#lines[@]} - 1; i >= 0; i--)); do
    local table="${lines[i]%%$'\t'*}"; local id="${lines[i]#*$'\t'}"
    [ -z "$table" ] || [ -z "$id" ] && continue
    DB -c "DELETE FROM \"$table\" WHERE id = '$id';" >/dev/null 2>&1 && echo "  · deleted $table $id"
  done
  rm -rf "$TMP_DIR"
  echo
  echo "RESULT: $PASS passed, $FAIL failed"
}
trap cleanup EXIT

# ─────────────────────────────────────────────────────────────────
step "1. Seed admin + doctor + patient + orders"

PASSWORD='TestCbct_2026!'
PW_HASH=$(docker compose -p oralign-app exec -T backend node -e \
  "const b=require('bcryptjs');b.hash(process.argv[1],12).then(h=>process.stdout.write(h))" \
  "$PASSWORD" 2>/dev/null | tr -d '\r')
[ -n "$PW_HASH" ] && ok "password hashed" || { bad "bcrypt failed"; exit 1; }

STAMP="$(date +%s%N | tail -c 10)"

SETTINGS_ID=$(DB -c 'SELECT id FROM "CompanyBillingSettings" WHERE "isActive"=true ORDER BY "updatedAt" DESC LIMIT 1;' | tr -d ' \r')
if [ -z "$SETTINGS_ID" ]; then
  SETTINGS_ID=$(db_insert "INSERT INTO \"CompanyBillingSettings\" (id, \"companyName\", \"defaultTvaRate\", \"defaultCurrency\", \"devisPrefix\", \"devisNextNumber\", \"isActive\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'TEST_CBCT_SETTINGS', 0, 'TND', 'TST', 1, true, NOW(), NOW()) RETURNING id;")
  remember "CompanyBillingSettings" "$SETTINGS_ID"
fi
read -r ORIG_CBCT_ENABLED ORIG_CBCT_FEE < <(DB -c "SELECT \"cbctSupplementEnabled\", \"cbctSupplementFee\" FROM \"CompanyBillingSettings\" WHERE id='$SETTINGS_ID';" | tr '|' ' ')
ok "settings=$SETTINGS_ID (orig cbct: $ORIG_CBCT_ENABLED/$ORIG_CBCT_FEE)"

seed_user() { # role name email
  db_insert "INSERT INTO \"User\" (id, \"fullName\", email, \"passwordHash\", role, \"isActive\", \"isEmailVerified\", \"verificationStatus\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), '$2', '$3', '$PW_HASH', '$1', true, true, 'approved', NOW(), NOW()) RETURNING id;"
}
ADMIN_ID=$(seed_user admin TEST_CBCT_ADMIN "test_cbct_admin_${STAMP}@oralign.test");   remember "User" "$ADMIN_ID";  ok "admin"
DOCTOR_ID=$(seed_user dentist TEST_CBCT_DOCTOR "test_cbct_doc_${STAMP}@oralign.test"); remember "User" "$DOCTOR_ID"; ok "doctor"
DOCTOR2_ID=$(seed_user dentist TEST_CBCT_DOC2 "test_cbct_doc2_${STAMP}@oralign.test"); remember "User" "$DOCTOR2_ID"; ok "doctor2 (RBAC foil)"

PATIENT_ID=$(db_insert "INSERT INTO \"Patient\" (id, \"fullName\", \"doctorId\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'TEST_CBCT_PATIENT', '$DOCTOR_ID', NOW(), NOW()) RETURNING id;")
remember "Patient" "$PATIENT_ID"; ok "patient"

ORDER_ID=$(db_insert "INSERT INTO \"DentalOrder\" (id, \"orderCode\", \"doctorId\", \"patientId\", status, \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'TESTCBCT_UP_${STAMP}', '$DOCTOR_ID', '$PATIENT_ID', 'draft', NOW(), NOW()) RETURNING id;")
remember "DentalOrder" "$ORDER_ID"; ok "upload order=$ORDER_ID"

# ─────────────────────────────────────────────────────────────────
step "2. Sign in"
signin() { # retries on auth throttling (429) up to ~60s
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
ADMIN_TOKEN=$(signin "test_cbct_admin_${STAMP}@oralign.test")
DOCTOR_TOKEN=$(signin "test_cbct_doc_${STAMP}@oralign.test")
DOCTOR2_TOKEN=$(signin "test_cbct_doc2_${STAMP}@oralign.test")
[ -n "$ADMIN_TOKEN" ] && [ -n "$DOCTOR_TOKEN" ] && [ -n "$DOCTOR2_TOKEN" ] && ok "3 sign-ins" || { bad "sign-in failed"; exit 1; }
AH="Authorization: Bearer $ADMIN_TOKEN"; DH="Authorization: Bearer $DOCTOR_TOKEN"; D2H="Authorization: Bearer $DOCTOR2_TOKEN"
json() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);const p=process.argv[1].split(".");let v=j;for(const k of p){v=v?.[k]}process.stdout.write(v===undefined||v===null?"":String(v))}catch{process.stdout.write("")}})' "$1"; }

# ─────────────────────────────────────────────────────────────────
step "3. CBCT supplement pricing"

curl -sS -X PUT "$API/admin/company-billing-settings" -H "$AH" -H "Content-Type: application/json" \
  -d '{"cbctSupplementEnabled":true,"cbctSupplementFee":120}' >/dev/null
PD=$(curl -sS "$API/company-billing-settings/public-defaults" -H "$DH")
[ "$(echo "$PD" | json cbctSupplementEnabled)" = "true" ] && [ "$(echo "$PD" | json cbctSupplementFee)" = "120" ] \
  && ok "public-defaults exposes enabled + fee=120" || bad "public-defaults missing cbct fields: $PD"

O1=$(curl -sS -X POST "$API/orders" -H "$DH" -H "Content-Type: application/json" \
  -d "{\"patientId\":\"$PATIENT_ID\",\"useCbctWithScans\":true}")
O1_ID=$(echo "$O1" | json id); [ -n "$O1_ID" ] && remember "DentalOrder" "$O1_ID"
[ "$(echo "$O1" | json cbctFeeAmount)" = "120" ] && ok "order snapshots fee 120 at creation" || bad "no snapshot: $(echo "$O1" | head -c 200)"

# Config change must NOT reprice the existing order…
curl -sS -X PUT "$API/admin/company-billing-settings" -H "$AH" -H "Content-Type: application/json" \
  -d '{"cbctSupplementFee":200}' >/dev/null
O1B=$(curl -sS "$API/orders/$O1_ID" -H "$DH")
[ "$(echo "$O1B" | json cbctFeeAmount)" = "120" ] && ok "existing order keeps 120 after config change" || bad "existing order repriced: $(echo "$O1B" | json cbctFeeAmount)"

# …but a NEW order gets the new price.
O2=$(curl -sS -X POST "$API/orders" -H "$DH" -H "Content-Type: application/json" \
  -d "{\"patientId\":\"$PATIENT_ID\",\"useCbctWithScans\":true}")
O2_ID=$(echo "$O2" | json id); [ -n "$O2_ID" ] && remember "DentalOrder" "$O2_ID"
[ "$(echo "$O2" | json cbctFeeAmount)" = "200" ] && ok "new order snapshots 200" || bad "new order price: $(echo "$O2" | json cbctFeeAmount)"

# Toggling CBCT off on a draft clears the snapshot.
O2C=$(curl -sS -X PUT "$API/orders/$O2_ID" -H "$DH" -H "Content-Type: application/json" \
  -d '{"useCbctWithScans":false}')
[ -z "$(echo "$O2C" | json cbctFeeAmount)" ] && ok "toggle-off clears snapshot" || bad "snapshot survived toggle-off"

# Order without CBCT carries no fee.
O3=$(curl -sS -X POST "$API/orders" -H "$DH" -H "Content-Type: application/json" -d "{\"patientId\":\"$PATIENT_ID\"}")
O3_ID=$(echo "$O3" | json id); [ -n "$O3_ID" ] && remember "DentalOrder" "$O3_ID"
[ -z "$(echo "$O3" | json cbctFeeAmount)" ] && ok "no-CBCT order has no fee" || bad "unexpected fee on plain order"

# ─────────────────────────────────────────────────────────────────
step "4. Chunked upload — happy path with resume view"

# A REAL ~20 MB zip (3 chunks at 8 MiB): random payload compresses ~1:1.
# Entry must be an allowed type — .dcm like a genuine CBCT export
# (.bin would be rejected by the executable denylist, by design).
head -c 20971520 /dev/urandom > "$TMP_DIR/scan0001.dcm"
(cd "$TMP_DIR" && powershell.exe -NoProfile -Command "Compress-Archive -Path scan0001.dcm -DestinationPath cbct-test.zip -Force" >/dev/null 2>&1)
ZIP="$TMP_DIR/cbct-test.zip"
ZIP_SIZE=$(stat -c%s "$ZIP" 2>/dev/null || wc -c < "$ZIP" | tr -d ' ')
[ "$ZIP_SIZE" -gt 16777216 ] && ok "test zip built ($ZIP_SIZE bytes)" || { bad "zip build failed"; exit 1; }

INIT=$(curl -sS -X POST "$API/orders/$ORDER_ID/files/chunked" -H "$DH" -H "Content-Type: application/json" \
  -d "{\"fileName\":\"cbct-test.zip\",\"size\":$ZIP_SIZE,\"mimeType\":\"application/zip\",\"category\":\"zip\"}")
UPLOAD_ID=$(echo "$INIT" | json uploadId); CHUNK=$(echo "$INIT" | json chunkSize); TOTAL=$(echo "$INIT" | json totalChunks)
[ -n "$UPLOAD_ID" ] && ok "session opened ($TOTAL chunks of $CHUNK)" || { bad "init failed: $INIT"; exit 1; }

put_chunk() { # index — exact byte slice via node, then multipart PUT
  local idx="$1"
  node -e 'const fs=require("fs");const [zip,out,idx,chunk,total]=process.argv.slice(1);const s=Number(idx)*Number(chunk);const e=Math.min(s+Number(chunk),Number(total));const b=fs.readFileSync(zip);fs.writeFileSync(out,b.subarray(s,e));' \
    "$ZIP" "$TMP_DIR/part" "$idx" "$CHUNK" "$ZIP_SIZE"
  curl -sS -o /dev/null -w '%{http_code}' -X PUT "$API/orders/$ORDER_ID/files/chunked/$UPLOAD_ID/chunks/$idx" -H "$DH" -F "chunk=@$TMP_DIR/part"
}

C0=$(put_chunk 0); C1=$(put_chunk 1)
[ "$C0" = "200" ] && [ "$C1" = "200" ] && ok "chunks 0+1 uploaded" || bad "chunk upload: $C0/$C1"

STATE=$(curl -sS "$API/orders/$ORDER_ID/files/chunked/$UPLOAD_ID" -H "$DH")
RCV=$(echo "$STATE" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write(JSON.parse(d).receivedChunks.join(","))}catch{}})')
[ "$RCV" = "0,1" ] && ok "resume view reports [0,1]" || bad "resume view: $RCV"

# Premature complete must fail cleanly.
PC=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$API/orders/$ORDER_ID/files/chunked/$UPLOAD_ID/complete" -H "$DH")
[ "$PC" = "400" ] && ok "premature complete rejected (400)" || bad "premature complete: $PC"

C2=$(put_chunk 2)
[ "$C2" = "200" ] && ok "chunk 2 uploaded (resume)" || bad "chunk 2: $C2"

DONE=$(curl -sS -X POST "$API/orders/$ORDER_ID/files/chunked/$UPLOAD_ID/complete" -H "$DH")
FILE_ID=$(echo "$DONE" | json id)
[ -n "$FILE_ID" ] && remember "OrderFile" "$FILE_ID"
[ "$(echo "$DONE" | json size)" = "$ZIP_SIZE" ] && [ "$(echo "$DONE" | json category)" = "zip" ] \
  && ok "assembled + registered as OrderFile ($FILE_ID)" || bad "complete failed: $(echo "$DONE" | head -c 300)"

SESSIONS_LEFT=$(DB -c "SELECT COUNT(*) FROM \"UploadSession\" WHERE \"orderId\"='$ORDER_ID';" | tr -d ' \r')
[ "$SESSIONS_LEFT" = "0" ] && ok "session cleaned up after complete" || bad "session rows left: $SESSIONS_LEFT"

# ─────────────────────────────────────────────────────────────────
step "5. Duplicate + security + RBAC"

DUP=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$API/orders/$ORDER_ID/files/chunked" -H "$DH" -H "Content-Type: application/json" \
  -d "{\"fileName\":\"cbct-test.zip\",\"size\":$ZIP_SIZE,\"category\":\"zip\"}")
[ "$DUP" = "409" ] && ok "duplicate init rejected (409)" || bad "duplicate init: $DUP"

# A "zip" whose bytes are random → magic mismatch at complete-time scan.
head -c 1048576 /dev/urandom > "$TMP_DIR/fake.bin"
FAKE_SIZE=$(wc -c < "$TMP_DIR/fake.bin" | tr -d ' ')
FI=$(curl -sS -X POST "$API/orders/$ORDER_ID/files/chunked" -H "$DH" -H "Content-Type: application/json" \
  -d "{\"fileName\":\"evil.zip\",\"size\":$FAKE_SIZE,\"category\":\"zip\"}")
FID=$(echo "$FI" | json uploadId)
curl -sS -o /dev/null -X PUT "$API/orders/$ORDER_ID/files/chunked/$FID/chunks/0" -H "$DH" -F "chunk=@$TMP_DIR/fake.bin"
SEC=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$API/orders/$ORDER_ID/files/chunked/$FID/complete" -H "$DH")
[ "$SEC" = "400" ] && ok "fake zip rejected by content scan (400)" || bad "fake zip: $SEC"
curl -sS -o /dev/null -X DELETE "$API/orders/$ORDER_ID/files/chunked/$FID" -H "$DH"

# Another doctor cannot touch this order's chunked endpoints.
R1=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$API/orders/$ORDER_ID/files/chunked" -H "$D2H" -H "Content-Type: application/json" \
  -d '{"fileName":"x.zip","size":1000,"category":"zip"}')
[ "$R1" = "404" ] && ok "foreign doctor blocked (404, no existence leak)" || bad "RBAC init: $R1"

# ─────────────────────────────────────────────────────────────────
step "6. Order files list shows the uploaded bundle"
LIST=$(curl -sS "$API/orders/$ORDER_ID/files" -H "$DH")
echo "$LIST" | grep -q "$FILE_ID" && ok "file visible in order files" || bad "file missing from list"
