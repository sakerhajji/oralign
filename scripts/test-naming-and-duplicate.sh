#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# scripts/test-naming-and-duplicate.sh
#
# Isolated end-to-end test of:
#   1. Order code format `<PatientSlug>_YYYYMMDD[-NN]`
#   2. Quotation number format `dv_<PatientSlug>_YYYYMMDD[-NN]`
#   3. Per-doctor patient duplicate check
#        – Doctor A cannot add the same patient twice
#        – Doctor B *can* add the same patient (cross-doctor allowed)
#   4. PDF i18n: "TVA" appears, "VAT" does not (English doc)
#
# All fixtures are tagged TEST_NAME_DUP_* and cleaned on EXIT.
# ─────────────────────────────────────────────────────────────────────

set -u
PASS=0
FAIL=0
LOG=()

DB="docker compose -p oralign-app exec -T postgres psql -U oralign -d oralign_db -t -A"
API="http://localhost:3000/api"

db_insert() {
  $DB -c "$1" 2>&1 | head -1 | tr -d '\r\n[:space:]'
}

TEST_IDS_FILE="$(mktemp)"
echo "" > "$TEST_IDS_FILE"

log()  { LOG+=("$*"); echo "$*"; }
ok()   { PASS=$((PASS+1)); log "  ✓ $*"; }
bad()  { FAIL=$((FAIL+1)); log "  ✗ $*"; }
step() { log ""; log "── $* ──"; }

remember() { printf '%s\t%s\n' "$1" "$2" >> "$TEST_IDS_FILE"; }

cleanup() {
  step "Cleanup — deleting every TEST_NAME_DUP_ artefact"
  local lines=()
  while IFS= read -r line; do
    [ -n "$line" ] && lines+=("$line")
  done < "$TEST_IDS_FILE"
  for ((i = ${#lines[@]} - 1; i >= 0; i--)); do
    local entry="${lines[i]}"
    local table="${entry%%$'\t'*}"
    local id="${entry#*$'\t'}"
    [ -z "$table" ] || [ -z "$id" ] && continue
    if $DB -c "DELETE FROM \"$table\" WHERE id = '$id';" >/dev/null 2>&1; then
      log "  · deleted from $table: $id"
    fi
  done
  rm -f "$TEST_IDS_FILE"
}
trap cleanup EXIT

# ─────────────────────────────────────────────────────────────────────
step "1. Provision admin + 2 doctors"

PASSWORD='TestNaming_2026!'
PW_HASH=$(docker compose -p oralign-app exec -T backend node -e \
  "const b=require('bcryptjs');b.hash(process.argv[1],12).then(h=>process.stdout.write(h))" \
  "$PASSWORD" 2>/dev/null | tr -d '\r')
[ -n "$PW_HASH" ] && ok "password hashed" || { bad "bcrypt failed"; exit 1; }

STAMP="$(date +%s%N | tail -c 10)"

EXISTING_SETTINGS=$($DB -c 'SELECT id FROM "CompanyBillingSettings" LIMIT 1;' | tr -d ' ')
if [ -z "$EXISTING_SETTINGS" ]; then
  SETTINGS_ID=$(db_insert "INSERT INTO \"CompanyBillingSettings\" (
    id, \"companyName\", \"defaultTvaRate\", \"defaultCurrency\",
    \"devisPrefix\", \"devisNextNumber\", \"isActive\",
    \"createdAt\", \"updatedAt\"
  ) VALUES (
    gen_random_uuid(), 'TEST_NAME_DUP_SETTINGS', 0, 'TND',
    'TST', 1, true, NOW(), NOW()
  ) RETURNING id;")
  remember "CompanyBillingSettings" "$SETTINGS_ID"
fi

mk_user() {
  local role="$1" tag="$2"
  # Email lowercased — the auth service normalises emails on lookup
  # but the inserted row stays as-stored, so a mismatched case would
  # silently 401 here even though the row exists.
  local email_local
  email_local=$(echo "$tag" | tr '[:upper:]' '[:lower:]')
  db_insert "INSERT INTO \"User\" (
    id, \"fullName\", email, \"passwordHash\", role, \"isActive\",
    \"isEmailVerified\", \"verificationStatus\", \"createdAt\", \"updatedAt\"
  ) VALUES (
    gen_random_uuid(), 'TEST_NAME_DUP_${tag}',
    'test_naming_${email_local}_${STAMP}@oralign.test', '$PW_HASH',
    '$role', true, true, 'approved', NOW(), NOW()
  ) RETURNING id;"
}

ADMIN_ID=$(mk_user admin ADMIN) && remember User "$ADMIN_ID" && ok "admin=$ADMIN_ID"
DOC_A_ID=$(mk_user dentist DOCTOR_A) && remember User "$DOC_A_ID" && ok "doctorA=$DOC_A_ID"
DOC_B_ID=$(mk_user dentist DOCTOR_B) && remember User "$DOC_B_ID" && ok "doctorB=$DOC_B_ID"

sign_in() {
  local email="$1"
  curl -sS -X POST "$API/auth/sign-in" -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$PASSWORD\"}" |
    node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).authToken.accessToken||'')}catch(e){}})"
}

