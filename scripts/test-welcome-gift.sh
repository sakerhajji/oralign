#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# scripts/test-welcome-gift.sh — integration test for the welcome gift
# (once per practitioner, on the next case they submit) over the real API:
#   • GET /welcome-gift banner state (live amounts, eligibility, firstCase)
#   • first submitted CBCT case → treatment fee + the ORDER's CBCT
#     snapshot waived, frozen on the order (firstCase=true), audited, and
#     the doctor marked (User.welcomeGiftUsedAt = welcomeGiftAppliedAt)
#   • the gift is consumed: status not eligible, second case pays
#   • fee engine refuses the gift order (pay / ClicToPay session) with
#     WELCOME_GIFT_NOTHING_DUE; the treatment-plan gate lets it through
#   • switch off → no gift; switched back on, that doctor (no mark) gets
#     it on the next case; a doctor with an earlier (even archived) case
#     and no mark gets it on the new case (firstCase=false), old cases
#     untouched; a marked doctor is never eligible; an admin submitting
#     for the doctor → gift
#   • the gift never changes hands: an admin cannot move a gift order to
#     another doctor (WELCOME_GIFT_ORDER_REASSIGN), and an archived gift
#     order cannot be purged (DELETION_BLOCKED) — it stays consumed
#
# Follows the TEST_-data pattern of scripts/test-cbct-chunked.sh:
# throwaway rows tagged TEST_WG, cleaned up on exit; the billing
# settings row is restored to its original values.
#
# Run from the repo root with the dev stack up:
#   bash scripts/test-welcome-gift.sh
# ─────────────────────────────────────────────────────────────────
set -uo pipefail

API="http://127.0.0.1:3000/api"
DB() { docker compose -p oralign-app exec -T postgres psql -U oralign -d oralign_db -tA "$@"; }
TMP_DIR="$(mktemp -d)"
TEST_IDS_FILE="$TMP_DIR/ids.tsv"
ORDER_DIRS_FILE="$TMP_DIR/order-dirs.txt"
: > "$TEST_IDS_FILE"
: > "$ORDER_DIRS_FILE"

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✔ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✘ $1"; }
step(){ echo; echo "── $1"; }

db_insert() { DB -c "$1" | head -n1 | tr -d ' \r'; }
remember() { printf '%s\t%s\n' "$1" "$2" >> "$TEST_IDS_FILE"; }

