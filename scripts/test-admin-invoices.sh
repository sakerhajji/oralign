#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# scripts/test-admin-invoices.sh
#
# Manual / admin invoicing, against the running stack. What it proves:
#
#   permissions   → a dentist is refused on every /admin/invoices route
#   prefill       → a patient lookup returns the patient AND their orders
#   server maths  → HT / TVA / TTC are recomputed from the lines; totals
#                   posted by the client are rejected outright
#   numbering     → allocated from the existing FAC counter, duplicates 409
#   edit + audit  → replacing the lines recomputes, and editing an ISSUED
#                   invoice writes an audit entry naming the actor
#   PDF           → renders through the existing template
#   exports       → CSV (UTF-8 BOM, ";" for Excel) + ZIP of PDFs
#   filters       → search / status / period, and the period summary
#   deletion      → trash-first, and an issued invoice can never be purged
#   integrity     → Postgres refuses to delete an order that has an invoice
#
# Artefacts are tagged TEST_INV_* and removed at the end.
# ─────────────────────────────────────────────────────────────────────

set -u
cd /c/Users/saker/Desktop/oraling || exit 1

DB="docker compose -p oralign-app exec -T postgres psql -U oralign -d oralign_db -t -A"
API="http://127.0.0.1:3000/api"
PASS=0
FAIL=0

ok()   { PASS=$((PASS+1)); echo "  OK   $*"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL $*"; }
step() { echo; echo "== $* =="; }

# JSON reader: the expression is evaluated with `o` bound to the payload.
jget() {
  node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const o=JSON.parse(d);const v=eval(process.argv[1]);process.stdout.write(v==null?"":String(v))}catch(e){}})' "$1"
}

req() { # method url token [json]
  local m="$1" u="$2" t="$3" d="${4:-}"
  if [ -n "$d" ]; then
    curl -sS -o /tmp/inv_body -w '%{http_code}' -X "$m" "$u" \
      -H "Authorization: Bearer $t" -H 'Content-Type: application/json' -d "$d"
  else
    curl -sS -o /tmp/inv_body -w '%{http_code}' -X "$m" "$u" -H "Authorization: Bearer $t"
  fi
}
body() { cat /tmp/inv_body; }

db1() { $DB -c "$1" 2>&1 | head -1 | tr -d '\r\n[:space:]'; }

# ─────────────────────────────────────────────────────────────────────
step "1. Comptes et donnees de test"

STAMP=$(date +%s | tail -c 7)
PW='TestInv_2026!'
HASH=$(docker compose -p oralign-app exec -T backend node -e \
  "const b=require('bcryptjs');b.hash(process.argv[1],12).then(h=>process.stdout.write(h))" \
  "$PW" 2>/dev/null | tr -d '\r')
[ -n "$HASH" ] && ok "mot de passe hashe" || { bad "bcrypt"; exit 1; }

mkuser() {
  db1 "INSERT INTO \"User\" (id,\"fullName\",email,\"passwordHash\",role,\"isActive\",\"isEmailVerified\",\"verificationStatus\",\"createdAt\",\"updatedAt\") VALUES (gen_random_uuid(),'$2','test_inv_${1}_${STAMP}@oralign.test','$HASH','$1',true,true,'approved',NOW(),NOW()) RETURNING id;"
}
ADMIN_ID=$(mkuser admin TEST_INV_ADMIN)
DOCTOR_ID=$(mkuser dentist TEST_INV_DOCTOR)
ok "admin=$ADMIN_ID"
ok "dentiste=$DOCTOR_ID"

login() {
  curl -sS -X POST "$API/auth/sign-in" -H 'Content-Type: application/json' \
    -d "{\"email\":\"test_inv_${1}_${STAMP}@oralign.test\",\"password\":\"$PW\"}" \
    | jget 'o.authToken && o.authToken.accessToken'
}
AT=$(login admin)
DT=$(login dentist)
[ -n "$AT" ] && ok "admin connecte" || { bad "login admin"; exit 1; }
[ -n "$DT" ] && ok "dentiste connecte" || bad "login dentiste"

