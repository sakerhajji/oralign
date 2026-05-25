#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# scripts/test-packs-payments.sh
#
# Isolated end-to-end test of the new Packs / Quotation-PaymentPlan /
# Payments surface. Exercises the full path:
#
#   admin → create pack + price
#   admin → attach pack to quote, configure installment plan
#   doctor → approve quote → order moves to payment_plan_selected
#   doctor → pay 1st installment by CARD (mock SUCCESS) → batch unlocks
#   admin  → deliver unlocked batch → batch DELIVERED
#   doctor → declare BANK_TRANSFER on 2nd installment (with proof file)
#   admin  → confirm bank-transfer → batch unlocks
#   admin  → record CASH on 3rd installment → batch unlocks
#   negative: locked batch refuses deliver
#   negative: plan with mismatched Σ amounts is rejected
#   idempotency: CARD with same Idempotency-Key returns same payment
#
# All artefacts are tagged TEST_PKPAY_* and torn down by the EXIT
# trap, so real data is never disturbed. Failures still trigger
# cleanup.
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
TMP_PROOF="$(mktemp --suffix=.png)"
printf '\x89PNG\r\n\x1a\n%s' "TEST_PKPAY_PROOF" > "$TMP_PROOF"
# Curl on Git-Bash is the mingw64 build — it speaks Windows paths only,
# so we translate /tmp/... to C:\... before passing it to `-F file=@...`.
if command -v cygpath >/dev/null 2>&1; then
  CURL_PROOF="$(cygpath -w "$TMP_PROOF")"
else
  CURL_PROOF="$TMP_PROOF"
fi

log()  { LOG+=("$*"); echo "$*"; }
ok()   { PASS=$((PASS+1)); log "  ✓ $*"; }
bad()  { FAIL=$((FAIL+1)); log "  ✗ $*"; }
step() { log ""; log "── $* ──"; }

remember() {
  printf '%s\t%s\n' "$1" "$2" >> "$TEST_IDS_FILE"
}

cleanup() {
  step "Cleanup — deleting every TEST_PKPAY_ artefact"
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
    else
      log "  · skipped (already gone) $table: $id"
    fi
  done
  rm -f "$TEST_IDS_FILE" "$TMP_PROOF"
}
trap cleanup EXIT

# ─────────────────────────────────────────────────────────────────────
step "1. Provision admin + doctor + patient + order"

# bcrypt the same password twice (admin + doctor share it).
PASSWORD='TestPkPay_2026!'
PW_HASH=$(docker compose -p oralign-app exec -T backend node -e \
  "const b=require('bcryptjs');b.hash(process.argv[1],12).then(h=>process.stdout.write(h))" \
  "$PASSWORD" 2>/dev/null | tr -d '\r')
if [ -z "$PW_HASH" ]; then
  bad "failed to bcrypt password"; exit 1
fi
ok "password hashed"

STAMP="$(date +%s%N | tail -c 10)"

# Ensure CompanyBillingSettings exists — the quote-create endpoint
# refuses to issue a quote without it. We only insert when missing,
# and tag the row for cleanup if WE created it.
EXISTING_SETTINGS=$($DB -c 'SELECT id FROM "CompanyBillingSettings" LIMIT 1;' | tr -d ' ')
if [ -z "$EXISTING_SETTINGS" ]; then
  SETTINGS_ID=$(db_insert "INSERT INTO \"CompanyBillingSettings\" (
    id, \"companyName\", \"defaultTvaRate\", \"defaultCurrency\",
    \"devisPrefix\", \"devisNextNumber\", \"isActive\",
    \"createdAt\", \"updatedAt\"
  ) VALUES (
    gen_random_uuid(), 'TEST_PKPAY_SETTINGS', 0, 'TND',
    'TST', 1, true, NOW(), NOW()
  ) RETURNING id;")
  remember "CompanyBillingSettings" "$SETTINGS_ID"
  ok "billing-settings created (test-only)"
else
  ok "billing-settings already present (reused)"
fi

ADMIN_ID=$(db_insert "INSERT INTO \"User\" (
  id, \"fullName\", email, \"passwordHash\", role, \"isActive\",
  \"isEmailVerified\", \"verificationStatus\", \"createdAt\", \"updatedAt\"
) VALUES (
  gen_random_uuid(),
  'TEST_PKPAY_ADMIN',
  'test_pkpay_admin_${STAMP}@oralign.test',
  '$PW_HASH', 'admin', true, true, 'approved', NOW(), NOW()
) RETURNING id;")
[ -n "$ADMIN_ID" ] && remember "User" "$ADMIN_ID" && ok "admin=$ADMIN_ID"

