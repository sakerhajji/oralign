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

STRANGER_ID=$(db1 "INSERT INTO \"User\" (id,\"fullName\",email,\"passwordHash\",role,\"isActive\",\"isEmailVerified\",\"verificationStatus\",\"createdAt\",\"updatedAt\") VALUES (gen_random_uuid(),'TEST_LZIP_STRANGER','test_lzip_stranger_${STAMP}@oralign.test','$HASH','dentist',true,true,'approved',NOW(),NOW()) RETURNING id;")
DT=$(curl -sS -X POST "$API/auth/sign-in" -H 'Content-Type: application/json' -d "{\"email\":\"test_lzip_doc_${STAMP}@oralign.test\",\"password\":\"$PW\"}" | jget 'o.authToken && o.authToken.accessToken')
ST=$(curl -sS -X POST "$API/auth/sign-in" -H 'Content-Type: application/json' -d "{\"email\":\"test_lzip_stranger_${STAMP}@oralign.test\",\"password\":\"$PW\"}" | jget 'o.authToken && o.authToken.accessToken')
[ -n "$DT" ] && ok "dentiste proprietaire connecte" || bad "login dentiste"
[ -n "$ST" ] && ok "dentiste etranger connecte" || bad "login etranger"

PATIENT_ID=$(db1 "INSERT INTO \"Patient\" (id,\"fullName\",\"doctorId\",\"createdAt\",\"updatedAt\") VALUES (gen_random_uuid(),'TEST_LZIP_PATIENT','$DOCTOR_ID',NOW(),NOW()) RETURNING id;")
ORDER_ID=$(db1 "INSERT INTO \"DentalOrder\" (id,\"orderCode\",\"doctorId\",\"patientId\",status,\"createdAt\",\"updatedAt\") VALUES (gen_random_uuid(),'TEST_LZIP_${STAMP}','$DOCTOR_ID','$PATIENT_ID','submitted',NOW(),NOW()) RETURNING id;")
ok "commande=$ORDER_ID"

# Trois fichiers reels sous le repertoire de la commande, dans les trois
# categories qui nous interessent: droite, gauche, other (CBCT).
# De VRAIES images 1x1 pour les photos (la fiche les INTEGRE desormais),
# plus un pseudo-original de 3 Mo pour prouver le plafond d'integration.
docker compose -p oralign-app exec -T backend node -e "
const fs=require('fs'),zlib=require('zlib');
// PNG 1x1 minimal d'une couleur donnee — trois couleurs differentes pour
// que Chromium n'en deduplique pas les objets image dans le PDF.
function crc32(buf){let t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}let c=0xFFFFFFFF;for(const b of buf)c=t[(c^b)&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(td));return Buffer.concat([len,td,crc])}
function png(r,g,b){const sig=Buffer.from([137,80,78,71,13,10,26,10]);const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1,0);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=2;const idat=zlib.deflateSync(Buffer.from([0,r,g,b]));return Buffer.concat([sig,chunk('IHDR',ihdr),chunk('IDAT',idat),chunk('IEND',Buffer.alloc(0))])}
fs.mkdirSync('/app/uploads/orders/$ORDER_ID/x',{recursive:true});
fs.writeFileSync('/app/uploads/orders/$ORDER_ID/x/cote-droit.png',png(200,40,40));
fs.writeFileSync('/app/uploads/orders/$ORDER_ID/x/cote-gauche.png',png(40,160,60));
fs.writeFileSync('/app/uploads/orders/$ORDER_ID/x/pano.png',png(40,80,200));
fs.writeFileSync('/app/uploads/orders/$ORDER_ID/x/lourde.png',Buffer.concat([png(120,120,120),Buffer.alloc(3*1024*1024)]));
fs.writeFileSync('/app/uploads/orders/$ORDER_ID/x/scan-cbct.zip',Buffer.from('DICOMZIP'));
// Un STL binaire minimal (cube 12 triangles) pour l'apercu 3D.
const tris=[];const q=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
const faces=[[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]];
for(const f of faces){tris.push([q[f[0]],q[f[1]],q[f[2]]]);tris.push([q[f[0]],q[f[2]],q[f[3]]]);}
const stl=Buffer.alloc(84+tris.length*50);stl.writeUInt32LE(tris.length,80);
tris.forEach((t,i)=>{const o=84+i*50+12;for(let v=0;v<3;v++)for(let c=0;c<3;c++)stl.writeFloatLE(t[v][c]*20,o+(v*3+c)*4);});
fs.writeFileSync('/app/uploads/orders/$ORDER_ID/x/arcade.stl',stl);
console.log('fichiers seed ecrits');" 2>&1 | tr -d '\r' | tail -1
mkfile() { # category originalName relName mime
  db1 "INSERT INTO \"OrderFile\" (id,\"orderId\",category,\"originalName\",\"fileName\",\"relativePath\",\"mimeType\",size,\"createdAt\") VALUES (gen_random_uuid(),'$ORDER_ID','$1','$2','$2','orders/$ORDER_ID/x/$3','${4:-application/octet-stream}',6,NOW()) RETURNING id;"
}
F_RIGHT=$(mkfile right_photo photo-droite.png cote-droit.png image/png)
F_LEFT=$(mkfile left_photo photo-gauche.png cote-gauche.png image/png)
F_PANO=$(mkfile orthopantomography panoramique.png pano.png image/png)
F_HEAVY=$(mkfile front_photo enorme-photo.png lourde.png image/png)
F_OTHER=$(mkfile other cbct-dicom.zip scan-cbct.zip)
F_STL=$(mkfile stl arcade-sup.stl arcade.stl model/stl)
ok "6 fichiers: right/left/pano/front(3Mo)/other/stl"

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
IPR1=$(db1 "INSERT INTO \"TreatmentPlanIpr\" (id,\"treatmentPlanId\",\"fromTooth\",\"toTooth\",value,note,\"createdAt\",\"updatedAt\") VALUES (gen_random_uuid(),'$PLAN_ID',11,21,'0.20','3','$(date -u +%Y-%m-%dT%H:%M:%SZ)',NOW()) RETURNING id;")
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
echo "$LISTING_FR" | grep "PHOTO DENTS GAUCHE/" | grep -q "photo-droite.png" \
  && ok "SWAP: le fichier right_photo est dans PHOTO DENTS GAUCHE" \
  || bad "swap manquant (right_photo pas dans GAUCHE)"
