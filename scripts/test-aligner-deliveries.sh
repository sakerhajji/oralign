#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# scripts/test-aligner-deliveries.sh — integration test for:
#   • aligner delivery tracking: first delivery 1 → 3 (sets the series
#     size), second 4 → 7, history + totals from persisted rows, overlap /
#     duplicate / out-of-series / from > to / future date rejected,
#     series-size correction, draft orders refused
#   • concurrency: N identical requests in parallel create ONE row
#   • RBAC: admin + owning dentist write; another dentist is refused;
#     the assigned designer reads but cannot write
#   • deletion policy: an order with deliveries cannot be purged (409)
#   • lab ZIP names: no left/right slot key left in a file name, the
#     informative prefixes (upper/lower STL, profile) kept
#   • unrelated order endpoints still answer
#
# TEST_-data pattern: throwaway rows tagged TEST_ALD, removed on exit.
# Run from the repo root with the dev stack up:
#   bash scripts/test-aligner-deliveries.sh
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
CURL="curl -sS --retry 3 --retry-all-errors --retry-delay 1"

# req METHOD PATH TOKEN [JSON] → writes body to $TMP_DIR/r.json, echoes status
req() {
  local method="$1" path="$2" token="$3" body="${4:-}"
  if [ -n "$body" ]; then
    $CURL -o "$TMP_DIR/r.json" -w '%{http_code}' -X "$method" "$API$path" \
      -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d "$body"
  else
    $CURL -o "$TMP_DIR/r.json" -w '%{http_code}' -X "$method" "$API$path" \
      -H "Authorization: Bearer $token"
  fi
}
body() { jget "$1" < "$TMP_DIR/r.json"; }
expect_code() { # label expectedStatus expectedErrorCode(optional) actualStatus
  local label="$1" want="$2" wantCode="${3:-}" got="$4" code
  code=$(body errorCode)
  if [ "$got" = "$want" ] && { [ -z "$wantCode" ] || [ "$code" = "$wantCode" ]; }; then
    ok "$label → $got${wantCode:+ $wantCode}"
  else
    bad "$label: expected $want${wantCode:+ $wantCode}, got $got $code — $(head -c 200 "$TMP_DIR/r.json")"
  fi
}