PATIENT_ID=$(db1 "INSERT INTO \"Patient\" (id,\"fullName\",email,phone,\"doctorId\",\"createdAt\",\"updatedAt\") VALUES (gen_random_uuid(),'TEST_INV_PATIENT','patinv_${STAMP}@x.test','+21611223344','$DOCTOR_ID',NOW(),NOW()) RETURNING id;")
ORDER_ID=$(db1 "INSERT INTO \"DentalOrder\" (id,\"orderCode\",\"doctorId\",\"patientId\",status,\"createdAt\",\"updatedAt\") VALUES (gen_random_uuid(),'TEST_INV_${STAMP}','$DOCTOR_ID','$PATIENT_ID','draft',NOW(),NOW()) RETURNING id;")
ok "patient=$PATIENT_ID"
ok "commande=$ORDER_ID"

# Les parametres de facturation sont une PRE-CONDITION: ils portent la
# sequence FAC, le taux de TVA par defaut, le droit de timbre et l'en-tete
# societe imprimee sur le PDF. En dev la table peut etre vide — on en seede
# un le temps du test, et on ne supprime que celui qu'on a cree.
SETTINGS_SEEDED=0
SETTINGS_ID=$(db1 "SELECT id FROM \"CompanyBillingSettings\" WHERE \"isActive\"=true ORDER BY \"updatedAt\" DESC LIMIT 1;")
if [ -z "$SETTINGS_ID" ]; then
  SETTINGS_ID=$(db1 "INSERT INTO \"CompanyBillingSettings\" (id,\"companyName\",\"companyAddress\",\"companyCity\",\"companyCountry\",\"companyPhone\",\"companyEmail\",\"taxRegistrationNumber\",\"defaultTvaRate\",\"defaultCurrency\",\"stampDuty\",\"invoicePrefix\",\"invoiceNextNumber\",\"isActive\",\"createdAt\",\"updatedAt\") VALUES (gen_random_uuid(),'TEST_INV_SOCIETE','12 rue de Test','Tunis','Tunisie','+21610000000','billing@oralign.test','9999999/A/M/000',19,'TND',1,'FAC',1,true,NOW(),NOW()) RETURNING id;")
  SETTINGS_SEEDED=1
  ok "parametres de facturation seedes (matricule 9999999/A/M/000)"
else
  ok "parametres de facturation deja presents ($SETTINGS_ID)"
fi

# ─────────────────────────────────────────────────────────────────────
step "2. Permissions: un dentiste n'atteint aucune route admin"

S=$(req GET "$API/admin/invoices" "$DT")
[ "$S" = "403" ] && ok "GET /admin/invoices -> 403" || bad "GET liste -> $S"
S=$(req GET "$API/admin/invoices/summary" "$DT")
[ "$S" = "403" ] && ok "GET /summary -> 403" || bad "GET summary -> $S"
S=$(req GET "$API/admin/invoices/clients?search=test" "$DT")
[ "$S" = "403" ] && ok "GET /clients -> 403" || bad "GET clients -> $S"
S=$(req POST "$API/admin/invoices" "$DT" '{"clientName":"X","lines":[{"description":"a","quantity":1,"unitPrice":1}]}')
[ "$S" = "403" ] && ok "POST -> 403" || bad "POST dentiste -> $S"

# ─────────────────────────────────────────────────────────────────────
step "3. Recherche client: patient + ses commandes pour preremplir"

S=$(req GET "$API/admin/invoices/clients?search=TEST_INV_PATIENT" "$AT")
NFOUND=$(body | jget 'o.data.length')
NORDERS=$(body | jget 'o.data[0] ? o.data[0].orders.length : 0')
if [ "$S" = "200" ] && [ "${NFOUND:-0}" -ge 1 ]; then
  ok "patient trouve ($NFOUND) avec $NORDERS commande(s) rattachee(s)"
else
  bad "recherche client -> $S data=$NFOUND"
fi

# ─────────────────────────────────────────────────────────────────────
step "4. Creation: les totaux sont calcules par le SERVEUR"
# 3 x 100 = 300 ; 1 x 50 = 50 => brut 350
# remise 50 => HT 300 ; TVA 19% = 57 ; timbre 1 => TTC 358

read -r -d '' PAYLOAD <<'JSON'
{"clientName":"TEST_INV Client","clientTaxId":"1234567/A/M/000","tvaRate":19,
 "discountAmount":50,"stampDuty":1,"notes":"facture de test",
 "lines":[{"description":"Gouttieres arcade superieure","quantity":3,"unitPrice":100},
          {"description":"Frais de livraison","quantity":1,"unitPrice":50}]}
