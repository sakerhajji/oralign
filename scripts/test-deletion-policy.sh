#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# scripts/test-deletion-policy.sh
#
# Deletion-architecture regression suite. Proves, against the running
# stack, that NO normal action can destroy clinical / financial history:
#
#   soft delete   → deletedAt set, hidden from normal lists, children intact
#   restore       → deletedAt cleared, visible again
#   permanent     → trash-first; 409 DELETION_BLOCKED while a quotation /
#                   payment / treatment plan / order / patient depends on
#                   the row; dependencies untouched afterwards
#   permissions   → dentist cannot restore / permanently delete
#   DB backstop   → raw DELETE of a doctor / patient / order with history
#                   is refused by Postgres (ON DELETE RESTRICT)
#   SetNull       → hard-deleting a STAFF account keeps the plans, quotes
#                   and messages it authored, with the name snapshot
#   allowed purge → an archived order with no history is hard-deleted
#                   with its files (rows + blobs)
#   quote cancel  → refused with 409 once a payment record exists
#
# All artefacts are tagged TEST_DELPOL_* and torn down by the EXIT trap
# in reverse insertion order (children first — cascades are no longer
# relied upon, which is the whole point).
# ─────────────────────────────────────────────────────────────────────

set -u
PASS=0
FAIL=0
LOG=()

DB="docker compose -p oralign-app exec -T postgres psql -U oralign -d oralign_db -t -A"
API="http://127.0.0.1:3000/api"

db_insert() { $DB -c "$1" 2>&1 | head -1 | tr -d '\r\n[:space:]'; }
db_val()    { $DB -c "$1" 2>/dev/null | head -1 | tr -d '\r\n[:space:]'; }

TEST_IDS_FILE="$(mktemp)"; echo "" > "$TEST_IDS_FILE"

log()  { LOG+=("$*"); echo "$*"; }
ok()   { PASS=$((PASS+1)); log "  ✓ $*"; }
bad()  { FAIL=$((FAIL+1)); log "  ✗ $*"; }
step() { log ""; log "── $* ──"; }
remember() { printf '%s\t%s\n' "$1" "$2" >> "$TEST_IDS_FILE"; }

cleanup() {
  step "Cleanup — deleting every TEST_DELPOL_ artefact (children first)"
  local lines=()
  while IFS= read -r line; do [ -n "$line" ] && lines+=("$line"); done < "$TEST_IDS_FILE"
  for ((i = ${#lines[@]} - 1; i >= 0; i--)); do
    local entry="${lines[i]}"; local table="${entry%%$'\t'*}"; local id="${entry#*$'\t'}"
    [ -z "$table" ] || [ -z "$id" ] && continue
    if $DB -c "DELETE FROM \"$table\" WHERE id = '$id';" >/dev/null 2>&1; then
      log "  · deleted from $table: $id"
    else
      log "  · skipped (already gone / blocked) $table: $id"
    fi
  done
  docker compose -p oralign-app exec -T backend sh -c 'rm -rf /app/uploads/orders/TESTDELPOL* 2>/dev/null' >/dev/null 2>&1 || true
  # Remove ONLY the one seeded order directory, and only when the id is
  # non-empty: an unset variable inside the container would expand to
  # /app/uploads/orders/ and wipe every order's uploads.
  if [ -n "${ORDER_B:-}" ]; then
    docker compose -p oralign-app exec -T backend sh -c "rm -rf '/app/uploads/orders/$ORDER_B'" >/dev/null 2>&1 || true
  fi
  rm -f "$TEST_IDS_FILE"
}
trap cleanup EXIT

# JSON helpers
jget() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const o=JSON.parse(d);const v=$1;process.stdout.write(v==null?'':String(v))}catch(e){}})"; }
# curl returning "STATUS BODY"
req() { # method url token [data]
  local m="$1" u="$2" t="$3" d="${4:-}"
  if [ -n "$d" ]; then
    curl -sS -o /tmp/delpol_body -w '%{http_code}' -X "$m" "$u" -H "Authorization: Bearer $t" -H "Content-Type: application/json" -d "$d"
  else
    curl -sS -o /tmp/delpol_body -w '%{http_code}' -X "$m" "$u" -H "Authorization: Bearer $t"
  fi
}
body() { cat /tmp/delpol_body; }

# ─────────────────────────────────────────────────────────────────────
step "1. Provision admin + designer + doctor + patient + orders"