cleanup() {
  step "Cleanup"
  # Deliveries first: their order FK is RESTRICT (by design).
  for O in "${ORDER_ID:-}" "${DRAFT_ORDER_ID:-}"; do
    [ -n "$O" ] && DB -c "DELETE FROM \"AlignerDelivery\" WHERE \"orderId\" = '$O';" >/dev/null 2>&1
  done
  [ -n "${ORDER_ID:-}" ] && docker compose -p oralign-app exec -T backend \
    node -e "require('fs').rmSync('/app/uploads/orders/$ORDER_ID',{recursive:true,force:true})" >/dev/null 2>&1
  local lines=()
  while IFS= read -r line; do [ -n "$line" ] && lines+=("$line"); done < "$TEST_IDS_FILE"
  for ((i = ${#lines[@]} - 1; i >= 0; i--)); do
    local table="${lines[i]%%|*}"
    local id="${lines[i]#*|}"
    [ -z "$table" ] && continue
    [ -z "$id" ] && continue
    DB -c "DELETE FROM \"$table\" WHERE id = '$id';" >/dev/null 2>&1 && echo "  . deleted $table $id"
  done
  # Order-proof last sweep keyed on the throwaway email pattern.
  DB -c "DELETE FROM \"AlignerDelivery\" WHERE \"orderId\" IN (SELECT id FROM \"DentalOrder\" WHERE \"orderCode\" LIKE 'TEST_ALD%');" >/dev/null 2>&1
  DB -c "DELETE FROM \"DentalOrder\" WHERE \"orderCode\" LIKE 'TEST_ALD%';" >/dev/null 2>&1
  DB -c "DELETE FROM \"Patient\" WHERE \"fullName\" = 'TEST_ALD_PATIENT';" >/dev/null 2>&1
  DB -c "DELETE FROM \"User\" WHERE email LIKE 'test_ald_%';" >/dev/null 2>&1
  LEFT=$(DB -c "SELECT count(*) FROM \"User\" WHERE email LIKE 'test_ald_%';" | head -n1 | tr -d ' \r')
  [ "$LEFT" = "0" ] && echo "  . no TEST_ residue" || echo "  ! $LEFT TEST_ user(s) left behind"
  rm -rf "$TMP_DIR"
  echo
  echo "RESULT: $PASS passed, $FAIL failed"
  # A bare test here would NOT set the script's exit status (EXIT trap).
  [ "$FAIL" -eq 0 ] || exit 1
}
trap cleanup EXIT

# ─────────────────────────────────────────────────────────────────
step "1. Seed users, patient and orders"

PASSWORD='TestAld_2026!'
PW_HASH=$(docker compose -p oralign-app exec -T backend node -e \
  "const b=require('bcryptjs');b.hash(process.argv[1],12).then(h=>process.stdout.write(h))" \
  "$PASSWORD" 2>/dev/null | tr -d '\r')
if [ -n "$PW_HASH" ]; then ok "password hashed"; else bad "bcrypt failed"; exit 1; fi

STAMP="$(date +%s%N | tail -c 10)"
seed_user() { # role name email
  db_insert "INSERT INTO \"User\" (id, \"fullName\", email, \"passwordHash\", role, \"isActive\", \"isEmailVerified\", \"verificationStatus\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), '$2', '$3', '$PW_HASH', '$1', true, true, 'approved', NOW(), NOW()) RETURNING id;"
}
ADMIN_ID=$(seed_user admin TEST_ALD_ADMIN "test_ald_admin_${STAMP}@oralign.test"); remember "User" "$ADMIN_ID"
OWNER_ID=$(seed_user dentist TEST_ALD_OWNER "test_ald_owner_${STAMP}@oralign.test"); remember "User" "$OWNER_ID"
OTHER_ID=$(seed_user dentist TEST_ALD_OTHER "test_ald_other_${STAMP}@oralign.test"); remember "User" "$OTHER_ID"
DESIGNER_ID=$(seed_user designer TEST_ALD_DESIGNER "test_ald_designer_${STAMP}@oralign.test"); remember "User" "$DESIGNER_ID"
[ -n "$ADMIN_ID" ] && [ -n "$OWNER_ID" ] && [ -n "$OTHER_ID" ] && [ -n "$DESIGNER_ID" ] \
  && ok "4 users (admin, owning dentist, other dentist, designer)" || { bad "user seed failed"; exit 1; }

PATIENT_ID=$(db_insert "INSERT INTO \"Patient\" (id, \"fullName\", \"doctorId\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'TEST_ALD_PATIENT', '$OWNER_ID', NOW(), NOW()) RETURNING id;")
remember "Patient" "$PATIENT_ID"
new_order() { # status
  db_insert "INSERT INTO \"DentalOrder\" (id, \"orderCode\", \"doctorId\", \"patientId\", \"assignedDesignerId\", status, \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'TEST_ALD_${STAMP}_$RANDOM', '$OWNER_ID', '$PATIENT_ID', '$DESIGNER_ID', '$1', '2026-08-01T09:00:00Z', NOW()) RETURNING id;"
}
ORDER_ID=$(new_order fabrication); remember "DentalOrder" "$ORDER_ID"
DRAFT_ORDER_ID=$(new_order draft); remember "DentalOrder" "$DRAFT_ORDER_ID"
[ -n "$ORDER_ID" ] && [ -n "$DRAFT_ORDER_ID" ] && ok "orders: one in fabrication, one draft" || { bad "order seed failed"; exit 1; }

signin() {
  local email="$1" attempt resp token
  for attempt in 1 2 3 4 5 6; do
    resp=$($CURL -X POST "$API/auth/sign-in" -H "Content-Type: application/json" -d "{\"email\":\"$email\",\"password\":\"$PASSWORD\"}")
    token=$(echo "$resp" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);process.stdout.write((j.authToken&&j.authToken.accessToken)||j.accessToken||"")}catch{}})')
    if [ -n "$token" ]; then echo "$token"; return 0; fi
    if echo "$resp" | grep -q '"statusCode":429\|ThrottlerException'; then sleep 12; continue; fi
    echo "signin error: $(echo "$resp" | head -c 200)" >&2; return 1
  done
  return 1
}
ADMIN_T=$(signin "test_ald_admin_${STAMP}@oralign.test")
OWNER_T=$(signin "test_ald_owner_${STAMP}@oralign.test")
OTHER_T=$(signin "test_ald_other_${STAMP}@oralign.test")
DESIGNER_T=$(signin "test_ald_designer_${STAMP}@oralign.test")
if [ -n "$ADMIN_T" ] && [ -n "$OWNER_T" ] && [ -n "$OTHER_T" ] && [ -n "$DESIGNER_T" ]; then ok "4 sign-ins"; else bad "sign-in failed"; exit 1; fi