ADMIN_TOKEN=$(sign_in "test_naming_admin_${STAMP}@oralign.test")
DOC_A_TOKEN=$(sign_in "test_naming_doctor_a_${STAMP}@oralign.test")
DOC_B_TOKEN=$(sign_in "test_naming_doctor_b_${STAMP}@oralign.test")
[ -n "$ADMIN_TOKEN" ] && [ -n "$DOC_A_TOKEN" ] && [ -n "$DOC_B_TOKEN" ] \
  && ok "all tokens minted" || { bad "sign-in failed"; exit 1; }

DOC_A_HDR=(-H "Authorization: Bearer $DOC_A_TOKEN")
DOC_B_HDR=(-H "Authorization: Bearer $DOC_B_TOKEN")
ADMIN_HDR=(-H "Authorization: Bearer $ADMIN_TOKEN")

# ─────────────────────────────────────────────────────────────────────
step "2. Doctor A adds patient 'Foulen Ben Foulen'"

PNAME="TEST_NAME_DUP_Foulen_Ben_Foulen"
RESP_A=$(curl -sS -X POST "$API/patients" "${DOC_A_HDR[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"fullName\":\"$PNAME\",\"phone\":\"+21622${STAMP: -7}\"}")
PATIENT_A_ID=$(echo "$RESP_A" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).id||'')}catch(e){}})")
[ -n "$PATIENT_A_ID" ] && remember Patient "$PATIENT_A_ID" && ok "patientA=$PATIENT_A_ID" || \
  { bad "create failed: $RESP_A"; exit 1; }

# ─────────────────────────────────────────────────────────────────────
step "3. NEGATIVE — Doctor A cannot add the same patient again (same fullName + phone)"

DUP_CODE=$(curl -sS -o /tmp/dup.json -w '%{http_code}' \
  -X POST "$API/patients" "${DOC_A_HDR[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"fullName\":\"$PNAME\",\"phone\":\"+21622${STAMP: -7}\"}")
DUP_MSG=$(cat /tmp/dup.json | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).message||'')}catch(e){}})")
if [ "$DUP_CODE" = "400" ] && echo "$DUP_MSG" | grep -q -i "already have"; then
  ok "duplicate rejected (HTTP $DUP_CODE) — '$DUP_MSG'"
else
  bad "expected 400 with 'already have' message, got HTTP=$DUP_CODE msg='$DUP_MSG'"
fi

# ─────────────────────────────────────────────────────────────────────
step "4. POSITIVE — Doctor B CAN add the same patient (cross-doctor allowed)"

RESP_B=$(curl -sS -X POST "$API/patients" "${DOC_B_HDR[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"fullName\":\"$PNAME\",\"phone\":\"+21622${STAMP: -7}\"}")
PATIENT_B_ID=$(echo "$RESP_B" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).id||'')}catch(e){}})")
[ -n "$PATIENT_B_ID" ] && remember Patient "$PATIENT_B_ID" && ok "doctorB owns the same human: $PATIENT_B_ID" || \
  bad "cross-doctor add failed: $RESP_B"

# ─────────────────────────────────────────────────────────────────────
step "5. Doctor A creates an order — order code starts with patient slug + date"

ORDER_RESP=$(curl -sS -X POST "$API/orders" "${DOC_A_HDR[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"patientId\":\"$PATIENT_A_ID\"}")
ORDER_ID=$(echo "$ORDER_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).id||'')}catch(e){}})")
ORDER_CODE=$(echo "$ORDER_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).orderCode||'')}catch(e){}})")
[ -n "$ORDER_ID" ] && remember DentalOrder "$ORDER_ID" && ok "order=$ORDER_ID code='$ORDER_CODE'" || \
  { bad "create failed: $ORDER_RESP"; exit 1; }