echo "$LISTING_FR" | grep "PHOTO DENTS DROITE/" | grep -q "photo-gauche.png" \
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
echo "$LISTING_EN" | grep "LEFT TEETH PHOTO/" | grep -q "photo-droite.png" \
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
  tr -d ' ' < "$T" | grep -qi "IPR&" && ok "odontogramme 'IPR & etapes' present" || bad "odontogramme IPR absent"
  grep -q "0.20" "$T" && ok "valeur IPR 0.20 mm sur l'odontogramme" || bad "valeur 0.20 absente"
  grep -q "0.15" "$T" && ok "valeur IPR 0.15 mm sur l'odontogramme" || bad "valeur 0.15 absente"
  grep -qi "Tableau des mouvements" "$T" && ok "bloc image 'Tableau des mouvements' present" || bad "bloc mouvements absent"
  grep -q "TEST_LZIP_DESIGNER" "$T" && ok "concepteur du plan imprime" || bad "concepteur absent"
else
  bad "fiche introuvable dans le zip"
fi

# ─────────────────────────────────────────────────────────────────────
step "4b. La fiche INTEGRE les photos cliniques"

if [ -s "$SHEET" ]; then
  # Les libelles de la grille photos, avec le swap droite/gauche.
  tr -d ' ' < "$T" | grep -qi "Photoscliniques" && ok "section Photos cliniques presente" || bad "section photos absente"
  grep -q "Photo dents gauche" "$T" && ok "legende 'Photo dents gauche' (swap) presente" || bad "legende gauche absente"
  grep -q "Photo dents droite" "$T" && ok "legende 'Photo dents droite' (swap) presente" || bad "legende droite absente"
  grep -qi "panoramique" "$T" && ok "legende radio panoramique presente" || bad "legende pano absente"
  # L'original de 3 Mo n'est PAS integre: liste par son nom a la place.
  grep -q "enorme-photo.png" "$T" && ok "photo de 3 Mo listee mais non integree (plafond)" || bad "plafond 2 Mo non applique"
  # L'apercu du scan 3D est integre en tete de la grille.
  grep -qi "Scan 3D" "$T" && ok "apercu 'Scan 3D' present dans la grille" || bad "apercu STL absent"
  # Le PDF contient bien des images embarquees (data URIs -> objets image).
  IMGS=$(strings "$SHEET" 2>/dev/null | grep -c "/Subtype */Image" || true)
  [ "${IMGS:-0}" -ge 4 ] && ok "au moins 4 images embarquees dans le PDF ($IMGS)" || bad "images embarquees: $IMGS (attendu >= 4)"