D="/orders/$ORDER_ID/aligner-deliveries"
db_rows() { DB -c "SELECT count(*) FROM \"AlignerDelivery\" WHERE \"orderId\"='$ORDER_ID';" | head -n1 | tr -d ' \r'; }

# ─────────────────────────────────────────────────────────────────
step "2. An existing order without delivery history still works"

CODE=$(req GET "$D" "$OWNER_T")
[ "$CODE" = "200" ] && [ "$(body totalAligners)" = "" ] && [ "$(body deliveredCount)" = "0" ] \
  && [ "$(body nextAligner)" = "1" ] && [ "$(body 'deliveries.length')" = "0" ] && [ "$(body canRecord)" = "true" ] \
  && ok "empty summary: no total, 0 delivered, next = 1, owner may record" \
  || bad "empty summary wrong: $CODE $(head -c 250 "$TMP_DIR/r.json")"

# ─────────────────────────────────────────────────────────────────
step "3. Validation before anything is stored"

expect_code "from > to (7 → 4)" 400 ALIGNER_RANGE_INVALID "$(req POST "$D" "$OWNER_T" '{"fromAligner":7,"toAligner":4,"totalAligners":20}')"
expect_code "first delivery without the series size" 400 ALIGNER_TOTAL_REQUIRED "$(req POST "$D" "$OWNER_T" '{"fromAligner":1,"toAligner":3}')"
expect_code "future date" 400 ALIGNER_DELIVERY_DATE_IN_FUTURE "$(req POST "$D" "$OWNER_T" '{"fromAligner":1,"toAligner":3,"totalAligners":20,"deliveredAt":"2099-01-01"}')"
expect_code "date before the order existed" 400 ALIGNER_DELIVERY_DATE_BEFORE_ORDER "$(req POST "$D" "$OWNER_T" '{"fromAligner":1,"toAligner":3,"totalAligners":20,"deliveredAt":"2020-01-15"}')"
expect_code "impossible date 2026-02-30" 400 ALIGNER_DELIVERY_DATE_INVALID "$(req POST "$D" "$OWNER_T" '{"fromAligner":1,"toAligner":3,"totalAligners":20,"deliveredAt":"2026-02-30"}')"
expect_code "non-numeric aligner (DTO)" 400 "" "$(req POST "$D" "$OWNER_T" '{"fromAligner":"abc","toAligner":3,"totalAligners":20}')"
expect_code "unknown field (DTO whitelist)" 400 "" "$(req POST "$D" "$OWNER_T" '{"fromAligner":1,"toAligner":3,"totalAligners":20,"quantity":99}')"
expect_code "draft order" 400 ORDER_NOT_DELIVERABLE "$(req POST "/orders/$DRAFT_ORDER_ID/aligner-deliveries" "$OWNER_T" '{"fromAligner":1,"toAligner":3,"totalAligners":20}')"
[ "$(db_rows)" = "0" ] && ok "nothing persisted by rejected requests" || bad "rows written by rejected requests: $(db_rows)"

# ─────────────────────────────────────────────────────────────────
step "4. First delivery 1 → 3, then 4 → 7"

expect_code "first delivery 1 → 3 on 2026-09-07 (series of 20)" 201 "" "$(req POST "$D" "$OWNER_T" '{"fromAligner":1,"toAligner":3,"deliveredAt":"2026-09-07","totalAligners":20}')"
[ "$(body deliveredCount)" = "3" ] && [ "$(body totalAligners)" = "20" ] && ok "summary: 3 / 20" || bad "after first: $(head -c 250 "$TMP_DIR/r.json")"
ROW=$(DB -c "SELECT \"fromAligner\"||'|'||\"toAligner\"||'|'||quantity||'|'||\"deliveredAt\"||'|'||(\"createdById\"='$OWNER_ID') FROM \"AlignerDelivery\" WHERE \"orderId\"='$ORDER_ID';" | head -n1 | tr -d ' \r')
[ "$ROW" = "1|3|3|2026-09-07|true" ] && ok "row persisted: $ROW" || bad "first row: '$ROW'"
[ "$(DB -c "SELECT \"totalAligners\" FROM \"DentalOrder\" WHERE id='$ORDER_ID';" | tr -d ' \r')" = "20" ] && ok "series size stored on the order" || bad "totalAligners not stored"