SETTINGS_ID=""; ORIG_WG=""; ORIG_FEE=""; ORIG_CBCT_ENABLED=""; ORIG_CBCT_FEE=""
cleanup() {
  step "Cleanup"
  # Restore the billing settings to their pre-test values.
  if [ -n "$SETTINGS_ID" ] && [ -n "$ORIG_WG" ]; then
    DB -c "UPDATE \"CompanyBillingSettings\" SET \"welcomeGiftEnabled\"='$ORIG_WG', \"defaultTreatmentFee\"='$ORIG_FEE', \"cbctSupplementEnabled\"='$ORIG_CBCT_ENABLED', \"cbctSupplementFee\"='$ORIG_CBCT_FEE' WHERE id='$SETTINGS_ID';" >/dev/null 2>&1 \
      && echo "  · billing settings restored"
  fi
  # Upload directories are named by order UUID. Guarded + quoted: an
  # empty id would expand to the whole /app/uploads/orders tree.
  while IFS= read -r oid; do
    [ -n "$oid" ] || continue
    docker compose -p oralign-app exec -T backend sh -c "rm -rf '/app/uploads/orders/$oid'" >/dev/null 2>&1 || true
  done < "$ORDER_DIRS_FILE"
  local lines=()
  while IFS= read -r line; do [ -n "$line" ] && lines+=("$line"); done < "$TEST_IDS_FILE"
  for ((i = ${#lines[@]} - 1; i >= 0; i--)); do
    local table="${lines[i]%%$'\t'*}"; local id="${lines[i]#*$'\t'}"
    [ -z "$table" ] || [ -z "$id" ] && continue
    # A gift order must never get a card attempt; if a regression created
    # one anyway, drop it first (Payment → DentalOrder is Restrict).
    if [ "$table" = "DentalOrder" ]; then
      DB -c "DELETE FROM \"Payment\" WHERE \"orderId\" = '$id';" >/dev/null 2>&1
    fi
    DB -c "DELETE FROM \"$table\" WHERE id = '$id';" >/dev/null 2>&1 && echo "  · deleted $table $id"
  done
  rm -rf "$TMP_DIR"
  echo
  echo "RESULT: $PASS passed, $FAIL failed"
}
trap cleanup EXIT

# ─────────────────────────────────────────────────────────────────
step "1. Seed admin + doctors + patients"

PASSWORD='TestWg_2026!'
PW_HASH=$(docker compose -p oralign-app exec -T backend node -e \
  "const b=require('bcryptjs');b.hash(process.argv[1],12).then(h=>process.stdout.write(h))" \
  "$PASSWORD" 2>/dev/null | tr -d '\r')
[ -n "$PW_HASH" ] && ok "password hashed" || { bad "bcrypt failed"; exit 1; }

STAMP="$(date +%s%N | tail -c 10)"

SETTINGS_ID=$(DB -c 'SELECT id FROM "CompanyBillingSettings" WHERE "isActive"=true ORDER BY "updatedAt" DESC LIMIT 1;' | tr -d ' \r')
if [ -z "$SETTINGS_ID" ]; then
  SETTINGS_ID=$(db_insert "INSERT INTO \"CompanyBillingSettings\" (id, \"companyName\", \"defaultTvaRate\", \"defaultCurrency\", \"devisPrefix\", \"devisNextNumber\", \"isActive\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'TEST_WG_SETTINGS', 0, 'TND', 'TST', 1, true, NOW(), NOW()) RETURNING id;")
  remember "CompanyBillingSettings" "$SETTINGS_ID"
fi
read -r ORIG_WG ORIG_FEE ORIG_CBCT_ENABLED ORIG_CBCT_FEE < <(DB -c "SELECT \"welcomeGiftEnabled\", \"defaultTreatmentFee\", \"cbctSupplementEnabled\", \"cbctSupplementFee\" FROM \"CompanyBillingSettings\" WHERE id='$SETTINGS_ID';" | tr '|' ' ')
ok "settings=$SETTINGS_ID (orig gift/fee/cbct: $ORIG_WG/$ORIG_FEE/$ORIG_CBCT_ENABLED/$ORIG_CBCT_FEE)"

seed_user() { # role name email
  db_insert "INSERT INTO \"User\" (id, \"fullName\", email, \"passwordHash\", role, \"isActive\", \"isEmailVerified\", \"verificationStatus\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), '$2', '$3', '$PW_HASH', '$1', true, true, 'approved', NOW(), NOW()) RETURNING id;"
}
seed_patient() { # doctorId name
  db_insert "INSERT INTO \"Patient\" (id, \"fullName\", \"doctorId\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), '$2', '$1', NOW(), NOW()) RETURNING id;"
}
ADMIN_ID=$(seed_user admin TEST_WG_ADMIN "test_wg_admin_${STAMP}@oralign.test");     remember "User" "$ADMIN_ID"; ok "admin"
DOC_A_ID=$(seed_user dentist TEST_WG_DOC_A "test_wg_doca_${STAMP}@oralign.test");    remember "User" "$DOC_A_ID"; ok "doctor A (gift path)"
DOC_B_ID=$(seed_user dentist TEST_WG_DOC_B "test_wg_docb_${STAMP}@oralign.test");    remember "User" "$DOC_B_ID"; ok "doctor B (switch off)"
DOC_C_ID=$(seed_user dentist TEST_WG_DOC_C "test_wg_docc_${STAMP}@oralign.test");    remember "User" "$DOC_C_ID"; ok "doctor C (earlier case)"
DOC_D_ID=$(seed_user dentist TEST_WG_DOC_D "test_wg_docd_${STAMP}@oralign.test");    remember "User" "$DOC_D_ID"; ok "doctor D (admin submits)"
DOC_E_ID=$(seed_user dentist TEST_WG_DOC_E "test_wg_doce_${STAMP}@oralign.test");    remember "User" "$DOC_E_ID"; ok "doctor E (marked, no gift order)"

PAT_A_ID=$(seed_patient "$DOC_A_ID" TEST_WG_PATIENT_A); remember "Patient" "$PAT_A_ID"
PAT_B_ID=$(seed_patient "$DOC_B_ID" TEST_WG_PATIENT_B); remember "Patient" "$PAT_B_ID"
PAT_C_ID=$(seed_patient "$DOC_C_ID" TEST_WG_PATIENT_C); remember "Patient" "$PAT_C_ID"
PAT_D_ID=$(seed_patient "$DOC_D_ID" TEST_WG_PATIENT_D); remember "Patient" "$PAT_D_ID"
PAT_E_ID=$(seed_patient "$DOC_E_ID" TEST_WG_PATIENT_E); remember "Patient" "$PAT_E_ID"
[ -n "$PAT_A_ID" ] && [ -n "$PAT_B_ID" ] && [ -n "$PAT_C_ID" ] && [ -n "$PAT_D_ID" ] && [ -n "$PAT_E_ID" ] && ok "5 patients" || bad "patient seed failed"

# Doctor C already had a case: submitted, then archived (soft-deleted).
# It makes C a current practitioner (firstCase=false) but never blocks
# the gift: only the doctor mark does.
OLD_C_ID=$(db_insert "INSERT INTO \"DentalOrder\" (id, \"orderCode\", \"doctorId\", \"patientId\", status, \"submittedAt\", \"deletedAt\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'TESTWG_OLD_${STAMP}', '$DOC_C_ID', '$PAT_C_ID', 'submitted', NOW() - INTERVAL '30 days', NOW() - INTERVAL '1 day', NOW() - INTERVAL '30 days', NOW()) RETURNING id;")
remember "DentalOrder" "$OLD_C_ID"; ok "doctor C earlier (archived) case=$OLD_C_ID"

# Doctor E carries the doctor mark but no gift order (the mark alone must
# keep them out).
DB -c "UPDATE \"User\" SET \"welcomeGiftUsedAt\" = NOW() - INTERVAL '10 days' WHERE id='$DOC_E_ID';" >/dev/null
E_MARK=$(DB -c "SELECT COALESCE(\"welcomeGiftUsedAt\"::text, '') FROM \"User\" WHERE id='$DOC_E_ID';" | tr -d ' \r')
[ -n "$E_MARK" ] && ok "doctor E marked by SQL ($E_MARK)" || bad "doctor E mark seed failed"

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
ADMIN_TOKEN=$(signin "test_wg_admin_${STAMP}@oralign.test")
DOC_A_TOKEN=$(signin "test_wg_doca_${STAMP}@oralign.test")
DOC_B_TOKEN=$(signin "test_wg_docb_${STAMP}@oralign.test")
DOC_C_TOKEN=$(signin "test_wg_docc_${STAMP}@oralign.test")
DOC_D_TOKEN=$(signin "test_wg_docd_${STAMP}@oralign.test")
DOC_E_TOKEN=$(signin "test_wg_doce_${STAMP}@oralign.test")
[ -n "$ADMIN_TOKEN" ] && [ -n "$DOC_A_TOKEN" ] && [ -n "$DOC_B_TOKEN" ] && [ -n "$DOC_C_TOKEN" ] && [ -n "$DOC_D_TOKEN" ] && [ -n "$DOC_E_TOKEN" ] \
  && ok "6 sign-ins" || { bad "sign-in failed"; exit 1; }
AH="Authorization: Bearer $ADMIN_TOKEN"
AAH="Authorization: Bearer $DOC_A_TOKEN"; BBH="Authorization: Bearer $DOC_B_TOKEN"
CCH="Authorization: Bearer $DOC_C_TOKEN"; DDH="Authorization: Bearer $DOC_D_TOKEN"
EEH="Authorization: Bearer $DOC_E_TOKEN"
json() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);const p=process.argv[1].split(".");let v=j;for(const k of p){v=v?.[k]}process.stdout.write(v===undefined||v===null?"":String(v))}catch{process.stdout.write("")}})' "$1"; }

