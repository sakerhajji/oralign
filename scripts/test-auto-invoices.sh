#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# scripts/test-auto-invoices.sh
#
# Automatic invoicing: every payment that settles must produce ONE
# invoice row, visible on /dashboard/invoices.
#
#   bank transfer → admin confirms      → invoice created, status paid
#   cash          → admin records       → invoice created
#   idempotence   → replaying the event never mints a second invoice
#   numbering     → the invoice and the payment receipt share ONE number
#   money         → HT/VAT derived BACKWARDS from the amount actually paid
#   rejected      → a refused transfer produces NO invoice
#   backfill      → older paid payments can be caught up, idempotently
#
# Artefacts are tagged TEST_AUTO_* and removed at the end.
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
jget() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const o=JSON.parse(d);const v=eval(process.argv[1]);process.stdout.write(v==null?"":String(v))}catch(e){}})' "$1"; }
db1()  { $DB -c "$1" 2>&1 | head -1 | tr -d '\r\n[:space:]'; }
req()  {
  local m="$1" u="$2" t="$3" d="${4:-}"
  if [ -n "$d" ]; then
    curl -sS -o /tmp/auto_body -w '%{http_code}' -X "$m" "$u" \
      -H "Authorization: Bearer $t" -H 'Content-Type: application/json' -d "$d"
  else
    curl -sS -o /tmp/auto_body -w '%{http_code}' -X "$m" "$u" -H "Authorization: Bearer $t"
  fi
}
body() { cat /tmp/auto_body; }

# Le listener tourne apres commit: laisser un instant a l'evenement.
settle() { sleep 2; }

STAMP=$(date +%s | tail -c 7)
PW='TestAuto_2026!'

step "1. Jeu de donnees: docteur, patient, commande, devis, echeances"

HASH=$(docker compose -p oralign-app exec -T backend node -e \
  "const b=require('bcryptjs');b.hash(process.argv[1],12).then(h=>process.stdout.write(h))" "$PW" 2>/dev/null | tr -d '\r')
mkuser() {
  db1 "INSERT INTO \"User\" (id,\"fullName\",email,\"passwordHash\",role,\"isActive\",\"isEmailVerified\",\"verificationStatus\",\"createdAt\",\"updatedAt\") VALUES (gen_random_uuid(),'$2','test_auto_${1}_${STAMP}@oralign.test','$HASH','$1',true,true,'approved',NOW(),NOW()) RETURNING id;"
}
ADMIN_ID=$(mkuser admin TEST_AUTO_ADMIN)
DOCTOR_ID=$(mkuser dentist TEST_AUTO_DOCTOR)
ok "admin + dentiste crees"

# Une clinique: c'est elle qui devient le "client" de la facture auto.
$DB -c "INSERT INTO \"DentistProfile\" (id,\"userId\",\"clinicName\",\"clinicAddress\",city,country,\"clinicPhone\",\"clinicEmail\",\"taxId\",\"createdAt\",\"updatedAt\") VALUES (gen_random_uuid(),'$DOCTOR_ID','Cabinet TEST_AUTO','5 rue des Oliviers','Sfax','Tunisie','+21674000000','cabinet_${STAMP}@x.test','7654321/B/M/000',NOW(),NOW());" >/dev/null
ok "clinique avec matricule fiscal 7654321/B/M/000"

login() {
  curl -sS -X POST "$API/auth/sign-in" -H 'Content-Type: application/json' \
    -d "{\"email\":\"test_auto_${1}_${STAMP}@oralign.test\",\"password\":\"$PW\"}" \
    | jget 'o.authToken && o.authToken.accessToken'
}
AT=$(login admin)
DT=$(login dentist)
[ -n "$AT" ] && ok "admin connecte" || { bad "login admin"; exit 1; }
[ -n "$DT" ] && ok "dentiste connecte" || bad "login dentiste"