expect_code "second delivery 4 → 7 on 2026-09-20 (explicit null total = omitted)" 201 "" "$(req POST "$D" "$OWNER_T" '{"fromAligner":4,"toAligner":7,"deliveredAt":"2026-09-20","totalAligners":null}')"

# ─────────────────────────────────────────────────────────────────
step "5. History and totals come from persisted rows"

CODE=$(req GET "$D" "$OWNER_T")
[ "$(body 'deliveries.length')" = "2" ] && ok "history holds both deliveries" || bad "history length: $(body 'deliveries.length')"
H1="$(body 'deliveries[0].deliveredAt')|$(body 'deliveries[0].fromAligner')|$(body 'deliveries[0].toAligner')|$(body 'deliveries[0].quantity')"
H2="$(body 'deliveries[1].deliveredAt')|$(body 'deliveries[1].fromAligner')|$(body 'deliveries[1].toAligner')|$(body 'deliveries[1].quantity')"
[ "$H1" = "2026-09-07|1|3|3" ] && [ "$H2" = "2026-09-20|4|7|4" ] && ok "chronological: $H1 then $H2" || bad "history rows: $H1 / $H2"
[ "$(body deliveredCount)" = "7" ] && [ "$(body remainingCount)" = "13" ] && [ "$(body nextAligner)" = "8" ] \
  && ok "7 / 20 delivered, 13 remaining, next = 8" || bad "totals: $(head -c 300 "$TMP_DIR/r.json")"
[ "$(body 'deliveredRanges.length')" = "1" ] && [ "$(body 'deliveredRanges[0].fromAligner')→$(body 'deliveredRanges[0].toAligner')" = "1→7" ] \
  && ok "adjacent batches read as one range 1 → 7" || bad "ranges: $(body 'deliveredRanges.length')"
[ "$(DB -c "SELECT SUM(quantity) FROM \"AlignerDelivery\" WHERE \"orderId\"='$ORDER_ID';" | tr -d ' \r')" = "7" ] \
  && ok "DB: SUM(quantity) = 7" || bad "DB sum mismatch"

# ─────────────────────────────────────────────────────────────────
step "6. Overlap, duplicate, out of series, total mismatch"

expect_code "overlapping 2 → 5" 409 ALIGNER_DELIVERY_OVERLAP "$(req POST "$D" "$OWNER_T" '{"fromAligner":2,"toAligner":5}')"
expect_code "duplicate 4 → 7" 409 ALIGNER_DELIVERY_DUPLICATE "$(req POST "$D" "$OWNER_T" '{"fromAligner":4,"toAligner":7}')"
expect_code "beyond the series (18 → 21 of 20)" 400 ALIGNER_RANGE_OUT_OF_BOUNDS "$(req POST "$D" "$OWNER_T" '{"fromAligner":18,"toAligner":21}')"
expect_code "a different series size on a later delivery" 400 ALIGNER_TOTAL_ALREADY_SET "$(req POST "$D" "$OWNER_T" '{"fromAligner":8,"toAligner":9,"totalAligners":24}')"
[ "$(db_rows)" = "2" ] && ok "history untouched by refused requests (2 rows)" || bad "row count now $(db_rows)"

# ─────────────────────────────────────────────────────────────────
step "7. Authorization"

expect_code "another dentist reads" 403 "" "$(req GET "$D" "$OTHER_T")"
expect_code "another dentist records" 403 "" "$(req POST "$D" "$OTHER_T" '{"fromAligner":8,"toAligner":9}')"
CODE=$(req GET "$D" "$DESIGNER_T")
[ "$CODE" = "200" ] && [ "$(body canRecord)" = "false" ] && ok "assigned designer reads, canRecord=false" || bad "designer read: $CODE $(body canRecord)"
expect_code "assigned designer records" 403 "" "$(req POST "$D" "$DESIGNER_T" '{"fromAligner":8,"toAligner":9}')"
expect_code "admin records 8 → 10" 201 "" "$(req POST "$D" "$ADMIN_T" '{"fromAligner":8,"toAligner":10}')"
[ "$(body deliveredCount)" = "10" ] && ok "10 / 20 after the admin's batch" || bad "after admin: $(body deliveredCount)"