# ── helpers ──────────────────────────────────────────────────────
settings() { # $1 = JSON body for the admin settings PUT
  curl -sS -X PUT "$API/admin/company-billing-settings" -H "$AH" -H "Content-Type: application/json" -d "$1"
}
status_of() { # $1 = doctor auth header
  curl -sS "$API/welcome-gift" -H "$1"
}
new_order() { # $1 = auth header, $2 = JSON body ; echoes the order JSON
  local resp oid
  resp=$(curl -sS -X POST "$API/orders" -H "$1" -H "Content-Type: application/json" -d "$2")
  oid=$(echo "$resp" | json id)
  if [ -n "$oid" ]; then remember "DentalOrder" "$oid"; echo "$oid" >> "$ORDER_DIRS_FILE"; fi
  echo "$resp"
}
upload_dcm() { # $1 = auth header, $2 = order id — a tiny real DICOM (DICM preamble)
  head -c 128 /dev/zero > "$TMP_DIR/scan0001.dcm"
  printf 'DICM' >> "$TMP_DIR/scan0001.dcm"
  head -c 512 /dev/urandom >> "$TMP_DIR/scan0001.dcm"
  curl -sS -o "$TMP_DIR/upload.json" -w '%{http_code}' -X POST "$API/orders/$2/files?category=other" \
    -H "$1" -F "files=@$TMP_DIR/scan0001.dcm"
}
submit() { # $1 = auth header, $2 = order id — echoes the HTTP status, body in submit.json
  curl -sS -o "$TMP_DIR/submit.json" -w '%{http_code}' -X POST "$API/orders/$2/submit" \
    -H "$1" -H "Content-Type: application/json" -d '{"termsAccepted":true}'
}
accepted() { [ "$1" = "200" ] || [ "$1" = "201" ]; }
gift_col() { # $1 = order id — the welcomeGiftAppliedAt column, '' when NULL
  DB -c "SELECT COALESCE(\"welcomeGiftAppliedAt\"::text, '') FROM \"DentalOrder\" WHERE id='$1';" | tr -d ' \r'
}
mark_of() { # $1 = user id — the doctor mark User.welcomeGiftUsedAt, '' when NULL
  DB -c "SELECT COALESCE(\"welcomeGiftUsedAt\"::text, '') FROM \"User\" WHERE id='$1';" | tr -d ' \r'
}
mark_is_gift() { # $1 = user id, $2 = order id — 't' when the mark is the order's welcomeGiftAppliedAt
  DB -c "SELECT (u.\"welcomeGiftUsedAt\" = o.\"welcomeGiftAppliedAt\") FROM \"User\" u, \"DentalOrder\" o WHERE u.id='$1' AND o.id='$2';" | tr -d ' \r'
}