PASSWORD='TestDelPol_2026!'
PW_HASH=$(docker compose -p oralign-app exec -T backend node -e \
  "const b=require('bcryptjs');b.hash(process.argv[1],12).then(h=>process.stdout.write(h))" \
  "$PASSWORD" 2>/dev/null | tr -d '\r')
[ -n "$PW_HASH" ] && ok "password hashed" || { bad "bcrypt failed"; exit 1; }
STAMP="$(date +%s%N | tail -c 10)"

mkuser() { # role fullName -> id
  db_insert "INSERT INTO \"User\" (id, \"fullName\", email, \"passwordHash\", role, \"isActive\", \"isEmailVerified\", \"verificationStatus\", \"createdAt\", \"updatedAt\")
    VALUES (gen_random_uuid(), '$2', 'test_delpol_${1}_${STAMP}@oralign.test', '$PW_HASH', '$1', true, true, 'approved', NOW(), NOW()) RETURNING id;"
}
ADMIN_ID=$(mkuser admin TEST_DELPOL_ADMIN);       remember User "$ADMIN_ID";     ok "admin=$ADMIN_ID"
STAFF_ID=$(mkuser designer TEST_DELPOL_STAFF);    remember User "$STAFF_ID";     ok "designer(staff)=$STAFF_ID"
DOCTOR_ID=$(mkuser dentist TEST_DELPOL_DOCTOR);   remember User "$DOCTOR_ID";    ok "doctor=$DOCTOR_ID"