# ─────────────────────────────────────────────────────────────────
step "8. Concurrency — 8 identical requests at once"

# One output file per request (concurrent appends to a single file lose
# lines on Windows) and NO retry: a retried 500 would come back as a 409.
for i in 1 2 3 4 5 6 7 8; do
  curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$API$D" -H "Authorization: Bearer $OWNER_T" \
    -H "Content-Type: application/json" -d '{"fromAligner":11,"toAligner":12}' > "$TMP_DIR/race.$i" &
done
wait
cat "$TMP_DIR"/race.[1-8] > "$TMP_DIR/race.txt"
CREATED=$(grep -c '^201$' "$TMP_DIR/race.txt"); REFUSED=$(grep -c '^409$' "$TMP_DIR/race.txt")
[ "$CREATED" = "1" ] && [ "$REFUSED" = "7" ] && ok "exactly one 201, seven 409" || bad "race: $CREATED created, $REFUSED refused ($(tr '\n' ' ' < "$TMP_DIR/race.txt"))"
[ "$(DB -c "SELECT count(*) FROM \"AlignerDelivery\" WHERE \"orderId\"='$ORDER_ID' AND \"fromAligner\"=11;" | tr -d ' \r')" = "1" ] \
  && ok "DB holds a single 11 → 12 row" || bad "duplicate rows for 11 → 12"

# ─────────────────────────────────────────────────────────────────
step "9. Correcting the series size"

expect_code "total below a delivered aligner (9 < 12)" 400 ALIGNER_TOTAL_BELOW_DELIVERED "$(req PATCH "$D/total" "$OWNER_T" '{"totalAligners":9}')"
expect_code "total corrected to 24" 200 "" "$(req PATCH "$D/total" "$OWNER_T" '{"totalAligners":24}')"
[ "$(body totalAligners)" = "24" ] && [ "$(body remainingCount)" = "12" ] && ok "24 in the series, 12 remaining" || bad "after correction: $(head -c 200 "$TMP_DIR/r.json")"
expect_code "designer cannot correct the total" 403 "" "$(req PATCH "$D/total" "$DESIGNER_T" '{"totalAligners":30}')"

# ─────────────────────────────────────────────────────────────────
step "10. Lab ZIP names — no left/right slot key in a file name"