JSON
PAYLOAD=${PAYLOAD//\"clientName\"/\"patientId\":\"$PATIENT_ID\",\"doctorId\":\"$DOCTOR_ID\",\"orderId\":\"$ORDER_ID\",\"clientName\"}

S=$(req POST "$API/admin/invoices" "$AT" "$PAYLOAD")
INVOICE_ID=$(body | jget 'o.id')
NUMBER=$(body | jget 'o.invoiceNumber')
HT=$(body | jget 'o.subTotalHt')
TVA=$(body | jget 'o.tvaAmount')
TTC=$(body | jget 'o.totalTtc')

[ "$S" = "201" ] && ok "creation -> 201 ($NUMBER)" || bad "creation -> $S $(body | head -c 400)"
[ "$HT" = "300" ]  && ok "HT = 300 (350 brut - 50 de remise)" || bad "HT=$HT attendu 300"
[ "$TVA" = "57" ]  && ok "TVA = 57 (19% de 300)"              || bad "TVA=$TVA attendu 57"
[ "$TTC" = "358" ] && ok "TTC = 358 (300 + 57 + 1 de timbre)" || bad "TTC=$TTC attendu 358"
case "$NUMBER" in
  FAC-*) ok "numero alloue sur la sequence FAC existante" ;;
  *)     bad "numero inattendu: $NUMBER" ;;
esac

# ─────────────────────────────────────────────────────────────────────
step "5. Le frontend ne peut pas imposer un total"

S=$(req POST "$API/admin/invoices" "$AT" '{"clientName":"Fraude","totalTtc":1,"subTotalHt":1,"lines":[{"description":"x","quantity":1,"unitPrice":999}]}')
[ "$S" = "400" ] && ok "totaux postes par le client -> 400 (whitelist DTO)" || bad "totaux acceptes -> $S"

# ─────────────────────────────────────────────────────────────────────
step "6. Edition: recalcul + journal d'audit"

S=$(req PATCH "$API/admin/invoices/$INVOICE_ID" "$AT" '{"status":"issued"}')
[ "$S" = "200" ] && ok "passage a 'issued' -> 200" || bad "issued -> $S"

S=$(req PATCH "$API/admin/invoices/$INVOICE_ID" "$AT" '{"lines":[{"description":"Ligne unique","quantity":2,"unitPrice":100}],"discountAmount":0}')
HT2=$(body | jget 'o.subTotalHt')
TTC2=$(body | jget 'o.totalTtc')
if [ "$HT2" = "200" ] && [ "$TTC2" = "239" ]; then
  ok "lignes remplacees -> HT=200 TTC=239 (200 + 38 + 1)"
else
  bad "recalcul apres edition: HT=$HT2 TTC=$TTC2"
fi

NLINES=$(db1 "SELECT count(*) FROM \"InvoiceLine\" WHERE \"invoiceId\"='$INVOICE_ID';")
[ "$NLINES" = "1" ] && ok "anciennes lignes supprimees (1 restante)" || bad "lignes=$NLINES"

NAUDIT=$(db1 "SELECT count(*) FROM \"InvoiceAuditLog\" WHERE \"invoiceId\"='$INVOICE_ID';")
[ "${NAUDIT:-0}" -ge 1 ] && ok "audit ecrit ($NAUDIT entree(s)) car la facture etait emise" || bad "aucun audit log"
ACTOR=$($DB -c "SELECT \"actorName\" FROM \"InvoiceAuditLog\" WHERE \"invoiceId\"='$INVOICE_ID' LIMIT 1;" 2>/dev/null | head -1 | tr -d '\r')
[ -n "$ACTOR" ] && ok "acteur trace: $ACTOR" || bad "actorName vide"

# Un brouillon ne doit PAS generer d'audit.
S=$(req POST "$API/admin/invoices" "$AT" '{"clientName":"TEST_INV Brouillon","lines":[{"description":"x","quantity":1,"unitPrice":10}]}')
DRAFT_ID=$(body | jget 'o.id')
req PATCH "$API/admin/invoices/$DRAFT_ID" "$AT" '{"notes":"modif brouillon"}' >/dev/null
NAUDIT_DRAFT=$(db1 "SELECT count(*) FROM \"InvoiceAuditLog\" WHERE \"invoiceId\"='$DRAFT_ID';")
[ "$NAUDIT_DRAFT" = "0" ] && ok "editer un BROUILLON n'ecrit rien (bruit evite)" || bad "audit sur brouillon: $NAUDIT_DRAFT"

