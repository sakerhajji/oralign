#!/usr/bin/env bash
# scripts/test-order-pdf.sh — seed a fully-populated TEST_ order, hit
# GET /orders/:id/download-all as admin, and extract the generated
# fiche-commande PDF for a visual check. TEST_ rows are removed on exit.
set -uo pipefail

API="http://127.0.0.1:3000/api"
DB() { docker compose -p oralign-app exec -T postgres psql -U oralign -d oralign_db -tA "$@"; }
db_insert() { DB -c "$1" | head -n1 | tr -d ' \r'; }
OUT_DIR="${1:-/tmp/order-pdf-test}"
mkdir -p "$OUT_DIR"

IDS=()
remember() { IDS+=("$1:$2"); }
cleanup() {
  for ((i = ${#IDS[@]} - 1; i >= 0; i--)); do
    local t="${IDS[i]%%:*}" id="${IDS[i]#*:}"
    DB -c "DELETE FROM \"$t\" WHERE id='$id';" >/dev/null 2>&1
  done
  echo "cleanup done (${#IDS[@]} rows)"
}
trap cleanup EXIT

PASSWORD='TestPdf_2026!'
PW_HASH=$(docker compose -p oralign-app exec -T backend node -e \
  "require('bcryptjs').hash(process.argv[1],12).then(h=>process.stdout.write(h))" "$PASSWORD" 2>/dev/null | tr -d '\r')
STAMP="$(date +%s | tail -c 7)"

ADMIN_ID=$(db_insert "INSERT INTO \"User\" (id, \"fullName\", email, \"passwordHash\", role, \"isActive\", \"isEmailVerified\", \"verificationStatus\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'TEST_PDF_ADMIN', 'test_pdf_admin_${STAMP}@oralign.test', '$PW_HASH', 'admin', true, true, 'approved', NOW(), NOW()) RETURNING id;")
remember User "$ADMIN_ID"
DOC_ID=$(db_insert "INSERT INTO \"User\" (id, \"fullName\", email, \"passwordHash\", role, \"isActive\", \"isEmailVerified\", \"verificationStatus\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'Dr TEST_PDF Benayed', 'test_pdf_doc_${STAMP}@oralign.test', '$PW_HASH', 'dentist', true, true, 'approved', NOW(), NOW()) RETURNING id;")
remember User "$DOC_ID"
PAT_ID=$(db_insert "INSERT INTO \"Patient\" (id, \"fullName\", email, phone, \"doctorId\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'TEST_PDF Patient Amira', 'amira@example.test', '+216 20 000 000', '$DOC_ID', NOW(), NOW()) RETURNING id;")
remember Patient "$PAT_ID"

ORDER_ID=$(db_insert "INSERT INTO \"DentalOrder\" (id, \"orderCode\", \"doctorId\", \"patientId\", status, \"patientStage\", \"chiefComplaint\", \"archTreatment\", \"treatBothArch\", \"treatmentPlan\", \"anteroposteriorRelationship\", elastics, \"openBite\", midline, ipr, \"biteRamps\", expansion, crossbite, spaces, extractions, \"specialInstructions\", \"useCbctWithScans\", \"cbctFeeAmount\", \"cbctFeeCurrency\", \"wantsManufacturing\", materials, \"submittedAt\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'TESTPDF_${STAMP}', '$DOC_ID', '$PAT_ID', 'submitted', 'initial', 'Crowding, Open bite, bruxisme nocturne', 'both', true, 'Alignement complet avec expansion controlee', 'Classe I a maintenir', 'Class II elastics — port permanent 22h/j', 'Correct', 'Maintain', 'Both', 'Incisors', 'No expansion', 'Correct only anterior', 'Close all spaces', 'Extraire la 18 avant traitement', 'Surveiller la 12 — mobilite grade 1', true, 120, 'TND', true, ARRAY['PETG','TPU'], NOW(), NOW(), NOW()) RETURNING id;")
remember DentalOrder "$ORDER_ID"
echo "order=$ORDER_ID"

ti() { # tooth type value note
  local id
  id=$(db_insert "INSERT INTO \"OrderToothInstruction\" (id, \"orderId\", \"toothNumber\", type, value, note, \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), '$ORDER_ID', $1, '$2', $3, $4, NOW(), NOW()) RETURNING id;")
  remember OrderToothInstruction "$id"
}
ti 11 extract NULL NULL
ti 16 do_not_move NULL NULL
ti 16 no_attachments NULL NULL
ti 21 no_attachments NULL NULL
ti 24 do_not_move NULL "'Racine fragile'"
ti 36 no_ipr NULL "'Contact serre'"
ti 13 ipr_value "'0.2'" NULL
ti 44 extract NULL NULL

TOKEN=$(curl -sS -X POST "$API/auth/sign-in" -H "Content-Type: application/json" \
  -d "{\"email\":\"test_pdf_admin_${STAMP}@oralign.test\",\"password\":\"$PASSWORD\"}" \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);process.stdout.write((j.authToken&&j.authToken.accessToken)||j.accessToken||"")}catch{}})')
[ -n "$TOKEN" ] || { echo "SIGN-IN FAILED"; exit 1; }

HTTP=$(curl -sS -o "$OUT_DIR/order.zip" -w '%{http_code}' "$API/orders/$ORDER_ID/download-all" -H "Authorization: Bearer $TOKEN")
echo "download-all: HTTP $HTTP ($(wc -c < "$OUT_DIR/order.zip" | tr -d ' ') bytes)"
[ "$HTTP" = "200" ] || { echo "DOWNLOAD FAILED"; head -c 300 "$OUT_DIR/order.zip"; exit 1; }

cd "$OUT_DIR" && rm -rf extracted && mkdir extracted && cd extracted
unzip -o ../order.zip >/dev/null 2>&1 || powershell.exe -NoProfile -Command "Expand-Archive -Path ../order.zip -DestinationPath . -Force" >/dev/null 2>&1
echo "zip contents:"; ls -la
PDF=$(ls fiche-commande-*.pdf 2>/dev/null | head -1)
if [ -n "$PDF" ]; then
  echo "PDF OK: $PDF ($(wc -c < "$PDF" | tr -d ' ') bytes)"
else
  echo "NO PDF FOUND — json fallback? $(ls *.json 2>/dev/null)"
  exit 1
fi