mkfile() { # category originalName relName mime
  db_insert "INSERT INTO \"OrderFile\" (id,\"orderId\",category,\"originalName\",\"fileName\",\"relativePath\",\"mimeType\",size,\"createdAt\") VALUES (gen_random_uuid(),'$ORDER_ID','$1','$2','$3','orders/$ORDER_ID/x/$3','$4',68,NOW()) RETURNING id;"
}
docker compose -p oralign-app exec -T backend node -e "
const fs=require('fs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const dir='/app/uploads/orders/$ORDER_ID/x';
fs.mkdirSync(dir,{recursive:true});
for (const n of ['left.png','right.png','profile.png','reedit.png']) fs.writeFileSync(dir+'/'+n,png);
for (const n of ['upper.stl','lower.stl']) fs.writeFileSync(dir+'/'+n,Buffer.alloc(84));
console.log('blobs ok');" >/dev/null 2>&1
for spec in "left_photo|left-lateral__IMG_1234.png|left.png|image/png" \
            "right_photo|right-lateral__IMG_5678.png|right.png|image/png" \
            "left_photo|profile__portrait.png|profile.png|image/png" \
            "right_photo|right-lateral__Dr-Test_Patient_right-photo_004.png|reedit.png|image/png" \
            "stl|upper-stl__scan.stl|upper.stl|model/stl" \
            "stl|lower-stl__scan.stl|lower.stl|model/stl"; do
  IFS='|' read -r c o r m <<< "$spec"
  FID=$(mkfile "$c" "$o" "$r" "$m"); remember "OrderFile" "$FID"
done
ok "6 slot-prefixed files seeded (lateral L/R, re-edited lateral, profile, upper/lower STL)"

$CURL -o "$TMP_DIR/fr.zip" "$API/orders/$ORDER_ID/download-all?lang=fr" -H "Authorization: Bearer $ADMIN_T"
$CURL -o "$TMP_DIR/en.zip" "$API/orders/$ORDER_ID/download-all?lang=en" -H "Authorization: Bearer $ADMIN_T"
LIST_FR=$(unzip -Z1 "$TMP_DIR/fr.zip" 2>/dev/null)
LIST_EN=$(unzip -Z1 "$TMP_DIR/en.zip" 2>/dev/null)
echo "$LIST_FR" | grep -qx "PHOTO DENTS DROITE/IMG_1234.png" && ok "FR: PHOTO DENTS DROITE/IMG_1234.png (slot key dropped)" || bad "FR lateral: $(echo "$LIST_FR" | tr '\n' ' ')"
echo "$LIST_FR" | grep -qx "PHOTO DENTS GAUCHE/IMG_5678.png" && ok "FR: PHOTO DENTS GAUCHE/IMG_5678.png" || bad "FR other lateral missing"
echo "$LIST_FR" | grep -qx "PHOTO DENTS GAUCHE/Dr-Test_Patient_004.png" && ok "re-edited photo: generated side segment dropped" || bad "re-edited name: $(echo "$LIST_FR" | grep GAUCHE | tr '\n' ' ')"
echo "$LIST_EN" | grep -qx "RIGHT TEETH PHOTO/IMG_1234.png" && ok "EN: RIGHT TEETH PHOTO/IMG_1234.png" || bad "EN lateral: $(echo "$LIST_EN" | tr '\n' ' ')"
if echo "$LIST_FR$LIST_EN" | sed 's|.*/||' | grep -qiE 'left|right'; then
  bad "a file name still contains left/right: $(echo "$LIST_FR$LIST_EN" | sed 's|.*/||' | grep -iE 'left|right' | tr '\n' ' ')"
else
  ok "no file name (FR or EN) contains left/right"
fi
echo "$LIST_FR" | grep -qx "PHOTO DENTS DROITE/profile__portrait.png" && ok "profile prefix kept (tells it apart in the shared folder)" || bad "profile name changed"
echo "$LIST_FR" | grep -qx "SCAN STL/upper-stl__scan.stl" && echo "$LIST_FR" | grep -qx "SCAN STL/lower-stl__scan.stl" \
  && ok "upper and lower STL scans still distinguishable" || bad "STL names: $(echo "$LIST_FR" | grep STL | tr '\n' ' ')"
echo "$LIST_FR" | grep -qE "^FICHE COMMANDE - .*\.pdf$" && ok "order sheet PDF still in the archive" || bad "order sheet missing: $(echo "$LIST_FR" | tr '\n' ' ')"

# ─────────────────────────────────────────────────────────────────
step "11. Unrelated order endpoints still answer"

CODE=$(req GET "/orders/$ORDER_ID" "$OWNER_T")
[ "$CODE" = "200" ] && [ "$(body orderCode)" != "" ] && ok "GET /orders/:id → 200" || bad "order detail: $CODE"
expect_code "GET /orders (list)" 200 "" "$(req GET "/orders?limit=5" "$OWNER_T")"
expect_code "GET /orders/:id/files" 200 "" "$(req GET "/orders/$ORDER_ID/files" "$OWNER_T")"

# ─────────────────────────────────────────────────────────────────
step "12. Deletion policy — deliveries block a permanent purge"

expect_code "archive the order" 200 "" "$(req DELETE "/orders/$ORDER_ID" "$ADMIN_T")"
CODE=$(req DELETE "/orders/$ORDER_ID/permanent" "$ADMIN_T")
if [ "$CODE" = "409" ] && [ "$(body errorCode)" = "DELETION_BLOCKED" ] && grep -q "aligner deliveries" "$TMP_DIR/r.json"; then
  ok "permanent delete → 409 DELETION_BLOCKED naming the aligner deliveries"
else
  bad "purge guard: $CODE $(head -c 250 "$TMP_DIR/r.json")"
fi
[ "$(db_rows)" = "4" ] && ok "delivery history intact after the refused purge (4 rows)" || bad "rows after purge attempt: $(db_rows)"
expect_code "summary of an archived order is 404" 404 "" "$(req GET "$D" "$ADMIN_T")"
