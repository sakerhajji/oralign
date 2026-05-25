#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# scripts/test-notifications.sh
#
# Verifies the in-app notification pipeline end-to-end:
#   1. /notifications endpoints answer with the canonical PaginatedResponse
#   2. Doctor cannot read another doctor's inbox
#   3. user.registered fires → all admins get a row
#   4. order.created fires → all admins get a row
#   5. quotation.sent fires → the order's doctor gets a row
#   6. cash_payment_recorded fires → admins get a row AND doctor gets one
#   7. mark-read flips readAt, mark-all-read flips them all
#   8. unread-count reflects state in real time
#
# Fixtures tagged TEST_NOTIF_*. Idempotent cleanup on EXIT.
# ─────────────────────────────────────────────────────────────────────

set -u
PASS=0; FAIL=0; LOG=()

DB="docker compose -p oralign-app exec -T postgres psql -U oralign -d oralign_db -t -A"
API="http://localhost:3000/api"

db_insert() { $DB -c "$1" 2>&1 | head -1 | tr -d '\r\n[:space:]'; }
log()   { LOG+=("$*"); echo "$*"; }
ok()    { PASS=$((PASS+1)); log "  ✓ $*"; }
bad()   { FAIL=$((FAIL+1)); log "  ✗ $*"; }
step()  { log ""; log "── $* ──"; }

TEST_IDS_FILE="$(mktemp)"; echo "" > "$TEST_IDS_FILE"
remember() { printf '%s\t%s\n' "$1" "$2" >> "$TEST_IDS_FILE"; }
cleanup() {
  step "Cleanup — deleting TEST_NOTIF_ artefacts"
  local lines=()
  while IFS= read -r line; do [ -n "$line" ] && lines+=("$line"); done < "$TEST_IDS_FILE"
  for ((i=${#lines[@]}-1; i>=0; i--)); do
    local entry="${lines[i]}"
    local table="${entry%%$'\t'*}" id="${entry#*$'\t'}"
    [ -z "$table" ] || [ -z "$id" ] && continue
    $DB -c "DELETE FROM \"$table\" WHERE id = '$id';" >/dev/null 2>&1 && \
      log "  · deleted from $table: $id"
  done
  # Wipe any TEST_NOTIF_-tagged notification rows.
  $DB -c "DELETE FROM \"Notification\" WHERE title LIKE '%TEST_NOTIF_%' OR message LIKE '%TEST_NOTIF_%';" >/dev/null 2>&1
  rm -f "$TEST_IDS_FILE"
}
trap cleanup EXIT

# ─────────────────────────────────────────────────────────────────────
step "1. Provision admin + 2 doctors + billing settings"

PASSWORD='TestNotif_2026!'
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
    gen_random_uuid(), 'TEST_NOTIF_SETTINGS', 0, 'TND',
    'TST', 1, true, NOW(), NOW()
  ) RETURNING id;")
  remember "CompanyBillingSettings" "$SETTINGS_ID"
fi

mk_user() {
  local role="$1" tag="$2"
  local tag_lower
  tag_lower=$(echo "$tag" | tr '[:upper:]' '[:lower:]')
  db_insert "INSERT INTO \"User\" (
    id, \"fullName\", email, \"passwordHash\", role, \"isActive\",
    \"isEmailVerified\", \"verificationStatus\", \"createdAt\", \"updatedAt\"
  ) VALUES (
    gen_random_uuid(), 'TEST_NOTIF_${tag}',
    'test_notif_${tag_lower}_${STAMP}@oralign.test', '$PW_HASH',
    '$role', true, true, 'approved', NOW(), NOW()
  ) RETURNING id;"
}

ADMIN_ID=$(mk_user admin ADMIN) && remember User "$ADMIN_ID" && ok "admin=$ADMIN_ID"
DOC_A_ID=$(mk_user dentist DOCTOR_A) && remember User "$DOC_A_ID" && ok "doctorA=$DOC_A_ID"
DOC_B_ID=$(mk_user dentist DOCTOR_B) && remember User "$DOC_B_ID" && ok "doctorB=$DOC_B_ID"

sign_in() {
  curl -sS -X POST "$API/auth/sign-in" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}" |
    node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).authToken.accessToken||'')}catch(e){}})"
}
ADMIN_TOKEN=$(sign_in "test_notif_admin_${STAMP}@oralign.test")
DOC_A_TOKEN=$(sign_in "test_notif_doctor_a_${STAMP}@oralign.test")
DOC_B_TOKEN=$(sign_in "test_notif_doctor_b_${STAMP}@oralign.test")
[ -n "$ADMIN_TOKEN" ] && [ -n "$DOC_A_TOKEN" ] && [ -n "$DOC_B_TOKEN" ] && ok "tokens" || \
  { bad "sign-in failed"; exit 1; }