PATIENT_ID=$(db_insert "INSERT INTO \"Patient\" (id, \"fullName\", \"doctorId\", \"createdAt\", \"updatedAt\")
  VALUES (gen_random_uuid(), 'TEST_DELPOL_PATIENT', '$DOCTOR_ID', NOW(), NOW()) RETURNING id;")
remember Patient "$PATIENT_ID"; ok "patient=$PATIENT_ID"

# ORDER A: full history (quotation + installment + payment + treatment plan + message)
ORDER_A=$(db_insert "INSERT INTO \"DentalOrder\" (id, \"orderCode\", \"doctorId\", \"patientId\", status, \"assignedDesignerId\", \"createdAt\", \"updatedAt\")
  VALUES (gen_random_uuid(), 'TEST_DELPOL_A_${STAMP}', '$DOCTOR_ID', '$PATIENT_ID', 'quotation_sent', '$STAFF_ID', NOW(), NOW()) RETURNING id;")
remember DentalOrder "$ORDER_A"; ok "order A (with history)=$ORDER_A"

QUOTE_ID=$(db_insert "INSERT INTO \"Quotation\" (id, \"orderId\", status, \"createdById\", \"createdByName\", \"createdAt\", \"updatedAt\")
  VALUES (gen_random_uuid(), '$ORDER_A', 'sent', '$STAFF_ID', 'TEST_DELPOL_STAFF', NOW(), NOW()) RETURNING id;")
remember Quotation "$QUOTE_ID"; ok "quotation=$QUOTE_ID (created by staff)"

INST_ID=$(db_insert "INSERT INTO \"QuoteInstallment\" (id, \"quotationId\", \"installmentNumber\", amount, \"availableFrom\", \"createdAt\", \"updatedAt\")
  VALUES (gen_random_uuid(), '$QUOTE_ID', 1, 100, NOW(), NOW(), NOW()) RETURNING id;")
remember QuoteInstallment "$INST_ID"; ok "installment=$INST_ID"

PAY_ID=$(db_insert "INSERT INTO \"Payment\" (id, \"orderId\", \"quotationId\", \"installmentId\", amount, status, \"paymentMethod\", \"createdAt\", \"updatedAt\")
  VALUES (gen_random_uuid(), '$ORDER_A', '$QUOTE_ID', '$INST_ID', 100, 'success', 'card', NOW(), NOW()) RETURNING id;")
remember Payment "$PAY_ID"; ok "payment(success)=$PAY_ID"

PLAN_ID=$(db_insert "INSERT INTO \"TreatmentPlan\" (id, \"orderId\", version, name, status, \"createdById\", \"createdByName\", \"createdAt\", \"updatedAt\")
  VALUES (gen_random_uuid(), '$ORDER_A', 1, 'TEST_DELPOL_PLAN', 'ready', '$STAFF_ID', 'TEST_DELPOL_STAFF', NOW(), NOW()) RETURNING id;")
remember TreatmentPlan "$PLAN_ID"; ok "treatment plan=$PLAN_ID (created by staff)"

MSG_ID=$(db_insert "INSERT INTO \"TreatmentMessage\" (id, \"treatmentPlanId\", \"senderId\", \"senderName\", \"senderRole\", message, type, \"createdAt\")
  VALUES (gen_random_uuid(), '$PLAN_ID', '$STAFF_ID', 'TEST_DELPOL_STAFF', 'designer', 'hello from staff', 'message', NOW()) RETURNING id;")
remember TreatmentMessage "$MSG_ID"; ok "treatment message=$MSG_ID (sent by staff)"

# ORDER B: eligible for purge (no history) + one file on disk
ORDER_B=$(db_insert "INSERT INTO \"DentalOrder\" (id, \"orderCode\", \"doctorId\", \"patientId\", status, \"createdAt\", \"updatedAt\")
  VALUES (gen_random_uuid(), 'TEST_DELPOL_B_${STAMP}', '$DOCTOR_ID', '$PATIENT_ID', 'draft', NOW(), NOW()) RETURNING id;")
remember DentalOrder "$ORDER_B"; ok "order B (no history)=$ORDER_B"

# Seed under the REAL order directory so the purge-the-whole-dir check
# below is meaningful (the order dir is what permanentDelete removes).
REL="orders/${ORDER_B}/other/blob.txt"
docker compose -p oralign-app exec -T backend sh -c "mkdir -p /app/uploads/orders/${ORDER_B}/other && echo hi > /app/uploads/${REL} && echo hi > /app/uploads/orders/${ORDER_B}/other/blob__thumb.webp"
FILE_ID=$(db_insert "INSERT INTO \"OrderFile\" (id, \"orderId\", category, \"originalName\", \"fileName\", \"relativePath\", \"mimeType\", size, variants, \"createdAt\")
  VALUES (gen_random_uuid(), '$ORDER_B', 'other', 'blob.txt', 'blob.txt', '$REL', 'text/plain', 3, '{\"thumb\":{\"path\":\"orders/${ORDER_B}/other/blob__thumb.webp\",\"format\":\"webp\",\"sizeBytes\":3}}'::jsonb, NOW()) RETURNING id;")
remember OrderFile "$FILE_ID"; ok "order B file=$FILE_ID (+ variant on disk)"

# ─────────────────────────────────────────────────────────────────────
step "2. Sign in"
signin() { curl -sS -X POST "$API/auth/sign-in" -H "Content-Type: application/json" -d "{\"email\":\"test_delpol_${1}_${STAMP}@oralign.test\",\"password\":\"$PASSWORD\"}" | jget "o.authToken&&o.authToken.accessToken"; }
ADMIN_TOKEN=$(signin admin);   [ -n "$ADMIN_TOKEN" ]  && ok "admin signed in"  || { bad "admin sign-in"; exit 1; }
DOCTOR_TOKEN=$(signin dentist); [ -n "$DOCTOR_TOKEN" ] && ok "doctor signed in" || { bad "doctor sign-in"; exit 1; }

# ─────────────────────────────────────────────────────────────────────
step "3. Soft delete keeps history + hides from normal reads"
S=$(req DELETE "$API/orders/$ORDER_A" "$ADMIN_TOKEN"); [ "$S" = "200" ] && ok "soft delete order A → 200" || bad "soft delete order A → $S $(body)"
[ -n "$(db_val "SELECT \"deletedAt\" FROM \"DentalOrder\" WHERE id='$ORDER_A' AND \"deletedAt\" IS NOT NULL")" ] && ok "order A has deletedAt" || bad "order A deletedAt not set"
[ "$(db_val "SELECT count(*) FROM \"Payment\" WHERE id='$PAY_ID'")" = "1" ] && ok "payment still exists after soft delete" || bad "payment vanished on soft delete"
[ "$(db_val "SELECT count(*) FROM \"Quotation\" WHERE id='$QUOTE_ID'")" = "1" ] && ok "quotation still exists" || bad "quotation vanished"
[ "$(db_val "SELECT count(*) FROM \"TreatmentPlan\" WHERE id='$PLAN_ID'")" = "1" ] && ok "treatment plan still exists" || bad "plan vanished"
S=$(req GET "$API/orders/$ORDER_A" "$DOCTOR_TOKEN"); [ "$S" = "404" ] && ok "doctor GET archived order → 404 (hidden)" || bad "archived order visible → $S"
S=$(req GET "$API/orders?includeDeleted=true&limit=50" "$ADMIN_TOKEN"); echo "$(body)" | grep -q "$ORDER_A" && ok "admin trash view lists order A" || bad "trash view missing order A"
S=$(req GET "$API/orders?limit=50" "$ADMIN_TOKEN"); echo "$(body)" | grep -q "$ORDER_A" && bad "live list still shows archived order" || ok "live list hides archived order"

step "4. Permanent delete is refused while history exists (409 DELETION_BLOCKED)"
S=$(req DELETE "$API/orders/$ORDER_A/permanent" "$ADMIN_TOKEN")
[ "$S" = "409" ] && ok "permanent delete order A → 409" || bad "permanent delete order A → $S $(body)"
echo "$(body)" | grep -q "DELETION_BLOCKED" && ok "errorCode DELETION_BLOCKED present" || bad "errorCode missing: $(body)"
echo "$(body)" | grep -q "quotation" && ok "message names the blocking dependency" || bad "message: $(body)"
[ "$(db_val "SELECT count(*) FROM \"Payment\" WHERE id='$PAY_ID'")" = "1" ] && ok "payment untouched after refused purge" || bad "payment lost"
S=$(req POST "$API/orders/bulk-permanent-delete" "$ADMIN_TOKEN" "{\"ids\":[\"$ORDER_A\"]}")
echo "$(body)" | grep -q '"blocked":1' && ok "bulk permanent reports blocked=1" || bad "bulk permanent: $S $(body)"
[ "$(db_val "SELECT count(*) FROM \"DentalOrder\" WHERE id='$ORDER_A'")" = "1" ] && ok "order A still present after bulk" || bad "order A destroyed by bulk"

step "5. Restore"
S=$(req POST "$API/orders/$ORDER_A/restore" "$DOCTOR_TOKEN"); [ "$S" = "403" ] && ok "doctor restore → 403" || bad "doctor restore → $S"
S=$(req POST "$API/orders/$ORDER_A/restore" "$ADMIN_TOKEN"); [ "$S" = "200" ] && ok "admin restore → 200" || bad "restore → $S $(body)"
[ -z "$(db_val "SELECT \"deletedAt\" FROM \"DentalOrder\" WHERE id='$ORDER_A' AND \"deletedAt\" IS NOT NULL")" ] && ok "deletedAt cleared" || bad "deletedAt still set"
S=$(req GET "$API/orders/$ORDER_A" "$DOCTOR_TOKEN"); [ "$S" = "200" ] && ok "doctor sees order A again" || bad "doctor GET after restore → $S"

step "6. Trash-first + permissions"
S=$(req DELETE "$API/orders/$ORDER_B/permanent" "$ADMIN_TOKEN"); [ "$S" = "400" ] && ok "purge of a LIVE order → 400 NOT_ARCHIVED" || bad "purge live order → $S $(body)"
S=$(req DELETE "$API/orders/$ORDER_B/permanent" "$DOCTOR_TOKEN"); [ "$S" = "403" ] && ok "doctor permanent delete → 403" || bad "doctor permanent → $S"
S=$(req DELETE "$API/patients/$PATIENT_ID" "$DOCTOR_TOKEN"); [ "$S" = "409" ] && ok "archiving a patient with active orders → 409" || bad "patient soft delete with orders → $S $(body)"

step "7. Patient / user permanent delete blocked by history"
S=$(req DELETE "$API/patients/$PATIENT_ID/permanent" "$ADMIN_TOKEN"); [ "$S" = "400" ] && ok "purge live patient → 400 NOT_ARCHIVED" || bad "purge live patient → $S"
$DB -c "UPDATE \"Patient\" SET \"deletedAt\"=NOW() WHERE id='$PATIENT_ID';" >/dev/null
S=$(req DELETE "$API/patients/$PATIENT_ID/permanent" "$ADMIN_TOKEN"); [ "$S" = "409" ] && ok "purge archived patient with orders → 409" || bad "purge patient → $S $(body)"
S=$(req POST "$API/patients/$PATIENT_ID/restore" "$ADMIN_TOKEN"); [ "$S" = "200" ] && ok "patient restore → 200" || bad "patient restore → $S"
$DB -c "UPDATE \"User\" SET \"deletedAt\"=NOW() WHERE id='$DOCTOR_ID';" >/dev/null
S=$(req DELETE "$API/users/$DOCTOR_ID/permanent" "$ADMIN_TOKEN"); [ "$S" = "409" ] && ok "purge doctor with patients/orders → 409" || bad "purge doctor → $S $(body)"
S=$(req DELETE "$API/users/bulk-permanent" "$ADMIN_TOKEN" "{\"ids\":[\"$DOCTOR_ID\"]}"); echo "$(body)" | grep -q '"blocked":1' && ok "bulk purge doctor reports blocked=1" || bad "bulk purge doctor: $S $(body)"
[ "$(db_val "SELECT count(*) FROM \"User\" WHERE id='$DOCTOR_ID'")" = "1" ] && ok "doctor row survives" || bad "doctor destroyed"
$DB -c "UPDATE \"User\" SET \"deletedAt\"=NULL WHERE id='$DOCTOR_ID';" >/dev/null
S=$(req DELETE "$API/users/$ADMIN_ID" "$ADMIN_TOKEN"); [ "$S" = "403" ] && ok "self-delete → 403" || bad "self-delete → $S"

step "8. DB backstop: raw DELETE with history is refused (ON DELETE RESTRICT)"
$DB -c "DELETE FROM \"User\" WHERE id='$DOCTOR_ID';" >/dev/null 2>&1 && bad "raw DELETE doctor succeeded (cascade!)" || ok "raw DELETE doctor refused by FK"
$DB -c "DELETE FROM \"Patient\" WHERE id='$PATIENT_ID';" >/dev/null 2>&1 && bad "raw DELETE patient succeeded" || ok "raw DELETE patient refused by FK"
$DB -c "DELETE FROM \"DentalOrder\" WHERE id='$ORDER_A';" >/dev/null 2>&1 && bad "raw DELETE order A succeeded" || ok "raw DELETE order A refused by FK"
$DB -c "DELETE FROM \"Quotation\" WHERE id='$QUOTE_ID';" >/dev/null 2>&1 && bad "raw DELETE quotation with payment succeeded" || ok "raw DELETE quotation refused by FK (payment)"
[ "$(db_val "SELECT count(*) FROM \"Payment\" WHERE id='$PAY_ID'")" = "1" ] && ok "payment intact after all raw attempts" || bad "payment lost"

step "9. Quotation cancel refused once a payment exists"
S=$(req POST "$API/quotations/$QUOTE_ID/cancel" "$ADMIN_TOKEN"); [ "$S" = "409" ] && ok "cancel quotation with payment → 409" || bad "cancel → $S $(body)"

step "10. Staff hard delete → SetNull + snapshots keep clinical/financial rows"
$DB -c "UPDATE \"User\" SET \"deletedAt\"=NOW() WHERE id='$STAFF_ID';" >/dev/null
S=$(req DELETE "$API/users/$STAFF_ID/permanent" "$ADMIN_TOKEN"); [ "$S" = "200" ] && ok "purge staff (no patients/orders) → 200" || bad "purge staff → $S $(body)"
[ "$(db_val "SELECT count(*) FROM \"User\" WHERE id='$STAFF_ID'")" = "0" ] && ok "staff row gone" || bad "staff row still there"
[ "$(db_val "SELECT count(*) FROM \"TreatmentPlan\" WHERE id='$PLAN_ID'")" = "1" ] && ok "plan authored by staff survives" || bad "plan destroyed with staff"
[ "$(db_val "SELECT \"createdByName\" FROM \"TreatmentPlan\" WHERE id='$PLAN_ID'")" = "TEST_DELPOL_STAFF" ] && ok "plan keeps createdByName snapshot" || bad "plan snapshot lost"
[ -z "$(db_val "SELECT \"createdById\" FROM \"TreatmentPlan\" WHERE id='$PLAN_ID' AND \"createdById\" IS NOT NULL")" ] && ok "plan.createdById is NULL (SetNull)" || bad "createdById not nulled"
[ "$(db_val "SELECT count(*) FROM \"Quotation\" WHERE id='$QUOTE_ID'")" = "1" ] && ok "quotation authored by staff survives" || bad "quotation destroyed with staff"
[ "$(db_val "SELECT count(*) FROM \"Payment\" WHERE id='$PAY_ID'")" = "1" ] && ok "payment survives staff purge" || bad "payment destroyed with staff"
[ "$(db_val "SELECT \"senderName\" FROM \"TreatmentMessage\" WHERE id='$MSG_ID'")" = "TEST_DELPOL_STAFF" ] && ok "message keeps senderName snapshot" || bad "message snapshot lost / row gone"
[ "$(db_val "SELECT \"assignedDesignerId\" IS NULL FROM \"DentalOrder\" WHERE id='$ORDER_A'")" = "t" ] && ok "order.assignedDesignerId nulled" || bad "assignedDesignerId not nulled"

step "11. Allowed purge: archived order with no history + its files"
S=$(req DELETE "$API/orders/$ORDER_B" "$ADMIN_TOKEN"); [ "$S" = "200" ] && ok "archive order B" || bad "archive B → $S"
S=$(req DELETE "$API/orders/$ORDER_B/permanent" "$ADMIN_TOKEN"); [ "$S" = "200" ] && ok "purge order B → 200" || bad "purge B → $S $(body)"
[ "$(db_val "SELECT count(*) FROM \"DentalOrder\" WHERE id='$ORDER_B'")" = "0" ] && ok "order B row gone" || bad "order B still there"
[ "$(db_val "SELECT count(*) FROM \"OrderFile\" WHERE id='$FILE_ID'")" = "0" ] && ok "order B file row gone" || bad "file row still there"
docker compose -p oralign-app exec -T backend sh -c "test ! -e /app/uploads/${REL}" && ok "original blob unlinked" || bad "original blob still on disk"
docker compose -p oralign-app exec -T backend sh -c "test ! -e /app/uploads/orders/${ORDER_B}/other/blob__thumb.webp" && ok "variant blob unlinked" || bad "variant still on disk"
docker compose -p oralign-app exec -T backend sh -c "test ! -d /app/uploads/orders/$ORDER_B" && ok "order upload directory removed" || bad "order dir still on disk"

step "12. Archived orders leave the admin dashboard KPIs"
# Make order A's quote count towards revenue (approved + paid + pack),
# then read the KPI with the order live and again with it archived.
$DB -c "UPDATE \"Quotation\" SET status='approved', \"paymentStatus\"='paid', \"packId\"=NULL, \"totalPrice\"=100, \"paidAmount\"=100, \"sentAt\"=NOW() WHERE id='$QUOTE_ID';" >/dev/null
PACK_ID=$(db_insert "INSERT INTO \"Pack\" (id, name, \"isActive\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'TEST_DELPOL_PACK', true, NOW(), NOW()) RETURNING id;")
remember Pack "$PACK_ID"
$DB -c "UPDATE \"Quotation\" SET \"packId\"='$PACK_ID' WHERE id='$QUOTE_ID';" >/dev/null

kpi_revenue() {
  docker compose -p oralign-app exec -T redis sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning FLUSHDB' >/dev/null 2>&1
  req GET "$API/admin/dashboard/kpis" "$ADMIN_TOKEN" >/dev/null
  body | jget "o.revenue && (o.revenue.total ?? o.revenue.collected)"
}

S=$(req GET "$API/admin/dashboard/kpis" "$ADMIN_TOKEN")
[ "$S" = "200" ] && ok "admin dashboard KPIs 200" || bad "admin dashboard -> $S $(body)"
REV_LIVE=$(kpi_revenue)
$DB -c "UPDATE \"DentalOrder\" SET \"deletedAt\"=NOW() WHERE id='$ORDER_A';" >/dev/null
REV_ARCHIVED=$(kpi_revenue)
$DB -c "UPDATE \"DentalOrder\" SET \"deletedAt\"=NULL WHERE id='$ORDER_A';" >/dev/null
if [ -n "${REV_LIVE:-}" ] && [ -n "${REV_ARCHIVED:-}" ]; then
  awk -v a="$REV_LIVE" -v b="$REV_ARCHIVED" 'BEGIN{exit !(a-b >= 99.9)}' \
    && ok "archiving the order removed its 100 from revenue (live=$REV_LIVE archived=$REV_ARCHIVED)" \
    || bad "revenue did not drop when the order was archived (live=$REV_LIVE archived=$REV_ARCHIVED)"
else
  bad "could not read revenue KPI (live='${REV_LIVE:-}' archived='${REV_ARCHIVED:-}')"
fi

# ─────────────────────────────────────────────────────────────────────
log ""; log "── Summary ──"; log "  Passed: $PASS"; log "  Failed: $FAIL"
if [ "$FAIL" -eq 0 ]; then log "  ✓ ALL CHECKS PASSED"; else log "  ✗ SOME CHECKS FAILED"; fi
[ "$FAIL" -eq 0 ]