# ─────────────────────────────────────────────────────────────────
step "3. Configure: gift on, fee 300, CBCT supplement 50"

S=$(settings '{"welcomeGiftEnabled":true,"defaultTreatmentFee":300,"cbctSupplementEnabled":true,"cbctSupplementFee":50}')
[ "$(echo "$S" | json welcomeGiftEnabled)" = "true" ] && [ "$(echo "$S" | json defaultTreatmentFee)" = "300" ] \
  && ok "admin settings expose welcomeGiftEnabled=true, fee=300" || bad "settings PUT: $(echo "$S" | head -c 300)"
G=$(curl -sS "$API/admin/company-billing-settings" -H "$AH")
[ "$(echo "$G" | json welcomeGiftEnabled)" = "true" ] && ok "admin GET returns welcomeGiftEnabled" || bad "admin GET: $(echo "$G" | head -c 200)"

# ─────────────────────────────────────────────────────────────────
step "4. Banner status — a brand-new doctor"

ST=$(status_of "$AAH")
[ "$(echo "$ST" | json enabled)" = "true" ] && [ "$(echo "$ST" | json eligible)" = "true" ] \
  && ok "doctor A: enabled + eligible" || bad "doctor A status: $ST"
[ "$(echo "$ST" | json treatmentFee)" = "300" ] && [ "$(echo "$ST" | json cbctFee)" = "50" ] \
  && [ "$(echo "$ST" | json cbctOffered)" = "true" ] && [ "$(echo "$ST" | json total)" = "350" ] \
  && [ "$(echo "$ST" | json currency)" = "TND" ] && [ -z "$(echo "$ST" | json giftOrderId)" ] \
  && ok "live amounts 300 + 50 = 350 TND, no gift order yet" || bad "amounts: $ST"
[ "$(echo "$ST" | json firstCase)" = "true" ] && [ -z "$(mark_of "$DOC_A_ID")" ] \
  && ok "doctor A: firstCase=true, no mark yet" || bad "doctor A firstCase/mark: $ST"
CODE=$(curl -sS -o /dev/null -w '%{http_code}' "$API/welcome-gift" -H "$AH")
[ "$CODE" = "403" ] && ok "admin cannot read the doctor banner endpoint (403)" || bad "admin GET /welcome-gift: $CODE"

# ─────────────────────────────────────────────────────────────────
step "5. First case (CBCT) → gift with the ORDER's snapshot amounts"

O1=$(new_order "$AAH" "{\"patientId\":\"$PAT_A_ID\",\"useCbctWithScans\":true}")
O1_ID=$(echo "$O1" | json id)
[ "$(echo "$O1" | json cbctFeeAmount)" = "50" ] && ok "draft snapshots CBCT 50" || bad "no CBCT snapshot: $(echo "$O1" | head -c 200)"
CODE=$(upload_dcm "$AAH" "$O1_ID")
accepted "$CODE" && ok "tiny .dcm uploaded through the file endpoint ($CODE)" || bad "dcm upload: $CODE $(head -c 200 "$TMP_DIR/upload.json")"

# The live supplement moves to 80 AFTER the draft was priced: the gift must
# waive what the ORDER says (50), never the live value.
settings '{"cbctSupplementFee":80}' >/dev/null
CODE=$(submit "$AAH" "$O1_ID")
R=$(cat "$TMP_DIR/submit.json")
accepted "$CODE" && ok "first case submitted ($CODE)" || bad "submit: $CODE $(echo "$R" | head -c 300)"
[ -n "$(echo "$R" | json welcomeGift.appliedAt)" ] && ok "response carries welcomeGift" || bad "no welcomeGift in response: $(echo "$R" | head -c 300)"
[ "$(echo "$R" | json welcomeGift.firstCase)" = "true" ] && ok "welcomeGift.firstCase=true (brand-new doctor)" || bad "firstCase: $(echo "$R" | head -c 300)"
[ "$(echo "$R" | json welcomeGift.treatmentFee)" = "300" ] && [ "$(echo "$R" | json welcomeGift.cbctFee)" = "50" ] \
  && [ "$(echo "$R" | json welcomeGift.total)" = "350" ] && [ "$(echo "$R" | json welcomeGift.currency)" = "TND" ] \
  && ok "gift = 300 + 50 (snapshot, not live 80) = 350 TND" || bad "gift amounts: $(echo "$R" | json welcomeGift)"