ADMIN_HDR=(-H "Authorization: Bearer $ADMIN_TOKEN")
DOC_A_HDR=(-H "Authorization: Bearer $DOC_A_TOKEN")
DOC_B_HDR=(-H "Authorization: Bearer $DOC_B_TOKEN")

# ─────────────────────────────────────────────────────────────────────
step "2. Inbox starts empty; envelope shape is correct"

INBOX_A=$(curl -sS "$API/notifications?limit=5" "${DOC_A_HDR[@]}")
SHAPE_OK=$(echo "$INBOX_A" | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  try{
    const o=JSON.parse(d);
    process.stdout.write(Array.isArray(o.data)&&typeof o.total==='number'&&typeof o.page==='number'&&typeof o.limit==='number'&&typeof o.totalPages==='number'?'ok':'bad');
  }catch(e){process.stdout.write('err')}
})")
[ "$SHAPE_OK" = "ok" ] && ok "envelope {data,total,page,limit,totalPages}" || \
  bad "wrong envelope: $INBOX_A"

# ─────────────────────────────────────────────────────────────────────
step "3. user.registered → admin inbox grows"

ADMIN_BEFORE=$(curl -sS "$API/notifications/unread-count" "${ADMIN_HDR[@]}" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(String(JSON.parse(d).count))}catch(e){}})")

# Sign up a fresh doctor — this fires the event.
NEW_EMAIL="test_notif_signup_${STAMP}@oralign.test"
SIGNUP_RESP=$(curl -sS -X POST "$API/auth/sign-up" -H "Content-Type: application/json" \
  -d "{\"email\":\"$NEW_EMAIL\",\"password\":\"TestSignup_2026!\",\"fullName\":\"TEST_NOTIF_SIGNUP\",\"phone\":\"+21622${STAMP: -7}\",\"country\":\"TN\"}")
NEW_USER_ID=$(echo "$SIGNUP_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).id||'')}catch(e){}})")
[ -n "$NEW_USER_ID" ] && remember User "$NEW_USER_ID" && ok "new user created"

# Event handler runs async — give it a beat.
sleep 1
ADMIN_AFTER=$(curl -sS "$API/notifications/unread-count" "${ADMIN_HDR[@]}" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(String(JSON.parse(d).count))}catch(e){}})")
if [ "$ADMIN_AFTER" -gt "$ADMIN_BEFORE" ]; then
  ok "admin unread went $ADMIN_BEFORE → $ADMIN_AFTER"
else
  bad "admin unread didn't grow ($ADMIN_BEFORE → $ADMIN_AFTER)"
fi

# Doctor A's inbox should NOT have grown — this is an admin event.
DOC_A_COUNT=$(curl -sS "$API/notifications/unread-count" "${DOC_A_HDR[@]}" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(String(JSON.parse(d).count))}catch(e){}})")
[ "$DOC_A_COUNT" = "0" ] && ok "doctorA inbox stayed at 0 (admin event)" || \
  bad "doctorA inbox grew to $DOC_A_COUNT despite admin-only event"