DOCTOR_ID=$(db_insert "INSERT INTO \"User\" (
  id, \"fullName\", email, \"passwordHash\", role, \"isActive\",
  \"isEmailVerified\", \"verificationStatus\", \"createdAt\", \"updatedAt\"
) VALUES (
  gen_random_uuid(),
  'TEST_PKPAY_DOCTOR',
  'test_pkpay_doctor_${STAMP}@oralign.test',
  '$PW_HASH', 'dentist', true, true, 'approved', NOW(), NOW()
) RETURNING id;")
[ -n "$DOCTOR_ID" ] && remember "User" "$DOCTOR_ID" && ok "doctor=$DOCTOR_ID"

PATIENT_ID=$(db_insert "INSERT INTO \"Patient\" (
  id, \"fullName\", \"doctorId\", \"createdAt\", \"updatedAt\"
) VALUES (
  gen_random_uuid(),
  'TEST_PKPAY_PATIENT',
  '$DOCTOR_ID', NOW(), NOW()
) RETURNING id;")
[ -n "$PATIENT_ID" ] && remember "Patient" "$PATIENT_ID" && ok "patient=$PATIENT_ID"

ORDER_ID=$(db_insert "INSERT INTO \"DentalOrder\" (
  id, \"orderCode\", \"doctorId\", \"patientId\", status,
  \"createdAt\", \"updatedAt\"
) VALUES (
  gen_random_uuid(),
  'TEST_PKPAY_ORDER_${STAMP}',
  '$DOCTOR_ID', '$PATIENT_ID', 'draft', NOW(), NOW()
) RETURNING id;")
[ -n "$ORDER_ID" ] && remember "DentalOrder" "$ORDER_ID" && ok "order=$ORDER_ID"

# ─────────────────────────────────────────────────────────────────────
step "2. Sign in admin + doctor"

ADMIN_TOKEN=$(curl -sS -X POST "$API/auth/sign-in" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test_pkpay_admin_${STAMP}@oralign.test\",\"password\":\"$PASSWORD\"}" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const o=JSON.parse(d);process.stdout.write((o.authToken&&o.authToken.accessToken)||o.accessToken||'')}catch(e){}})")
[ -n "$ADMIN_TOKEN" ] && ok "admin signed in" || { bad "admin sign-in"; exit 1; }

DOCTOR_TOKEN=$(curl -sS -X POST "$API/auth/sign-in" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test_pkpay_doctor_${STAMP}@oralign.test\",\"password\":\"$PASSWORD\"}" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const o=JSON.parse(d);process.stdout.write((o.authToken&&o.authToken.accessToken)||o.accessToken||'')}catch(e){}})")
[ -n "$DOCTOR_TOKEN" ] && ok "doctor signed in" || { bad "doctor sign-in"; exit 1; }

ADMIN_HDR=(-H "Authorization: Bearer $ADMIN_TOKEN")
DOCTOR_HDR=(-H "Authorization: Bearer $DOCTOR_TOKEN")

# ─────────────────────────────────────────────────────────────────────
step "2b. GET /admin/packs returns the canonical PaginatedResponse shape"

PACKS_RESP=$(curl -sS "$API/admin/packs?limit=100" "${ADMIN_HDR[@]}")
SHAPE_OK=$(echo "$PACKS_RESP" | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  try{
    const o=JSON.parse(d);
    const ok=Array.isArray(o.data)&&typeof o.total==='number'&&typeof o.page==='number'&&typeof o.limit==='number'&&typeof o.totalPages==='number';
    process.stdout.write(ok?'ok':'shape_bad:'+Object.keys(o).join(','));
  }catch(e){process.stdout.write('parse_err:'+e.message)}
})")
[ "$SHAPE_OK" = "ok" ] && ok "packs list returns {data,total,page,limit,totalPages}" || \
  bad "wrong shape — $SHAPE_OK"

# ─────────────────────────────────────────────────────────────────────
step "3. Admin creates a pack with active price"

PACK_RESP=$(curl -sS -X POST "$API/admin/packs" "${ADMIN_HDR[@]}" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"TEST_PKPAY_PACK",
    "description":"isolated test pack",
    "maxStepsPerArch":24,
    "includedCorrections":3,
    "isUnlimitedSteps":false,
    "isUnlimitedCorrections":false,
    "isForOrthodontists":false
  }')