PATIENT_ID=$(db1 "INSERT INTO \"Patient\" (id,\"fullName\",\"doctorId\",\"createdAt\",\"updatedAt\") VALUES (gen_random_uuid(),'TEST_AUTO_PATIENT','$DOCTOR_ID',NOW(),NOW()) RETURNING id;")
ORDER_ID=$(db1 "INSERT INTO \"DentalOrder\" (id,\"orderCode\",\"doctorId\",\"patientId\",status,\"createdAt\",\"updatedAt\") VALUES (gen_random_uuid(),'TEST_AUTO_${STAMP}','$DOCTOR_ID','$PATIENT_ID','quotation_sent',NOW(),NOW()) RETURNING id;")
QUOTE_ID=$(db1 "INSERT INTO \"Quotation\" (id,\"orderId\",status,\"tvaRate\",currency,\"packName\",\"totalTtc\",\"createdAt\",\"updatedAt\") VALUES (gen_random_uuid(),'$ORDER_ID','approved',19,'TND','Pack TEST_AUTO',1190,NOW(),NOW()) RETURNING id;")
ok "commande + devis (TVA 19%, pack a 1190 TTC)"

mkinst() { # numero montant -> id
  db1 "INSERT INTO \"QuoteInstallment\" (id,\"quotationId\",\"installmentNumber\",amount,\"availableFrom\",status,\"createdAt\",\"updatedAt\") VALUES (gen_random_uuid(),'$QUOTE_ID',$1,$2,NOW(),'pending',NOW(),NOW()) RETURNING id;"
}
INST1=$(mkinst 1 595)
INST2=$(mkinst 2 595)
ok "2 echeances de 595 TND"

# Le virement bancaire est refuse tant que les coordonnees bancaires de la
# societe ne sont pas renseignees (regle metier: on ne demande pas un
# virement sans dire ou virer). On les seede si besoin, et on ne restaure
# que ce qu'on a change.
BANK_SEEDED=0
HAS_BANK=$(db1 "SELECT CASE WHEN \"bankDetails\" IS NULL OR \"bankDetails\"::text IN ('null','{}') OR \"bankDetails\"::text NOT LIKE '%rib%' THEN 'non' ELSE 'oui' END FROM \"CompanyBillingSettings\" WHERE \"isActive\"=true ORDER BY \"updatedAt\" DESC LIMIT 1;")
if [ "$HAS_BANK" != "oui" ]; then
  $DB -c "UPDATE \"CompanyBillingSettings\" SET \"bankDetails\"='{\"bankName\":\"BIAT\",\"accountName\":\"ORALIGN\",\"rib\":\"08 123 0001234567890 12\",\"iban\":\"TN5908123000123456789012\",\"swift\":\"BIATTNTT\"}'::jsonb WHERE \"isActive\"=true;" >/dev/null
  BANK_SEEDED=1
  ok "coordonnees bancaires seedees (pre-condition du virement)"
else
  ok "coordonnees bancaires deja configurees"
fi

BEFORE=$(db1 "SELECT count(*) FROM \"Invoice\";")
echo "  factures en base avant le test: $BEFORE"

step "2. Virement bancaire: le dentiste declare, l'admin confirme"

S=$(req POST "$API/quotations/$QUOTE_ID/installments/$INST1/declare-bank-transfer" "$DT" '{"bankReference":"TEST_AUTO_VIR_001"}')
PAY1=$(body | jget 'o.id')
[ "$S" = "201" ] || [ "$S" = "200" ] && ok "virement declare ($S)" || bad "declaration -> $S $(body | head -c 250)"

INV_BEFORE_CONFIRM=$(db1 "SELECT count(*) FROM \"Invoice\" WHERE \"paymentId\"='$PAY1';")
[ "$INV_BEFORE_CONFIRM" = "0" ] && ok "aucune facture tant que le virement n'est pas confirme" || bad "facture prematuree"

S=$(req POST "$API/admin/payments/$PAY1/confirm" "$AT" '{"notes":"vu sur le releve"}')
[ "$S" = "200" ] || [ "$S" = "201" ] && ok "admin confirme ($S)" || bad "confirmation -> $S $(body | head -c 250)"
settle

INV1=$(db1 "SELECT id FROM \"Invoice\" WHERE \"paymentId\"='$PAY1';")
[ -n "$INV1" ] && ok "facture generee automatiquement apres confirmation" || bad "aucune facture pour le virement"

step "3. Contenu de la facture automatique"