else
  bad "fiche absente pour l'etape photos"
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
step "6. Route directe /sheet: fiche seule, dentiste proprietaire inclus"

# Le dentiste PROPRIETAIRE telecharge sa fiche (contrairement au ZIP labo).
S=$(curl -sS -o "$WORK/sheet-doc.pdf" -w '%{http_code}' "$API/orders/$ORDER_ID/sheet?lang=fr" -H "Authorization: Bearer $DT")
MAGIC=$(head -c 4 "$WORK/sheet-doc.pdf")
{ [ "$S" = "200" ] && [ "$MAGIC" = "%PDF" ]; } && ok "dentiste proprietaire -> 200 (PDF)" || bad "sheet dentiste -> $S $MAGIC"

# Un dentiste ETRANGER est refuse (pas de fuite d'existence: 403/404).
S=$(curl -sS -o /dev/null -w '%{http_code}' "$API/orders/$ORDER_ID/sheet" -H "Authorization: Bearer $ST")
{ [ "$S" = "403" ] || [ "$S" = "404" ]; } && ok "dentiste etranger -> $S" || bad "etranger -> $S (attendu 403/404)"

# Le ZIP complet, lui, reste interdit au dentiste (planner-only).
S=$(curl -sS -o /dev/null -w '%{http_code}' "$API/orders/$ORDER_ID/download-all" -H "Authorization: Bearer $DT")
[ "$S" = "403" ] && ok "le ZIP labo reste interdit au dentiste (403)" || bad "zip dentiste -> $S"

# La fiche directe porte bien le plan approuve.
pdftotext -layout "$WORK/sheet-doc.pdf" "$WORK/sheet-doc.txt" 2>/dev/null
grep -q "TEST_LZIP_PLAN_APPROUVE" "$WORK/sheet-doc.txt" && ok "la fiche directe porte le plan approuve" || bad "plan absent de la fiche directe"

# L'odontogramme vectoriel a remplace le sprite de 2 Mo: la fiche doit
# etre LEGERE (le sprite seul pesait ~2 Mo une fois inline).
SIZE=$(wc -c < "$WORK/sheet-doc.pdf")
[ "$SIZE" -lt 1500000 ] && ok "fiche legere: $SIZE octets (sprite 2 Mo retire)" || bad "fiche encore lourde: $SIZE octets"

# Nom de fichier localise dans Content-Disposition.
CD=$(curl -sS -o /dev/null -D - "$API/orders/$ORDER_ID/sheet?lang=en" -H "Authorization: Bearer $AT" | grep -iE "^content-disposition:" | head -1)
echo "$CD" | grep -q "ORDER%20SHEET" && ok "Content-Disposition anglais (ORDER SHEET)" || bad "disposition: $CD"

# ─────────────────────────────────────────────────────────────────────
echo
echo "== Nettoyage =="
$DB -c "DELETE FROM \"TreatmentPlanIpr\" WHERE id IN ('$IPR1','$IPR2');" >/dev/null 2>&1
$DB -c "DELETE FROM \"TreatmentPlan\" WHERE id IN ('$PLAN_ID','$DRAFT_PLAN');" >/dev/null 2>&1
$DB -c "DELETE FROM \"OrderFile\" WHERE id IN ('$F_RIGHT','$F_LEFT','$F_PANO','$F_HEAVY','$F_OTHER','$F_STL');" >/dev/null 2>&1
$DB -c "DELETE FROM \"DentalOrder\" WHERE id IN ('$ORDER_ID','$ORDER2');" >/dev/null 2>&1
$DB -c "DELETE FROM \"Patient\" WHERE id='$PATIENT_ID';" >/dev/null 2>&1
$DB -c "DELETE FROM \"User\" WHERE id IN ('$ADMIN_ID','$DOCTOR_ID','$STRANGER_ID');" >/dev/null 2>&1
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