PACK_ID=$(echo "$PACK_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).id||'')}catch(e){}})")
if [ -n "$PACK_ID" ]; then
  remember "Pack" "$PACK_ID"
  ok "pack=$PACK_ID"
else
  bad "pack create failed: $PACK_RESP"; exit 1
fi

# Active price for TWO_ARCHES = 900.000 TND.
PRICE_RESP=$(curl -sS -X POST "$API/admin/packs/$PACK_ID/prices" "${ADMIN_HDR[@]}" \
  -H "Content-Type: application/json" \
  -d '{"archType":"two_arches","price":900.000,"currency":"TND"}')
PRICE_ID=$(echo "$PRICE_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).id||'')}catch(e){}})")
if [ -n "$PRICE_ID" ]; then
  remember "PackPrice" "$PRICE_ID"
  ok "price=$PRICE_ID (900.000 TND)"
else
  bad "price create failed: $PRICE_RESP"; exit 1
fi

# ─────────────────────────────────────────────────────────────────────
step "4. Admin creates a draft quotation on the order"

QUOTE_RESP=$(curl -sS -X POST "$API/orders/$ORDER_ID/quotations" "${ADMIN_HDR[@]}" \
  -H "Content-Type: application/json" \
  -d '{"language":"fr"}')
QUOTE_ID=$(echo "$QUOTE_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).id||'')}catch(e){}})")
if [ -n "$QUOTE_ID" ]; then
  remember "Quotation" "$QUOTE_ID"
  ok "quotation=$QUOTE_ID"
else
  bad "quote create failed: $QUOTE_RESP"; exit 1
fi

# ─────────────────────────────────────────────────────────────────────
step "5. Admin attaches the pack (two_arches) to the quote"

ATTACH_RESP=$(curl -sS -X PATCH "$API/quotations/$QUOTE_ID/attach-pack" "${ADMIN_HDR[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"packId\":\"$PACK_ID\",\"archType\":\"two_arches\"}")
SNAP_PRICE=$(echo "$ATTACH_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const o=JSON.parse(d);process.stdout.write(String(o.totalPrice||''))}catch(e){}})")
if [ "$SNAP_PRICE" = "900" ] || [ "$SNAP_PRICE" = "900.000" ]; then
  ok "totalPrice snapshot = $SNAP_PRICE"
else
  bad "expected totalPrice=900, got $SNAP_PRICE — $ATTACH_RESP"
fi

# ─────────────────────────────────────────────────────────────────────
step "6. NEGATIVE — payment plan with mismatched Σ is rejected"

BAD_PLAN=$(curl -sS -o /dev/null -w '%{http_code}' \
  -X PUT "$API/quotations/$QUOTE_ID/payment-plan" "${ADMIN_HDR[@]}" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentMode":"installments",
    "installments":[
      {"amount":300.000,"batch":{"fromStep":1,"toStep":8}},
      {"amount":300.000,"batch":{"fromStep":9,"toStep":16}}
    ]
  }')
if [ "$BAD_PLAN" = "400" ]; then
  ok "Σ mismatch returned 400"
else
  bad "expected 400 got $BAD_PLAN"
fi

step "7. NEGATIVE — overlapping step ranges are rejected"

OVERLAP=$(curl -sS -o /dev/null -w '%{http_code}' \
  -X PUT "$API/quotations/$QUOTE_ID/payment-plan" "${ADMIN_HDR[@]}" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentMode":"installments",
    "installments":[
      {"amount":300.000,"batch":{"fromStep":1,"toStep":10}},
      {"amount":300.000,"batch":{"fromStep":8,"toStep":16}},
      {"amount":300.000,"batch":{"fromStep":17,"toStep":24}}
    ]
  }')
if [ "$OVERLAP" = "400" ]; then
  ok "overlap returned 400"
else
  bad "expected 400 got $OVERLAP"
fi

# ─────────────────────────────────────────────────────────────────────
step "8. Admin configures the valid 3-installment plan (300+300+300 = 900)"

PLAN_RESP=$(curl -sS -X PUT "$API/quotations/$QUOTE_ID/payment-plan" "${ADMIN_HDR[@]}" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentMode":"installments",
    "installments":[
      {"amount":300.000,"batch":{"fromStep":1,"toStep":8}},
      {"amount":300.000,"batch":{"fromStep":9,"toStep":16}},
      {"amount":300.000,"batch":{"fromStep":17,"toStep":24}}
    ]
  }')