[ -z "$(echo "$R" | json treatmentFeePaidAt)" ] && [ -z "$(echo "$R" | json treatmentFeeAmount)" ] \
  && ok "no payment recorded (stays out of revenue/receipts)" || bad "payment columns set on the gift order"
[ -n "$(gift_col "$O1_ID")" ] && ok "welcomeGiftAppliedAt stamped in DB" || bad "DB column empty"
FC=$(DB -c "SELECT \"welcomeGiftFirstCase\" FROM \"DentalOrder\" WHERE id='$O1_ID';" | tr -d ' \r')
[ "$FC" = "t" ] && ok "welcomeGiftFirstCase=true in DB" || bad "welcomeGiftFirstCase: $FC"
[ -n "$(mark_of "$DOC_A_ID")" ] && [ "$(mark_is_gift "$DOC_A_ID" "$O1_ID")" = "t" ] \
  && ok "doctor A marked: User.welcomeGiftUsedAt = the order's welcomeGiftAppliedAt" || bad "doctor A mark: '$(mark_of "$DOC_A_ID")'"
AUD=$(DB -c "SELECT COUNT(*) FROM \"OrderAuditLog\" WHERE \"orderId\"='$O1_ID' AND action='welcome_gift_applied';" | tr -d ' \r')
[ "$AUD" = "1" ] && ok "one welcome_gift_applied audit row" || bad "audit rows: $AUD"
AUDFC=$(DB -c "SELECT metadata->>'firstCase' FROM \"OrderAuditLog\" WHERE \"orderId\"='$O1_ID' AND action='welcome_gift_applied';" | tr -d ' \r')
[ "$AUDFC" = "true" ] && ok "audit metadata firstCase=true" || bad "audit firstCase: $AUDFC"
D1=$(curl -sS "$API/orders/$O1_ID" -H "$AAH")
[ "$(echo "$D1" | json welcomeGift.total)" = "350" ] && ok "detail endpoint carries the gift" || bad "detail: $(echo "$D1" | json welcomeGift)"
settings '{"cbctSupplementFee":50}' >/dev/null

# ─────────────────────────────────────────────────────────────────
step "6. Gift consumed"

ST=$(status_of "$AAH")
[ "$(echo "$ST" | json eligible)" = "false" ] && [ "$(echo "$ST" | json giftOrderId)" = "$O1_ID" ] \
  && ok "doctor A no longer eligible, giftOrderId=$O1_ID" || bad "status after gift: $ST"

# ─────────────────────────────────────────────────────────────────
step "7. Fee engine refuses the gift order"

CODE=$(curl -sS -o "$TMP_DIR/pay.json" -w '%{http_code}' -X POST "$API/orders/$O1_ID/treatment-fee/pay" \
  -H "$AAH" -H "Content-Type: application/json" -d '{"method":"bank_transfer"}')
[ "$CODE" = "400" ] && grep -q 'WELCOME_GIFT_NOTHING_DUE' "$TMP_DIR/pay.json" \
  && ok "doctor bank-transfer declare → 400 WELCOME_GIFT_NOTHING_DUE" || bad "doctor pay: $CODE $(head -c 200 "$TMP_DIR/pay.json")"
CODE=$(curl -sS -o "$TMP_DIR/pay.json" -w '%{http_code}' -X POST "$API/orders/$O1_ID/treatment-fee/pay" \
  -H "$AH" -H "Content-Type: application/json" -d '{"method":"cash"}')
[ "$CODE" = "400" ] && grep -q 'WELCOME_GIFT_NOTHING_DUE' "$TMP_DIR/pay.json" \
  && ok "admin cash → 400 WELCOME_GIFT_NOTHING_DUE" || bad "admin cash: $CODE $(head -c 200 "$TMP_DIR/pay.json")"
CODE=$(curl -sS -o "$TMP_DIR/ctp.json" -w '%{http_code}' -X POST "$API/payments/clictopay/session" \
  -H "$AAH" -H "Content-Type: application/json" -H "Idempotency-Key: wg-${STAMP}" \
  -d "{\"orderId\":\"$O1_ID\",\"purpose\":\"treatment_fee\"}")
[ "$CODE" = "400" ] && grep -q 'WELCOME_GIFT_NOTHING_DUE' "$TMP_DIR/ctp.json" \
  && ok "ClicToPay session → 400 WELCOME_GIFT_NOTHING_DUE" || bad "ClicToPay: $CODE $(head -c 200 "$TMP_DIR/ctp.json")"