# ─────────────────────────────────────────────────────────────────────
step "7. Numero en double refuse"

S=$(req POST "$API/admin/invoices" "$AT" "{\"clientName\":\"Doublon\",\"invoiceNumber\":\"$NUMBER\",\"lines\":[{\"description\":\"x\",\"quantity\":1,\"unitPrice\":10}]}")
CODE=$(body | jget 'o.errorCode')
if [ "$S" = "409" ] && [ "$CODE" = "INVOICE_NUMBER_TAKEN" ]; then
  ok "numero deja pris -> 409 INVOICE_NUMBER_TAKEN"
else
  bad "doublon -> $S / $CODE"
fi

# ─────────────────────────────────────────────────────────────────────
step "8. PDF: meme gabarit que les recus existants"

HTTP=$(curl -sS -o /tmp/inv.pdf -w '%{http_code}' "$API/admin/invoices/$INVOICE_ID/pdf" -H "Authorization: Bearer $AT")
SIZE=$(wc -c < /tmp/inv.pdf)
MAGIC=$(head -c 4 /tmp/inv.pdf)
if [ "$HTTP" = "200" ] && [ "$MAGIC" = "%PDF" ] && [ "$SIZE" -gt 5000 ]; then
  ok "PDF genere ($SIZE octets)"
else
  bad "PDF -> $HTTP magic=$MAGIC taille=$SIZE"
fi

# ─────────────────────────────────────────────────────────────────────
step "9. Export CSV de la periode"

MONTH_FROM=$(date +%Y-%m-01)
MONTH_TO=$(date +%Y-%m-28)
HTTP=$(curl -sS -o /tmp/inv.csv -w '%{http_code}' \
  "$API/admin/invoices/export/csv?issuedFrom=$MONTH_FROM&issuedTo=$MONTH_TO" -H "Authorization: Bearer $AT")
[ "$HTTP" = "200" ] && ok "export CSV -> 200" || bad "CSV -> $HTTP"
head -c 3 /tmp/inv.csv | od -An -tx1 | grep -q "ef bb bf" \
  && ok "BOM UTF-8 present (Excel ouvre en colonnes)" || bad "BOM absent"
grep -q "Matricule fiscal" /tmp/inv.csv && ok "colonne 'Matricule fiscal' presente" || bad "colonne matricule absente"
grep -q "$NUMBER" /tmp/inv.csv && ok "la facture figure dans l'export" || bad "facture absente du CSV"
grep -q "^TOTAL" /tmp/inv.csv && ok "ligne TOTAL de reconciliation presente" || bad "ligne TOTAL absente"

# ─────────────────────────────────────────────────────────────────────
step "10. Export ZIP des PDF selectionnes"

HTTP=$(curl -sS -o /tmp/inv.zip -w '%{http_code}' -X POST "$API/admin/invoices/export/zip" \
  -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d "{\"ids\":[\"$INVOICE_ID\",\"$DRAFT_ID\"]}")
ZMAGIC=$(head -c 2 /tmp/inv.zip)
ZSIZE=$(wc -c < /tmp/inv.zip)
if [ "$HTTP" = "200" ] && [ "$ZMAGIC" = "PK" ] && [ "$ZSIZE" -gt 5000 ]; then
  ok "ZIP de 2 PDF genere ($ZSIZE octets)"
else
  bad "ZIP -> $HTTP magic=$ZMAGIC taille=$ZSIZE"
fi

# ─────────────────────────────────────────────────────────────────────
step "11. Filtres, periode et totaux"

S=$(req GET "$API/admin/invoices?search=$NUMBER" "$AT")
N=$(body | jget 'o.total')
if [ "$S" = "200" ] && [ "${N:-0}" -ge 1 ]; then ok "recherche par numero -> $N resultat(s)"; else bad "recherche -> $S/$N"; fi

S=$(req GET "$API/admin/invoices?statuses=draft" "$AT")
N=$(body | jget "o.data.filter(function(i){return i.invoiceNumber==='$NUMBER'}).length")
[ "$N" = "0" ] && ok "filtre statut: la facture 'issued' est hors de 'draft'" || bad "filtre statut inefficace ($N)"