PLAN_OK=$(echo "$PLAN_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).paymentMode||'')}catch(e){}})")
if [ "$PLAN_OK" = "installments" ]; then
  ok "plan configured (3 × 300)"
else
  bad "plan config failed: $PLAN_RESP"
fi

# Fetch installments + batches.
INSTALLMENTS=$(curl -sS "$API/quotations/$QUOTE_ID/installments" "${ADMIN_HDR[@]}")
INST_IDS=$(echo "$INSTALLMENTS" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const a=JSON.parse(d);process.stdout.write(a.map(r=>r.id).join(' '))}catch(e){}})")
read -ra IIDS <<< "$INST_IDS"
[ "${#IIDS[@]}" = "3" ] && ok "3 installments visible" || bad "expected 3 installments got ${#IIDS[@]}"

BATCHES=$(curl -sS "$API/quotations/$QUOTE_ID/step-batches" "${ADMIN_HDR[@]}")
BATCH_IDS=$(echo "$BATCHES" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const a=JSON.parse(d);process.stdout.write(a.map(r=>r.id).join(' '))}catch(e){}})")
read -ra BIDS <<< "$BATCH_IDS"
[ "${#BIDS[@]}" = "3" ] && ok "3 batches visible" || bad "expected 3 batches got ${#BIDS[@]}"

# ─────────────────────────────────────────────────────────────────────
step "9. Admin sends the quote, doctor approves it"

SEND=$(curl -sS -X POST "$API/quotations/$QUOTE_ID/send" "${ADMIN_HDR[@]}" \
  -o /dev/null -w '%{http_code}')
[ "$SEND" = "200" ] && ok "quote sent (HTTP $SEND)" || bad "send failed HTTP $SEND"

APPROVE=$(curl -sS -X POST "$API/quotations/$QUOTE_ID/approve" "${DOCTOR_HDR[@]}" \
  -o /dev/null -w '%{http_code}')
[ "$APPROVE" = "200" ] && ok "doctor approved (HTTP $APPROVE)" || bad "approve failed HTTP $APPROVE"

ORDER_STATUS=$($DB -c "SELECT status FROM \"DentalOrder\" WHERE id = '$ORDER_ID';" | tr -d ' ')
[ "$ORDER_STATUS" = "payment_plan_selected" ] && ok "order → payment_plan_selected" || \
  bad "expected order status payment_plan_selected, got '$ORDER_STATUS'"

# ─────────────────────────────────────────────────────────────────────
step "10. NEGATIVE — locked batch refuses deliver"

LOCKED_DELIVER=$(curl -sS -o /dev/null -w '%{http_code}' \
  -X POST "$API/quotations/$QUOTE_ID/step-batches/${BIDS[0]}/deliver" "${ADMIN_HDR[@]}")
[ "$LOCKED_DELIVER" = "400" ] && ok "locked batch refused deliver (HTTP 400)" || \
  bad "expected 400 got $LOCKED_DELIVER"

# ─────────────────────────────────────────────────────────────────────
step "11. Doctor pays installment #1 by CARD (mock SUCCESS)"

IDEMP_KEY="$(node -e 'process.stdout.write(require("crypto").randomUUID())')"
CARD_RESP=$(curl -sS -X POST "$API/quotations/$QUOTE_ID/installments/${IIDS[0]}/pay-by-card" \
  "${DOCTOR_HDR[@]}" \
  -H "Idempotency-Key: $IDEMP_KEY" \
  -H "X-Mock-Outcome: success" \
  -H "Content-Type: application/json" \
  -d '{}')
CARD_STATUS=$(echo "$CARD_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).status||'')}catch(e){}})")
CARD_PAY_ID=$(echo "$CARD_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).id||'')}catch(e){}})")
[ -n "$CARD_PAY_ID" ] && remember "Payment" "$CARD_PAY_ID"
[ "$CARD_STATUS" = "success" ] && ok "CARD payment=$CARD_PAY_ID status=success" || \
  bad "expected status=success got '$CARD_STATUS' — $CARD_RESP"

# Verify batch unlocked.
BATCH0_STATE=$($DB -c "SELECT status FROM \"QuoteStepBatch\" WHERE id = '${BIDS[0]}';" | tr -d ' ')
[ "$BATCH0_STATE" = "unlocked" ] && ok "batch[0] → unlocked" || bad "expected unlocked got '$BATCH0_STATE'"