PAYS=$(DB -c "SELECT COUNT(*) FROM \"Payment\" WHERE \"orderId\"='$O1_ID';" | tr -d ' \r')
[ "$PAYS" = "0" ] && ok "no Payment row for the gift order" || bad "payment rows: $PAYS"
PAID=$(DB -c "SELECT COALESCE(\"treatmentFeePaidAt\"::text,'')||'|'||COALESCE(\"treatmentFeePaymentMethod\"::text,'') FROM \"DentalOrder\" WHERE id='$O1_ID';" | tr -d ' \r')
[ "$PAID" = "|" ] && ok "treatment-fee columns still empty" || bad "fee columns: $PAID"

# ─────────────────────────────────────────────────────────────────
step "8. Treatment-plan gate accepts the gift order without payment"

TP=$(curl -sS -o "$TMP_DIR/plan.json" -w '%{http_code}' -X POST "$API/orders/$O1_ID/treatment-plans" \
  -H "$AH" -H "Content-Type: application/json" -d '{"name":"TEST_WG plan"}')
PLAN_ID=$(json id < "$TMP_DIR/plan.json")
[ -n "$PLAN_ID" ] && remember "TreatmentPlan" "$PLAN_ID"
accepted "$TP" && [ -n "$PLAN_ID" ] && ok "admin created a plan on the unpaid gift order ($TP)" \
  || bad "plan creation: $TP $(head -c 200 "$TMP_DIR/plan.json")"

# ─────────────────────────────────────────────────────────────────
step "9. Second case of the same doctor pays normally"

O2=$(new_order "$AAH" "{\"patientId\":\"$PAT_A_ID\"}")
O2_ID=$(echo "$O2" | json id)
CODE=$(submit "$AAH" "$O2_ID")
R=$(cat "$TMP_DIR/submit.json")
accepted "$CODE" && ok "second case submitted ($CODE)" || bad "submit 2: $CODE $(echo "$R" | head -c 200)"
[ -z "$(echo "$R" | json welcomeGift)" ] && [ -z "$(gift_col "$O2_ID")" ] \
  && ok "no gift on the second case" || bad "second case got a gift: $(echo "$R" | json welcomeGift)"
ST=$(status_of "$AAH")
[ "$(echo "$ST" | json giftOrderId)" = "$O1_ID" ] && ok "gift still points at the first case" || bad "status: $ST"

# ─────────────────────────────────────────────────────────────────
step "10. Switch off → no gift; back on → that doctor (no mark) gets it on the next case"

S=$(settings '{"welcomeGiftEnabled":false}')
[ "$(echo "$S" | json welcomeGiftEnabled)" = "false" ] && ok "switch turned off" || bad "switch off: $(echo "$S" | head -c 200)"
ST=$(status_of "$BBH")
[ "$(echo "$ST" | json enabled)" = "false" ] && [ "$(echo "$ST" | json eligible)" = "false" ] \
  && ok "doctor B: disabled, not eligible" || bad "doctor B status: $ST"
OB=$(new_order "$BBH" "{\"patientId\":\"$PAT_B_ID\"}")
OB_ID=$(echo "$OB" | json id)
CODE=$(submit "$BBH" "$OB_ID")
R=$(cat "$TMP_DIR/submit.json")
accepted "$CODE" && [ -z "$(echo "$R" | json welcomeGift)" ] && [ -z "$(gift_col "$OB_ID")" ] \
  && ok "doctor B's first case submitted WITHOUT gift" || bad "doctor B submit: $CODE $(echo "$R" | json welcomeGift)"
[ -z "$(mark_of "$DOC_B_ID")" ] && ok "doctor B not marked (no gift while off)" || bad "doctor B marked while off: $(mark_of "$DOC_B_ID")"
settings '{"welcomeGiftEnabled":true}' >/dev/null
ST=$(status_of "$BBH")
[ "$(echo "$ST" | json enabled)" = "true" ] && [ "$(echo "$ST" | json eligible)" = "true" ] && [ "$(echo "$ST" | json firstCase)" = "false" ] \
  && ok "switch back on: doctor B eligible again (no mark), firstCase=false" || bad "doctor B after switch on: $ST"
OB2=$(new_order "$BBH" "{\"patientId\":\"$PAT_B_ID\"}")
OB2_ID=$(echo "$OB2" | json id)
CODE=$(submit "$BBH" "$OB2_ID")
R=$(cat "$TMP_DIR/submit.json")
accepted "$CODE" && [ "$(echo "$R" | json welcomeGift.total)" = "300" ] && [ "$(echo "$R" | json welcomeGift.firstCase)" = "false" ] \
  && ok "doctor B's next case gets the gift: 300 TND, firstCase=false" || bad "doctor B next case: $CODE $(echo "$R" | head -c 300)"