if [ -n "$INV1" ]; then
  ROW=$($DB -c "SELECT \"invoiceNumber\" || '|' || status || '|' || \"clientName\" || '|' || COALESCE(\"clientTaxId\",'-') || '|' || \"subTotalHt\" || '|' || \"tvaAmount\" || '|' || \"totalTtc\" FROM \"Invoice\" WHERE id='$INV1';" | head -1 | tr -d '\r')
  IFS='|' read -r NUM ST CLIENT TAXID HT TVA TTC <<< "$ROW"
  echo "  $ROW"

  [ "$ST" = "paid" ] && ok "statut = paid" || bad "statut=$ST"
  [ "$CLIENT" = "Cabinet TEST_AUTO" ] && ok "client = la clinique du praticien" || bad "client=$CLIENT"
  [ "$TAXID" = "7654321/B/M/000" ] && ok "matricule fiscal du client repris" || bad "taxId=$TAXID"

  # 595 TTC a 19% => HT 500.000, TVA 95.000, + 1 de timbre => 596.000
  [ "$HT" = "500.000" ]  && ok "HT = 500.000 (deduit a rebours de 595)" || bad "HT=$HT attendu 500.000"
  [ "$TVA" = "95.000" ]  && ok "TVA = 95.000"                            || bad "TVA=$TVA attendu 95.000"
  [ "$TTC" = "596.000" ] && ok "TTC = 596.000 (595 payes + 1 de timbre)" || bad "TTC=$TTC attendu 596.000"

  NLINES=$(db1 "SELECT count(*) FROM \"InvoiceLine\" WHERE \"invoiceId\"='$INV1';")
  [ "$NLINES" = "1" ] && ok "1 ligne de facture" || bad "lignes=$NLINES"
  DESC=$($DB -c "SELECT description FROM \"InvoiceLine\" WHERE \"invoiceId\"='$INV1';" | head -1 | tr -d '\r')
  echo "  libelle: $DESC"
  case "$DESC" in
    *"Pack TEST_AUTO"*) ok "le libelle nomme le pack" ;;
    *) bad "libelle inattendu: $DESC" ;;
  esac
  case "$DESC" in
    *1*2*) ok "le libelle precise l'echeance (1 sur 2)" ;;
    *) echo "  (echeance non detaillee dans le libelle)" ;;
  esac

  step "4. Un seul numero pour le paiement ET la facture"
  PAYNUM=$(db1 "SELECT COALESCE(\"invoiceNumber\",'(vide)') FROM \"Payment\" WHERE id='$PAY1';")
  [ "$PAYNUM" = "$NUM" ] && ok "paiement et facture partagent $NUM" || bad "paiement=$PAYNUM facture=$NUM"

  step "5. La facture apparait dans /dashboard/invoices"
  S=$(req GET "$API/admin/invoices?search=$NUM" "$AT")
  FOUND=$(body | jget 'o.total')
  { [ "$S" = "200" ] && [ "${FOUND:-0}" -ge 1 ]; } && ok "visible dans la liste admin ($FOUND)" || bad "absente de la liste -> $S/$FOUND"

  step "6. Le PDF de cette facture se genere"
  HTTP=$(curl -sS -o /tmp/auto.pdf -w '%{http_code}' "$API/admin/invoices/$INV1/pdf" -H "Authorization: Bearer $AT")
  MAGIC=$(head -c 4 /tmp/auto.pdf)
  { [ "$HTTP" = "200" ] && [ "$MAGIC" = "%PDF" ]; } && ok "PDF genere ($(wc -c < /tmp/auto.pdf) octets)" || bad "PDF -> $HTTP $MAGIC"
  if command -v pdftotext >/dev/null 2>&1; then
    pdftotext -layout /tmp/auto.pdf /tmp/auto.txt 2>/dev/null
    grep -q "Cabinet TEST_AUTO" /tmp/auto.txt && ok "le PDF nomme la clinique" || bad "clinique absente du PDF"
    grep -q "7654321/B/M/000" /tmp/auto.txt && ok "le PDF imprime le matricule du client" || bad "matricule client absent"
  fi
fi

step "7. Idempotence: rejouer l'evenement ne cree pas de doublon"

S=$(req POST "$API/admin/invoices/backfill" "$AT" '{}')
CREATED=$(body | jget 'o.created')
COUNT_AFTER=$(db1 "SELECT count(*) FROM \"Invoice\" WHERE \"paymentId\"='$PAY1';")
[ "$COUNT_AFTER" = "1" ] && ok "toujours 1 seule facture pour ce paiement" || bad "doublon: $COUNT_AFTER"
# Une seconde confirmation du meme paiement doit etre refusee, pas dupliquer.
req POST "$API/admin/payments/$PAY1/confirm" "$AT" '{"notes":"double clic"}' >/dev/null
settle
COUNT_AFTER2=$(db1 "SELECT count(*) FROM \"Invoice\" WHERE \"paymentId\"='$PAY1';")
[ "$COUNT_AFTER2" = "1" ] && ok "double confirmation: toujours 1 facture" || bad "doublon apres double confirmation: $COUNT_AFTER2"