INST0_STATE=$($DB -c "SELECT status FROM \"QuoteInstallment\" WHERE id = '${IIDS[0]}';" | tr -d ' ')
[ "$INST0_STATE" = "paid" ] && ok "installment[0] → paid" || bad "expected paid got '$INST0_STATE'"

# ─────────────────────────────────────────────────────────────────────
step "12. IDEMPOTENCY — replay CARD call with same Idempotency-Key"

REPLAY=$(curl -sS -X POST "$API/quotations/$QUOTE_ID/installments/${IIDS[0]}/pay-by-card" \
  "${DOCTOR_HDR[@]}" \
  -H "Idempotency-Key: $IDEMP_KEY" \
  -H "X-Mock-Outcome: success" \
  -H "Content-Type: application/json" \
  -d '{}')
REPLAY_ID=$(echo "$REPLAY" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).id||'')}catch(e){}})")
[ "$REPLAY_ID" = "$CARD_PAY_ID" ] && ok "replay returned same payment id" || \
  bad "replay returned different id '$REPLAY_ID' vs '$CARD_PAY_ID'"

# Sanity: only one Payment row exists for that installment.
PAY_COUNT=$($DB -c "SELECT count(*) FROM \"Payment\" WHERE \"installmentId\" = '${IIDS[0]}';" | tr -d ' ')
[ "$PAY_COUNT" = "1" ] && ok "only 1 Payment row on installment[0]" || \
  bad "expected 1 Payment row got $PAY_COUNT"

# ─────────────────────────────────────────────────────────────────────
step "13. Admin delivers the unlocked batch[0]"

DELIVER=$(curl -sS -X POST "$API/quotations/$QUOTE_ID/step-batches/${BIDS[0]}/deliver" \
  "${ADMIN_HDR[@]}" -o /dev/null -w '%{http_code}')
[ "$DELIVER" = "200" ] && ok "deliver returned 200" || bad "deliver failed HTTP $DELIVER"

BATCH0_NEW=$($DB -c "SELECT status FROM \"QuoteStepBatch\" WHERE id = '${BIDS[0]}';" | tr -d ' ')
[ "$BATCH0_NEW" = "delivered" ] && ok "batch[0] → delivered" || bad "expected delivered got '$BATCH0_NEW'"

# ─────────────────────────────────────────────────────────────────────
step "14. Doctor declares BANK_TRANSFER on installment #2"

BT_RESP=$(curl -sS -X POST "$API/quotations/$QUOTE_ID/installments/${IIDS[1]}/declare-bank-transfer" \
  "${DOCTOR_HDR[@]}" \
  -F "bankReference=TEST_PKPAY_REF_${STAMP}" \
  -F "proofFile=@${CURL_PROOF};type=image/png")
BT_PAY_ID=$(echo "$BT_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).id||'')}catch(e){}})")
BT_STATUS=$(echo "$BT_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).status||'')}catch(e){}})")
[ -n "$BT_PAY_ID" ] && remember "Payment" "$BT_PAY_ID"
[ "$BT_STATUS" = "awaiting_confirmation" ] && ok "BANK_TRANSFER awaiting_confirmation" || \
  bad "expected awaiting_confirmation got '$BT_STATUS' — $BT_RESP"

# Batch[1] is STILL locked until admin confirms.
BATCH1_STATE=$($DB -c "SELECT status FROM \"QuoteStepBatch\" WHERE id = '${BIDS[1]}';" | tr -d ' ')
[ "$BATCH1_STATE" = "locked" ] && ok "batch[1] still locked (correct)" || \
  bad "batch[1] should still be locked, got '$BATCH1_STATE'"

# ─────────────────────────────────────────────────────────────────────
step "14b. GET /admin/payments/pending-confirmations returns canonical shape"

PENDING_RESP=$(curl -sS "$API/admin/payments/pending-confirmations?limit=20" "${ADMIN_HDR[@]}")
PEND_SHAPE=$(echo "$PENDING_RESP" | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  try{
    const o=JSON.parse(d);
    const ok=Array.isArray(o.data)&&typeof o.total==='number'&&typeof o.page==='number'&&typeof o.limit==='number'&&typeof o.totalPages==='number';
    process.stdout.write(ok?'ok':'shape_bad:'+Object.keys(o).join(','));
  }catch(e){process.stdout.write('parse_err:'+e.message)}
})")
[ "$PEND_SHAPE" = "ok" ] && ok "pending list returns {data,total,page,limit,totalPages}" || \
  bad "wrong shape — $PEND_SHAPE"

