#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# scripts/test-lab-zip-i18n.sh
#
# Lab ZIP export + enriched order sheet, against the running stack:
#
#   folders FR    → PHOTO DENTS GAUCHE / DROITE (SWAPPED vs category:
#                   intraoral side photos are mirrored), CBCT DICOM for
#                   the `other` category, FICHE COMMANDE - <code>.pdf
#   folders EN    → LEFT/RIGHT TEETH PHOTO (same swap), CBCT DICOM,
#                   ORDER SHEET - <code>.pdf
#   swap proof    → the file UPLOADED as right_photo lands in the
#                   LEFT-labelled folder, and vice versa
#   order sheet   → carries the APPROVED treatment plan: name, version,
#                   aligner counts, the IPR table, and the movement /
#                   dental-table images; a draft plan must NOT appear
#
# Artefacts are tagged TEST_LZIP_* and removed at the end.
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

STAMP=$(date +%s | tail -c 7)
PW='TestLzip_2026!'
WORK=$(mktemp -d)

step "1. Jeu de donnees"

HASH=$(docker compose -p oralign-app exec -T backend node -e \
  "const b=require('bcryptjs');b.hash(process.argv[1],12).then(h=>process.stdout.write(h))" "$PW" 2>/dev/null | tr -d '\r')
ADMIN_ID=$(db1 "INSERT INTO \"User\" (id,\"fullName\",email,\"passwordHash\",role,\"isActive\",\"isEmailVerified\",\"verificationStatus\",\"createdAt\",\"updatedAt\") VALUES (gen_random_uuid(),'TEST_LZIP_ADMIN','test_lzip_admin_${STAMP}@oralign.test','$HASH','admin',true,true,'approved',NOW(),NOW()) RETURNING id;")
DOCTOR_ID=$(db1 "INSERT INTO \"User\" (id,\"fullName\",email,\"passwordHash\",role,\"isActive\",\"isEmailVerified\",\"verificationStatus\",\"createdAt\",\"updatedAt\") VALUES (gen_random_uuid(),'TEST_LZIP_DOCTOR','test_lzip_doc_${STAMP}@oralign.test','$HASH','dentist',true,true,'approved',NOW(),NOW()) RETURNING id;")
AT=$(curl -sS -X POST "$API/auth/sign-in" -H 'Content-Type: application/json' \
  -d "{\"email\":\"test_lzip_admin_${STAMP}@oralign.test\",\"password\":\"$PW\"}" | jget 'o.authToken && o.authToken.accessToken')
[ -n "$AT" ] && ok "admin connecte" || { bad "login"; exit 1; }

PATIENT_ID=$(db1 "INSERT INTO \"Patient\" (id,\"fullName\",\"doctorId\",\"createdAt\",\"updatedAt\") VALUES (gen_random_uuid(),'TEST_LZIP_PATIENT','$DOCTOR_ID',NOW(),NOW()) RETURNING id;")
ORDER_ID=$(db1 "INSERT INTO \"DentalOrder\" (id,\"orderCode\",\"doctorId\",\"patientId\",status,\"createdAt\",\"updatedAt\") VALUES (gen_random_uuid(),'TEST_LZIP_${STAMP}','$DOCTOR_ID','$PATIENT_ID','submitted',NOW(),NOW()) RETURNING id;")
ok "commande=$ORDER_ID"

# Trois fichiers reels sous le repertoire de la commande, dans les trois
# categories qui nous interessent: droite, gauche, other (CBCT).
docker compose -p oralign-app exec -T backend sh -c "mkdir -p '/app/uploads/orders/$ORDER_ID/x' && printf 'DROITE' > '/app/uploads/orders/$ORDER_ID/x/cote-droit.jpg' && printf 'GAUCHE' > '/app/uploads/orders/$ORDER_ID/x/cote-gauche.jpg' && printf 'DICOMZIP' > '/app/uploads/orders/$ORDER_ID/x/scan-cbct.zip'"
mkfile() { # category originalName relName
  db1 "INSERT INTO \"OrderFile\" (id,\"orderId\",category,\"originalName\",\"fileName\",\"relativePath\",\"mimeType\",size,\"createdAt\") VALUES (gen_random_uuid(),'$ORDER_ID','$1','$2','$2','orders/$ORDER_ID/x/$3','application/octet-stream',6,NOW()) RETURNING id;"
}
F_RIGHT=$(mkfile right_photo photo-droite.jpg cote-droit.jpg)
F_LEFT=$(mkfile left_photo photo-gauche.jpg cote-gauche.jpg)
F_OTHER=$(mkfile other cbct-dicom.zip scan-cbct.zip)
ok "3 fichiers: right_photo, left_photo, other"