[ -z "$(gift_col "$OB_ID")" ] && ok "the case submitted while off is left as is (nothing retroactive)" || bad "doctor B's earlier case got a gift"
[ "$(mark_is_gift "$DOC_B_ID" "$OB2_ID")" = "t" ] && ok "doctor B marked with the gift's instant" || bad "doctor B mark: '$(mark_of "$DOC_B_ID")'"
ST=$(status_of "$BBH")
[ "$(echo "$ST" | json eligible)" = "false" ] && [ "$(echo "$ST" | json giftOrderId)" = "$OB2_ID" ] \
  && ok "doctor B's gift consumed" || bad "doctor B after gift: $ST"

# ─────────────────────────────────────────────────────────────────
step "11. A doctor with an earlier submitted (archived) case and no mark → gift on the new case"

ST=$(status_of "$CCH")
[ "$(echo "$ST" | json enabled)" = "true" ] && [ "$(echo "$ST" | json eligible)" = "true" ] && [ "$(echo "$ST" | json firstCase)" = "false" ] \
  && ok "doctor C eligible, firstCase=false (earlier archived case)" || bad "doctor C status: $ST"
OC=$(new_order "$CCH" "{\"patientId\":\"$PAT_C_ID\"}")
OC_ID=$(echo "$OC" | json id)
CODE=$(submit "$CCH" "$OC_ID")
R=$(cat "$TMP_DIR/submit.json")
accepted "$CODE" && [ "$(echo "$R" | json welcomeGift.total)" = "300" ] && [ "$(echo "$R" | json welcomeGift.firstCase)" = "false" ] && [ -n "$(gift_col "$OC_ID")" ] \
  && ok "doctor C's new case gets the gift: 300 TND, firstCase=false" || bad "doctor C submit: $CODE $(echo "$R" | head -c 300)"
[ -z "$(gift_col "$OLD_C_ID")" ] && ok "the earlier archived case is left as is" || bad "doctor C's earlier case got a gift"
FC=$(DB -c "SELECT \"welcomeGiftFirstCase\" FROM \"DentalOrder\" WHERE id='$OC_ID';" | tr -d ' \r')
[ "$FC" = "f" ] && ok "welcomeGiftFirstCase=false in DB" || bad "welcomeGiftFirstCase: $FC"
AUDFC=$(DB -c "SELECT metadata->>'firstCase' FROM \"OrderAuditLog\" WHERE \"orderId\"='$OC_ID' AND action='welcome_gift_applied';" | tr -d ' \r')
[ "$AUDFC" = "false" ] && ok "audit metadata firstCase=false" || bad "audit firstCase: $AUDFC"
[ "$(mark_is_gift "$DOC_C_ID" "$OC_ID")" = "t" ] && ok "doctor C marked with the gift's instant" || bad "doctor C mark: '$(mark_of "$DOC_C_ID")'"
ST=$(status_of "$CCH")
[ "$(echo "$ST" | json eligible)" = "false" ] && [ "$(echo "$ST" | json giftOrderId)" = "$OC_ID" ] \
  && ok "doctor C's gift consumed" || bad "doctor C after gift: $ST"

# ─────────────────────────────────────────────────────────────────
step "12. An admin submitting the doctor's first case → gift"

ST=$(status_of "$DDH")
[ "$(echo "$ST" | json eligible)" = "true" ] && [ "$(echo "$ST" | json firstCase)" = "true" ] \
  && ok "doctor D eligible, firstCase=true" || bad "doctor D status: $ST"
OD=$(new_order "$AH" "{\"patientId\":\"$PAT_D_ID\",\"doctorId\":\"$DOC_D_ID\"}")
OD_ID=$(echo "$OD" | json id)
CODE=$(submit "$AH" "$OD_ID")
R=$(cat "$TMP_DIR/submit.json")
accepted "$CODE" && [ "$(echo "$R" | json welcomeGift.total)" = "300" ] && [ "$(echo "$R" | json welcomeGift.cbctFee)" = "0" ] \
  && ok "admin-submitted first case: 300 TND waived, no CBCT" || bad "admin submit: $CODE $(echo "$R" | json welcomeGift)"
[ "$(echo "$R" | json welcomeGift.firstCase)" = "true" ] && [ "$(mark_is_gift "$DOC_D_ID" "$OD_ID")" = "t" ] \
  && ok "firstCase=true, and the DOCTOR (not the admin) is marked" || bad "doctor D firstCase/mark: $(echo "$R" | head -c 300) / '$(mark_of "$DOC_D_ID")'"