# Confirm the BANK_TRANSFER we just declared is actually surfaced in the queue.
PEND_HAS_OUR_PAYMENT=$(echo "$PENDING_RESP" | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  try{
    const o=JSON.parse(d);
    process.stdout.write(o.data.some(p=>p.id==='$BT_PAY_ID')?'yes':'no');
  }catch(e){process.stdout.write('err')}
})")
[ "$PEND_HAS_OUR_PAYMENT" = "yes" ] && ok "declared BT payment visible in admin queue" || \
  bad "declared BT payment NOT visible in admin queue"

# ─────────────────────────────────────────────────────────────────────
step "15. Admin confirms the bank transfer"

CONFIRM=$(curl -sS -X POST "$API/admin/payments/$BT_PAY_ID/confirm" "${ADMIN_HDR[@]}" \
  -H "Content-Type: application/json" \
  -d '{"notes":"verified via test"}' \
  -o /dev/null -w '%{http_code}')
[ "$CONFIRM" = "200" ] && ok "confirm returned 200" || bad "confirm HTTP $CONFIRM"

BATCH1_NEW=$($DB -c "SELECT status FROM \"QuoteStepBatch\" WHERE id = '${BIDS[1]}';" | tr -d ' ')
[ "$BATCH1_NEW" = "unlocked" ] && ok "batch[1] → unlocked" || bad "expected unlocked got '$BATCH1_NEW'"

INST1_STATE=$($DB -c "SELECT status FROM \"QuoteInstallment\" WHERE id = '${IIDS[1]}';" | tr -d ' ')
[ "$INST1_STATE" = "paid" ] && ok "installment[1] → paid" || bad "expected paid got '$INST1_STATE'"

# ─────────────────────────────────────────────────────────────────────
step "16. Admin records CASH on installment #3"

CASH_RESP=$(curl -sS -X POST "$API/admin/quotations/$QUOTE_ID/installments/${IIDS[2]}/record-cash" \
  "${ADMIN_HDR[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"receiptNumber\":\"R-${STAMP}\",\"notes\":\"in person\"}")
CASH_PAY_ID=$(echo "$CASH_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).id||'')}catch(e){}})")
CASH_STATE=$(echo "$CASH_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).status||'')}catch(e){}})")
[ -n "$CASH_PAY_ID" ] && remember "Payment" "$CASH_PAY_ID"
[ "$CASH_STATE" = "success" ] && ok "CASH payment=$CASH_PAY_ID status=success" || \
  bad "expected status=success got '$CASH_STATE' — $CASH_RESP"

BATCH2_NEW=$($DB -c "SELECT status FROM \"QuoteStepBatch\" WHERE id = '${BIDS[2]}';" | tr -d ' ')
[ "$BATCH2_NEW" = "unlocked" ] && ok "batch[2] → unlocked" || bad "expected unlocked got '$BATCH2_NEW'"

INST2_STATE=$($DB -c "SELECT status FROM \"QuoteInstallment\" WHERE id = '${IIDS[2]}';" | tr -d ' ')
[ "$INST2_STATE" = "paid" ] && ok "installment[2] → paid" || bad "expected paid got '$INST2_STATE'"

# ─────────────────────────────────────────────────────────────────────
step "17. Order propagated to PAID after final installment"

ORDER_FINAL=$($DB -c "SELECT status FROM \"DentalOrder\" WHERE id = '$ORDER_ID';" | tr -d ' ')
[ "$ORDER_FINAL" = "paid" ] && ok "order status → paid" || \
  bad "expected order status paid, got '$ORDER_FINAL'"

QUOTE_FINAL=$($DB -c "SELECT \"paymentStatus\" FROM \"Quotation\" WHERE id = '$QUOTE_ID';" | tr -d ' ')
[ "$QUOTE_FINAL" = "paid" ] && ok "quote paymentStatus → paid" || \
  bad "expected quote paymentStatus paid, got '$QUOTE_FINAL'"

# ─────────────────────────────────────────────────────────────────────
step "Summary"
log "  Passed: $PASS"
log "  Failed: $FAIL"
if [ "$FAIL" = "0" ]; then
  log "  ✓ ALL CHECKS PASSED"
else
  log "  ✗ Some checks failed"
fi