DATE_STAMP=$(date -u +%Y%m%d)
if echo "$ORDER_CODE" | grep -qE "^TEST_NAME_DUP_Foulen_Ben_Foulen_${DATE_STAMP}(-[0-9]+)?$"; then
  ok "order code matches '<PatientSlug>_YYYYMMDD[-NN]'"
else
  bad "order code '$ORDER_CODE' does not match expected pattern"
fi

# ─────────────────────────────────────────────────────────────────────
step "6. Same patient + same day → next order gets -02 counter"

ORDER2_RESP=$(curl -sS -X POST "$API/orders" "${DOC_A_HDR[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"patientId\":\"$PATIENT_A_ID\"}")
ORDER2_ID=$(echo "$ORDER2_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).id||'')}catch(e){}})")
ORDER2_CODE=$(echo "$ORDER2_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).orderCode||'')}catch(e){}})")
[ -n "$ORDER2_ID" ] && remember DentalOrder "$ORDER2_ID"
if echo "$ORDER2_CODE" | grep -qE "^TEST_NAME_DUP_Foulen_Ben_Foulen_${DATE_STAMP}-02$"; then
  ok "second order has -02 suffix: '$ORDER2_CODE'"
else
  bad "expected -02 suffix, got '$ORDER2_CODE'"
fi

# ─────────────────────────────────────────────────────────────────────
step "7. Admin creates a quotation + sends it → number is 'dv_<PatientSlug>_<Date>'"

QUOTE_RESP=$(curl -sS -X POST "$API/orders/$ORDER_ID/quotations" "${ADMIN_HDR[@]}" \
  -H "Content-Type: application/json" -d '{"language":"en"}')
QUOTE_ID=$(echo "$QUOTE_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).id||'')}catch(e){}})")
[ -n "$QUOTE_ID" ] && remember Quotation "$QUOTE_ID" && ok "quote=$QUOTE_ID" || \
  { bad "create failed: $QUOTE_RESP"; exit 1; }

SEND_CODE=$(curl -sS -X POST "$API/quotations/$QUOTE_ID/send" "${ADMIN_HDR[@]}" \
  -o /tmp/quote.json -w '%{http_code}')
QUOTE_NUM=$(cat /tmp/quote.json | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).quotationNumber||'')}catch(e){}})")
[ "$SEND_CODE" = "200" ] && ok "send returned 200" || bad "send HTTP $SEND_CODE"

if echo "$QUOTE_NUM" | grep -qE "^dv_TEST_NAME_DUP_Foulen_Ben_Foulen_${DATE_STAMP}(-[0-9]+)?$"; then
  ok "quote number matches 'dv_<PatientSlug>_YYYYMMDD[-NN]': '$QUOTE_NUM'"
else
  bad "quote number '$QUOTE_NUM' does not match expected format"
fi

# ─────────────────────────────────────────────────────────────────────
step "8. PDF generation succeeds + i18n labels say TVA"

PDF_CODE=$(curl -sS -X POST "$API/quotations/$QUOTE_ID/generate-pdf" "${ADMIN_HDR[@]}" \
  -o /dev/null -w '%{http_code}')
[ "$PDF_CODE" = "200" ] && ok "PDF generated (HTTP $PDF_CODE)" || bad "PDF gen HTTP $PDF_CODE"

# Walking the raw PDF byte stream wouldn't work — PDFKit deflates the
# content streams, so the literal "TVA" string isn't visible until you
# decompress them. We verify the same invariant a step earlier by
# inspecting the compiled i18n source inside the running container:
# if the EN block still mentions "VAT" we'd know the build is stale.
EN_BLOCK=$(docker compose -p oralign-app exec -T backend node -e "
  const m = require('/app/dist/src/quotations/services/quotation-i18n.js');
  const labels = m.getQuotationLabels('en');
  process.stdout.write(JSON.stringify({
    vatRate: labels.vatRate,
    vatAmount: labels.vatAmount,
    totalTtc: labels.totalTtc,
  }));
" 2>/dev/null)
if echo "$EN_BLOCK" | grep -q '"TVA"' && ! echo "$EN_BLOCK" | grep -qE '"V?AT' ; then
  ok "i18n EN labels use TVA (no stray VAT): $EN_BLOCK"
else
  bad "i18n EN labels look wrong: $EN_BLOCK"
fi

# ─────────────────────────────────────────────────────────────────────
step "Summary"
log "  Passed: $PASS"
log "  Failed: $FAIL"
[ "$FAIL" = "0" ] && log "  ✓ ALL CHECKS PASSED" || log "  ✗ Some checks failed"