step "8. Especes: meme traitement"

S=$(req POST "$API/admin/quotations/$QUOTE_ID/installments/$INST2/record-cash" "$AT" '{"receiptNumber":"TEST_AUTO_ESP_001"}')
PAY2=$(body | jget 'o.id')
{ [ "$S" = "200" ] || [ "$S" = "201" ]; } && ok "paiement especes enregistre ($S)" || bad "especes -> $S $(body | head -c 250)"
settle
INV2=$(db1 "SELECT \"invoiceNumber\" FROM \"Invoice\" WHERE \"paymentId\"='$PAY2';")
[ -n "$INV2" ] && ok "facture generee pour les especes ($INV2)" || bad "aucune facture pour les especes"

step "9. Un paiement refuse ne produit AUCUNE facture"

INST3=$(mkinst 3 100)
S=$(req POST "$API/quotations/$QUOTE_ID/installments/$INST3/declare-bank-transfer" "$DT" '{"bankReference":"TEST_AUTO_VIR_KO"}')
PAY3=$(body | jget 'o.id')
req POST "$API/admin/payments/$PAY3/reject" "$AT" '{"rejectionReason":"justificatif illisible"}' >/dev/null
settle
INV3=$(db1 "SELECT count(*) FROM \"Invoice\" WHERE \"paymentId\"='$PAY3';")
[ "$INV3" = "0" ] && ok "virement refuse -> aucune facture" || bad "facture creee pour un refus"

step "10. Total des factures creees par ce test"
AFTER=$(db1 "SELECT count(*) FROM \"Invoice\";")
DIFF=$((AFTER - BEFORE))
[ "$DIFF" = "2" ] && ok "exactement 2 factures creees (virement + especes)" || bad "$DIFF factures creees (attendu 2)"

# ─────────────────────────────────────────────────────────────────────
echo
echo "== Nettoyage =="
for t in InvoiceAuditLog InvoiceLine; do
  $DB -c "DELETE FROM \"$t\" WHERE \"invoiceId\" IN (SELECT id FROM \"Invoice\" WHERE \"orderId\"='$ORDER_ID');" >/dev/null 2>&1
done
$DB -c "DELETE FROM \"Invoice\" WHERE \"orderId\"='$ORDER_ID';" >/dev/null 2>&1
$DB -c "DELETE FROM \"Payment\" WHERE \"orderId\"='$ORDER_ID';" >/dev/null 2>&1
$DB -c "DELETE FROM \"QuoteStepBatch\" WHERE \"quotationId\"='$QUOTE_ID';" >/dev/null 2>&1
$DB -c "DELETE FROM \"QuoteInstallment\" WHERE \"quotationId\"='$QUOTE_ID';" >/dev/null 2>&1
$DB -c "DELETE FROM \"Quotation\" WHERE id='$QUOTE_ID';" >/dev/null 2>&1
$DB -c "DELETE FROM \"DentalOrder\" WHERE id='$ORDER_ID';" >/dev/null 2>&1
$DB -c "DELETE FROM \"Patient\" WHERE id='$PATIENT_ID';" >/dev/null 2>&1
$DB -c "DELETE FROM \"DentistProfile\" WHERE \"userId\"='$DOCTOR_ID';" >/dev/null 2>&1
$DB -c "DELETE FROM \"Notification\" WHERE \"recipientId\" IN ('$ADMIN_ID','$DOCTOR_ID');" >/dev/null 2>&1
$DB -c "DELETE FROM \"User\" WHERE id IN ('$ADMIN_ID','$DOCTOR_ID');" >/dev/null 2>&1
if [ "$BANK_SEEDED" = "1" ]; then
  $DB -c "UPDATE \"CompanyBillingSettings\" SET \"bankDetails\"=NULL WHERE \"isActive\"=true;" >/dev/null 2>&1
fi
echo "  artefacts supprimes"

echo
echo "== Resultat =="
echo "  PASS: $PASS"
echo "  FAIL: $FAIL"
[ "$FAIL" -eq 0 ] && echo "  OK — facturation automatique conforme" || echo "  ECHEC — voir ci-dessus"
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