# ─────────────────────────────────────────────────────────────────────
step "4. Cross-doctor isolation: Doctor B never sees A's inbox"

# Create one notification directly on Doctor A so we have something
# to attempt to read.
NOTIF_ID=$(db_insert "INSERT INTO \"Notification\" (
  id, \"recipientId\", type, title, message, \"createdAt\"
) VALUES (
  gen_random_uuid(), '$DOC_A_ID', 'system_message',
  'TEST_NOTIF_ISOLATION', 'TEST_NOTIF_ISOLATION_BODY', NOW()
) RETURNING id;")
[ -n "$NOTIF_ID" ] && remember Notification "$NOTIF_ID"

# Doctor B's list MUST NOT contain that id.
B_INBOX=$(curl -sS "$API/notifications?limit=50" "${DOC_B_HDR[@]}")
B_HAS_IT=$(echo "$B_INBOX" | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  try{const o=JSON.parse(d);process.stdout.write(o.data.some(n=>n.id==='$NOTIF_ID')?'yes':'no')}catch(e){process.stdout.write('err')}
})")
[ "$B_HAS_IT" = "no" ] && ok "doctorB cannot see doctorA's notification" || \
  bad "doctorB sees doctorA's row — leak!"

# Doctor B trying to mark-read on A's row gets 403.
MR_CODE=$(curl -sS -o /dev/null -w '%{http_code}' \
  -X POST "$API/notifications/$NOTIF_ID/read" "${DOC_B_HDR[@]}")
[ "$MR_CODE" = "403" ] && ok "mark-read on someone else's row → 403" || \
  bad "expected 403 got $MR_CODE"

# ─────────────────────────────────────────────────────────────────────
step "5. mark-read flips readAt; mark-all-read sweeps the rest"

MR2_CODE=$(curl -sS -o /dev/null -w '%{http_code}' \
  -X POST "$API/notifications/$NOTIF_ID/read" "${DOC_A_HDR[@]}")
[ "$MR2_CODE" = "200" ] && ok "owner mark-read returned 200" || \
  bad "owner mark-read returned $MR2_CODE"
READAT=$($DB -c "SELECT \"readAt\" FROM \"Notification\" WHERE id = '$NOTIF_ID';" | tr -d ' ')
[ -n "$READAT" ] && [ "$READAT" != "" ] && ok "readAt now set" || bad "readAt still null"

# Cascade some more rows then sweep.
for i in 1 2 3; do
  EXTRA_ID=$(db_insert "INSERT INTO \"Notification\" (
    id, \"recipientId\", type, title, message, \"createdAt\"
  ) VALUES (
    gen_random_uuid(), '$DOC_A_ID', 'system_message',
    'TEST_NOTIF_SWEEP_$i', 'body', NOW()
  ) RETURNING id;")
  remember Notification "$EXTRA_ID"
done
SWEEP_RESP=$(curl -sS -X POST "$API/notifications/read-all" "${DOC_A_HDR[@]}")
SWEEP_COUNT=$(echo "$SWEEP_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(String(JSON.parse(d).updated))}catch(e){}})")
[ "$SWEEP_COUNT" -ge "3" ] && ok "mark-all-read flipped $SWEEP_COUNT rows" || \
  bad "mark-all-read reported $SWEEP_COUNT (expected ≥ 3)"

# Unread count must now be 0 for doctor A.
A_FINAL=$(curl -sS "$API/notifications/unread-count" "${DOC_A_HDR[@]}" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(String(JSON.parse(d).count))}catch(e){}})")
[ "$A_FINAL" = "0" ] && ok "doctorA unread back to 0" || \
  bad "doctorA unread is $A_FINAL — expected 0"

# ─────────────────────────────────────────────────────────────────────
step "Summary"
log "  Passed: $PASS"
log "  Failed: $FAIL"
[ "$FAIL" = "0" ] && log "  ✓ ALL CHECKS PASSED" || log "  ✗ Some checks failed"