S=$(req GET "$API/admin/invoices?issuedFrom=2000-01-01&issuedTo=2000-01-02" "$AT")
N=$(body | jget 'o.total')
[ "$N" = "0" ] && ok "filtre periode: 0 facture en 2000" || bad "filtre periode -> $N"

S=$(req GET "$API/admin/invoices/summary?search=$NUMBER" "$AT")
SUM=$(body | jget 'o.totalTtc')
[ "$SUM" = "239" ] && ok "summary TTC = 239 sur le filtre courant" || bad "summary=$SUM"

# ─────────────────────────────────────────────────────────────────────
step "12. Suppression: corbeille d'abord, facture emise intouchable"

S=$(req DELETE "$API/admin/invoices/$INVOICE_ID/permanent" "$AT")
CODE=$(body | jget 'o.errorCode')
if [ "$S" = "400" ] && [ "$CODE" = "NOT_ARCHIVED" ]; then
  ok "purge d'une facture vivante -> 400 NOT_ARCHIVED"
else
  bad "purge vivante -> $S / $CODE"
fi

req DELETE "$API/admin/invoices/$INVOICE_ID" "$AT" >/dev/null
S=$(req DELETE "$API/admin/invoices/$INVOICE_ID/permanent" "$AT")
CODE=$(body | jget 'o.errorCode')
if [ "$S" = "409" ] && [ "$CODE" = "INVOICE_ISSUED" ]; then
  ok "purge d'une facture EMISE -> 409 (pas de trou dans la sequence)"
else
  bad "purge emise -> $S / $CODE"
fi

S=$(req PATCH "$API/admin/invoices/$INVOICE_ID/restore" "$AT")
[ "$S" = "200" ] && ok "restauration -> 200" || bad "restore -> $S"

# Un brouillon archive, lui, peut disparaitre.
req DELETE "$API/admin/invoices/$DRAFT_ID" "$AT" >/dev/null
S=$(req DELETE "$API/admin/invoices/$DRAFT_ID/permanent" "$AT")
[ "$S" = "200" ] && ok "un BROUILLON archive se purge -> 200" || bad "purge brouillon -> $S $(body | head -c 200)"

# ─────────────────────────────────────────────────────────────────────
step "13. Integrite: la commande facturee est protegee"

OUT=$($DB -c "DELETE FROM \"DentalOrder\" WHERE id='$ORDER_ID';" 2>&1 | tr -d '\r')
case "$OUT" in
  *violates*|*ERROR*) ok "Postgres refuse de supprimer une commande facturee (RESTRICT)" ;;
  *)                  bad "la commande a ete supprimee: $OUT" ;;
esac

# ─────────────────────────────────────────────────────────────────────
echo
echo "== Nettoyage =="
$DB -c "DELETE FROM \"InvoiceAuditLog\" WHERE \"invoiceId\" IN ('$INVOICE_ID','$DRAFT_ID');" >/dev/null 2>&1
$DB -c "DELETE FROM \"InvoiceLine\" WHERE \"invoiceId\" IN ('$INVOICE_ID','$DRAFT_ID');" >/dev/null 2>&1
$DB -c "DELETE FROM \"Invoice\" WHERE id IN ('$INVOICE_ID','$DRAFT_ID');" >/dev/null 2>&1
$DB -c "DELETE FROM \"DentalOrder\" WHERE id='$ORDER_ID';" >/dev/null 2>&1
$DB -c "DELETE FROM \"Patient\" WHERE id='$PATIENT_ID';" >/dev/null 2>&1
$DB -c "DELETE FROM \"User\" WHERE id IN ('$ADMIN_ID','$DOCTOR_ID');" >/dev/null 2>&1
if [ "$SETTINGS_SEEDED" = "1" ]; then
  $DB -c "DELETE FROM \"CompanyBillingSettings\" WHERE id='$SETTINGS_ID';" >/dev/null 2>&1
fi
echo "  artefacts supprimes"

echo
echo "== Resultat =="
echo "  PASS: $PASS"
echo "  FAIL: $FAIL"
[ "$FAIL" -eq 0 ] && echo "  OK — facturation admin conforme" || echo "  ECHEC — voir ci-dessus"
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