[ -z "$(mark_of "$ADMIN_ID")" ] && ok "the admin who submitted is not marked" || bad "admin marked: $(mark_of "$ADMIN_ID")"
ACTOR=$(DB -c "SELECT \"actorRole\" FROM \"OrderAuditLog\" WHERE \"orderId\"='$OD_ID' AND action='welcome_gift_applied';" | tr -d ' \r')
[ "$ACTOR" = "admin" ] && ok "audit row records the admin as actor" || bad "audit actor: $ACTOR"
ST=$(status_of "$DDH")
[ "$(echo "$ST" | json eligible)" = "false" ] && [ "$(echo "$ST" | json giftOrderId)" = "$OD_ID" ] \
  && ok "doctor D's gift consumed" || bad "doctor D after: $ST"

# ─────────────────────────────────────────────────────────────────
step "13. The gift never changes hands (reassign / purge)"

CODE=$(curl -sS -o "$TMP_DIR/move.json" -w '%{http_code}' -X PUT "$API/orders/$OD_ID" \
  -H "$AH" -H "Content-Type: application/json" -d "{\"doctorId\":\"$DOC_B_ID\"}")
[ "$CODE" = "400" ] && grep -q 'WELCOME_GIFT_ORDER_REASSIGN' "$TMP_DIR/move.json" \
  && ok "admin moving the gift order to doctor B → 400 WELCOME_GIFT_ORDER_REASSIGN" || bad "reassign: $CODE $(head -c 200 "$TMP_DIR/move.json")"
OWNER=$(DB -c "SELECT \"doctorId\" FROM \"DentalOrder\" WHERE id='$OD_ID';" | tr -d ' \r')
[ "$OWNER" = "$DOC_D_ID" ] && ok "gift order still belongs to doctor D" || bad "doctorId now: $OWNER"
CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE "$API/orders/$OD_ID" -H "$AH")
accepted "$CODE" && ok "gift order archived ($CODE)" || bad "archive: $CODE"
CODE=$(curl -sS -o "$TMP_DIR/purge.json" -w '%{http_code}' -X DELETE "$API/orders/$OD_ID/permanent" -H "$AH")
[ "$CODE" = "409" ] && grep -q 'DELETION_BLOCKED' "$TMP_DIR/purge.json" && grep -q 'welcome gift' "$TMP_DIR/purge.json" \
  && ok "permanent delete of the archived gift order → 409 DELETION_BLOCKED (welcome gift)" || bad "purge: $CODE $(head -c 200 "$TMP_DIR/purge.json")"
CODE=$(curl -sS -o "$TMP_DIR/purge.json" -w '%{http_code}' -X POST "$API/orders/bulk-permanent-delete" \
  -H "$AH" -H "Content-Type: application/json" -d "{\"ids\":[\"$OD_ID\"]}")
accepted "$CODE" && [ "$(json blocked < "$TMP_DIR/purge.json")" = "1" ] && [ "$(json deleted < "$TMP_DIR/purge.json")" = "0" ] \
  && ok "bulk permanent delete counts it as blocked" || bad "bulk purge: $CODE $(head -c 200 "$TMP_DIR/purge.json")"
[ -n "$(gift_col "$OD_ID")" ] && ok "gift row kept (archived, not purged)" || bad "gift row gone"
ST=$(status_of "$DDH")
[ "$(echo "$ST" | json eligible)" = "false" ] && [ "$(echo "$ST" | json giftOrderId)" = "$OD_ID" ] \
  && ok "doctor D stays not eligible after the archive" || bad "doctor D after archive: $ST"
[ -n "$(mark_of "$DOC_D_ID")" ] && ok "doctor D's mark kept after the archive" || bad "doctor D mark cleared"

# ─────────────────────────────────────────────────────────────────
step "14. A doctor with the mark is never eligible (even without a gift order)"

ST=$(status_of "$EEH")
[ "$(echo "$ST" | json enabled)" = "true" ] && [ "$(echo "$ST" | json eligible)" = "false" ] && [ -z "$(echo "$ST" | json giftOrderId)" ] \
  && ok "doctor E (marked, no gift order): not eligible" || bad "doctor E status: $ST"
OE=$(new_order "$EEH" "{\"patientId\":\"$PAT_E_ID\"}")
OE_ID=$(echo "$OE" | json id)
CODE=$(submit "$EEH" "$OE_ID")
R=$(cat "$TMP_DIR/submit.json")
accepted "$CODE" && [ -z "$(echo "$R" | json welcomeGift)" ] && [ -z "$(gift_col "$OE_ID")" ] \
  && ok "doctor E's case submitted WITHOUT gift" || bad "doctor E submit: $CODE $(echo "$R" | head -c 300)"
[ "$(mark_of "$DOC_E_ID")" = "$E_MARK" ] && ok "doctor E's mark untouched" || bad "doctor E mark changed: $(mark_of "$DOC_E_ID")"