# Deux petites images PNG (1x1) pour les tableaux du plan.
docker compose -p oralign-app exec -T backend node -e "
const fs=require('fs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
fs.mkdirSync('/app/uploads/treatment-plans/TEST_LZIP',{recursive:true});
fs.writeFileSync('/app/uploads/treatment-plans/TEST_LZIP/movement.png',png);
fs.writeFileSync('/app/uploads/treatment-plans/TEST_LZIP/dental.png',png);
console.log('png ecrits');" 2>&1 | tr -d '\r' | tail -1

# Un plan APPROUVE (celui qui doit figurer) + un BROUILLON posterieur
# (celui qui ne doit PAS figurer).
PLAN_ID=$(db1 "INSERT INTO \"TreatmentPlan\" (id,\"orderId\",version,name,status,\"totalUpperAligners\",\"totalLowerAligners\",\"createdByName\",\"approvedAt\",\"movementTableImagePath\",\"dentalTreatmentTableImagePath\",\"createdAt\",\"updatedAt\") VALUES (gen_random_uuid(),'$ORDER_ID',1,'TEST_LZIP_PLAN_APPROUVE','approved',32,30,'TEST_LZIP_DESIGNER',NOW(),'treatment-plans/TEST_LZIP/movement.png','treatment-plans/TEST_LZIP/dental.png',NOW(),NOW()) RETURNING id;")
DRAFT_PLAN=$(db1 "INSERT INTO \"TreatmentPlan\" (id,\"orderId\",version,name,status,\"createdAt\",\"updatedAt\") VALUES (gen_random_uuid(),'$ORDER_ID',2,'TEST_LZIP_PLAN_BROUILLON','pending',NOW(),NOW()) RETURNING id;")
IPR1=$(db1 "INSERT INTO \"TreatmentPlanIpr\" (id,\"treatmentPlanId\",\"fromTooth\",\"toTooth\",value,note,\"createdAt\",\"updatedAt\") VALUES (gen_random_uuid(),'$PLAN_ID',11,21,'0.20','contact median','$(date -u +%Y-%m-%dT%H:%M:%SZ)',NOW()) RETURNING id;")
IPR2=$(db1 "INSERT INTO \"TreatmentPlanIpr\" (id,\"treatmentPlanId\",\"fromTooth\",\"toTooth\",value,\"createdAt\",\"updatedAt\") VALUES (gen_random_uuid(),'$PLAN_ID',41,31,'0.15',NOW(),NOW()) RETURNING id;")
ok "plan approuve (32/30 aligneurs, 2 IPR) + brouillon v2"

# ─────────────────────────────────────────────────────────────────────
step "2. ZIP en FRANCAIS"

curl -sS -o "$WORK/fr.zip" "$API/orders/$ORDER_ID/download-all?lang=fr" -H "Authorization: Bearer $AT"
sleep 1
LISTING_FR=$(unzip -l "$WORK/fr.zip" 2>/dev/null)
echo "$LISTING_FR" | grep -q "CBCT DICOM/" && ok "dossier 'other' -> CBCT DICOM" || bad "CBCT DICOM absent: $(echo "$LISTING_FR" | tail -8)"
echo "$LISTING_FR" | grep -q "PHOTO DENTS GAUCHE/" && ok "dossier PHOTO DENTS GAUCHE present" || bad "PHOTO DENTS GAUCHE absent"
echo "$LISTING_FR" | grep -q "PHOTO DENTS DROITE/" && ok "dossier PHOTO DENTS DROITE present" || bad "PHOTO DENTS DROITE absent"
echo "$LISTING_FR" | grep -q "FICHE COMMANDE - TEST_LZIP_${STAMP}.pdf" && ok "fiche nommee en francais" || bad "fiche FR absente"
echo "$LISTING_FR" | grep -qE "(^|\s)(right_photo|left_photo|other)/" && bad "noms de categorie bruts encore presents" || ok "aucun nom de categorie brut"

# LE SWAP: le fichier uploade en right_photo doit etre dans PHOTO DENTS GAUCHE.
echo "$LISTING_FR" | grep "PHOTO DENTS GAUCHE/" | grep -q "photo-droite.jpg" \
  && ok "SWAP: le fichier right_photo est dans PHOTO DENTS GAUCHE" \
  || bad "swap manquant (right_photo pas dans GAUCHE)"
echo "$LISTING_FR" | grep "PHOTO DENTS DROITE/" | grep -q "photo-gauche.jpg" \
  && ok "SWAP: le fichier left_photo est dans PHOTO DENTS DROITE" \
  || bad "swap manquant (left_photo pas dans DROITE)"
echo "$LISTING_FR" | grep "CBCT DICOM/" | grep -q "cbct-dicom.zip" \
  && ok "le bundle CBCT est dans CBCT DICOM" || bad "bundle CBCT mal range"

# ─────────────────────────────────────────────────────────────────────
step "3. ZIP en ANGLAIS"

curl -sS -o "$WORK/en.zip" "$API/orders/$ORDER_ID/download-all?lang=en" -H "Authorization: Bearer $AT"
sleep 1
LISTING_EN=$(unzip -l "$WORK/en.zip" 2>/dev/null)
echo "$LISTING_EN" | grep -q "LEFT TEETH PHOTO/" && ok "dossier LEFT TEETH PHOTO present" || bad "LEFT TEETH PHOTO absent"
echo "$LISTING_EN" | grep -q "RIGHT TEETH PHOTO/" && ok "dossier RIGHT TEETH PHOTO present" || bad "RIGHT TEETH PHOTO absent"
echo "$LISTING_EN" | grep -q "CBCT DICOM/" && ok "CBCT DICOM aussi en anglais" || bad "CBCT DICOM absent en EN"
echo "$LISTING_EN" | grep -q "ORDER SHEET - TEST_LZIP_${STAMP}.pdf" && ok "fiche nommee en anglais" || bad "fiche EN absente"
echo "$LISTING_EN" | grep "LEFT TEETH PHOTO/" | grep -q "photo-droite.jpg" \
  && ok "SWAP identique en anglais" || bad "swap EN manquant"

# Sans ?lang= -> francais par defaut.
curl -sS -o "$WORK/defaut.zip" "$API/orders/$ORDER_ID/download-all" -H "Authorization: Bearer $AT"
sleep 1
unzip -l "$WORK/defaut.zip" 2>/dev/null | grep -q "FICHE COMMANDE" \
  && ok "sans ?lang= -> francais par defaut" || bad "defaut non francais"

# ─────────────────────────────────────────────────────────────────────
step "4. La fiche porte le plan APPROUVE"

( cd "$WORK" && unzip -o -qq fr.zip "FICHE COMMANDE - TEST_LZIP_${STAMP}.pdf" )
SHEET="$WORK/FICHE COMMANDE - TEST_LZIP_${STAMP}.pdf"
if [ -s "$SHEET" ]; then
  ok "fiche extraite ($(wc -c < "$SHEET") octets)"
  pdftotext -layout "$SHEET" "$WORK/sheet.txt" 2>/dev/null
  T="$WORK/sheet.txt"
  tr -d " " < "$T" | grep -qiE "Plandetraitement|Approvedtreatmentplan" && ok "section plan de traitement presente (titre)" || bad "section plan absente"
  grep -q "TEST_LZIP_PLAN_APPROUVE" "$T" && ok "nom du plan approuve imprime" || bad "nom du plan absent"
  grep -q "TEST_LZIP_PLAN_BROUILLON" "$T" && bad "le BROUILLON figure sur la fiche (interdit)" || ok "le brouillon v2 n'apparait pas"
  grep -qE "32" "$T" && ok "aligneurs maxillaire: 32" || bad "compteur 32 absent"
  grep -qE "30" "$T" && ok "aligneurs mandibule: 30" || bad "compteur 30 absent"
  grep -qE "11.*21" "$T" && ok "IPR 11 -> 21 imprime" || bad "IPR 11->21 absent"
  grep -q "0.20" "$T" && ok "valeur IPR 0.20 mm imprimee" || bad "valeur IPR absente"
  grep -q "contact median" "$T" && ok "note IPR imprimee" || bad "note IPR absente"
  grep -qi "Tableau des mouvements" "$T" && ok "bloc image 'Tableau des mouvements' present" || bad "bloc mouvements absent"
  grep -q "TEST_LZIP_DESIGNER" "$T" && ok "concepteur du plan imprime" || bad "concepteur absent"
else
  bad "fiche introuvable dans le zip"
fi

# ─────────────────────────────────────────────────────────────────────
step "5. Une commande SANS plan approuve n'a pas la section"

ORDER2=$(db1 "INSERT INTO \"DentalOrder\" (id,\"orderCode\",\"doctorId\",\"patientId\",status,\"createdAt\",\"updatedAt\") VALUES (gen_random_uuid(),'TEST_LZIP2_${STAMP}','$DOCTOR_ID','$PATIENT_ID','submitted',NOW(),NOW()) RETURNING id;")
curl -sS -o "$WORK/fr2.zip" "$API/orders/$ORDER2/download-all?lang=fr" -H "Authorization: Bearer $AT"
sleep 1
( cd "$WORK" && unzip -o -qq fr2.zip "FICHE COMMANDE - TEST_LZIP2_${STAMP}.pdf" 2>/dev/null )
SHEET2="$WORK/FICHE COMMANDE - TEST_LZIP2_${STAMP}.pdf"
if [ -s "$SHEET2" ]; then
  pdftotext -layout "$SHEET2" "$WORK/sheet2.txt" 2>/dev/null
  tr -d " " < "$WORK/sheet2.txt" | grep -qiE "Plandetraitement|Approvedtreatmentplan" \
    && bad "section plan presente sans plan approuve" \
    || ok "pas de section plan quand rien n'est approuve"
else
  bad "fiche de la 2e commande introuvable"
fi

# ─────────────────────────────────────────────────────────────────────
echo
echo "== Nettoyage =="
$DB -c "DELETE FROM \"TreatmentPlanIpr\" WHERE id IN ('$IPR1','$IPR2');" >/dev/null 2>&1
$DB -c "DELETE FROM \"TreatmentPlan\" WHERE id IN ('$PLAN_ID','$DRAFT_PLAN');" >/dev/null 2>&1
$DB -c "DELETE FROM \"OrderFile\" WHERE id IN ('$F_RIGHT','$F_LEFT','$F_OTHER');" >/dev/null 2>&1
$DB -c "DELETE FROM \"DentalOrder\" WHERE id IN ('$ORDER_ID','$ORDER2');" >/dev/null 2>&1
$DB -c "DELETE FROM \"Patient\" WHERE id='$PATIENT_ID';" >/dev/null 2>&1
$DB -c "DELETE FROM \"User\" WHERE id IN ('$ADMIN_ID','$DOCTOR_ID');" >/dev/null 2>&1
if [ -n "${ORDER_ID:-}" ]; then
  docker compose -p oralign-app exec -T backend sh -c "rm -rf '/app/uploads/orders/$ORDER_ID'" >/dev/null 2>&1 || true
fi
docker compose -p oralign-app exec -T backend sh -c "rm -rf /app/uploads/treatment-plans/TEST_LZIP" >/dev/null 2>&1 || true
rm -rf "$WORK"
echo "  artefacts supprimes"

echo
echo "== Resultat =="
echo "  PASS: $PASS"
echo "  FAIL: $FAIL"
[ "$FAIL" -eq 0 ] && echo "  OK — export ZIP localise + fiche enrichie conformes" || echo "  ECHEC — voir ci-dessus"
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
