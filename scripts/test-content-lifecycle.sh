#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# scripts/test-content-lifecycle.sh
#
# Deletion lifecycle for the CONTENT entities — community stories and
# blog posts. These are the two places where a true permanent delete is
# legitimate (nothing clinical or financial depends on them, and a
# community story carries personal data that must be erasable), so the
# suite proves the guard rails hold anyway:
#
#   archive        → deletedAt set, gone from the normal list
#   trash view     → ?includeDeleted=true returns ONLY the archived rows
#   restore        → deletedAt cleared, back in the normal list
#   trash-first    → permanent delete of a LIVE row → 400 NOT_ARCHIVED
#   permanent      → row + media rows + files + directory gone (community)
#   shared media   → a purged blog post does NOT take BlogImage with it
#   permissions    → a dentist gets 403 on every admin route
#
# Artefacts are tagged TEST_CONTENT_* and removed by the EXIT trap.
# ─────────────────────────────────────────────────────────────────────

set -u
PASS=0
FAIL=0

DB="docker compose -p oralign-app exec -T postgres psql -U oralign -d oralign_db -t -A"
API="http://127.0.0.1:3000/api"

db_insert() { $DB -c "$1" 2>&1 | head -1 | tr -d '\r\n[:space:]'; }
db_val()    { $DB -c "$1" 2>/dev/null | head -1 | tr -d '\r\n[:space:]'; }
# psql prints errors on stdout, so a failed INSERT silently yields an
# "ERROR:…" string instead of an id. Every seed is gated on this.
is_uuid()   { [[ "$1" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; }

TEST_IDS_FILE="$(mktemp)"; echo "" > "$TEST_IDS_FILE"

log()  { echo "$*"; }
ok()   { PASS=$((PASS+1)); log "  ✓ $*"; }
bad()  { FAIL=$((FAIL+1)); log "  ✗ $*"; }
step() { log ""; log "── $* ──"; }
remember() { printf '%s\t%s\n' "$1" "$2" >> "$TEST_IDS_FILE"; }

cleanup() {
  step "Cleanup — removing every TEST_CONTENT_ artefact (children first)"
  local lines=()
  while IFS= read -r line; do [ -n "$line" ] && lines+=("$line"); done < "$TEST_IDS_FILE"
  for ((i = ${#lines[@]} - 1; i >= 0; i--)); do
    local entry="${lines[i]}"; local table="${entry%%$'\t'*}"; local id="${entry#*$'\t'}"
    [ -z "$table" ] || [ -z "$id" ] && continue
    if $DB -c "DELETE FROM \"$table\" WHERE id = '$id';" >/dev/null 2>&1; then
      log "  · deleted from $table: $id"
    else
      log "  · skipped (already gone) $table: $id"
    fi
  done
  # Guarded + quoted by the OUTER shell: an empty id inside the container
  # would expand to /app/uploads/community/ and wipe every story's media.
  for id in "${SUB_A:-}" "${SUB_B:-}"; do
    if [ -n "$id" ]; then
      docker compose -p oralign-app exec -T backend sh -c "rm -rf '/app/uploads/community/$id'" >/dev/null 2>&1 || true
    fi
  done
  rm -f "$TEST_IDS_FILE"
}
trap cleanup EXIT

jget() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const o=JSON.parse(d);const v=$1;process.stdout.write(v==null?'':String(v))}catch(e){}})"; }
req() { # method url token [data]
  local m="$1" u="$2" t="$3" d="${4:-}"
  if [ -n "$d" ]; then
    curl -sS -o /tmp/content_body -w '%{http_code}' -X "$m" "$u" -H "Authorization: Bearer $t" -H "Content-Type: application/json" -d "$d"
  else
    curl -sS -o /tmp/content_body -w '%{http_code}' -X "$m" "$u" -H "Authorization: Bearer $t"
  fi
}
body() { cat /tmp/content_body; }

# ─────────────────────────────────────────────────────────────────────
step "1. Provision admin + doctor, seed two stories and two posts"

PASSWORD='TestContent_2026!'
PW_HASH=$(docker compose -p oralign-app exec -T backend node -e \
  "const b=require('bcryptjs');b.hash(process.argv[1],12).then(h=>process.stdout.write(h))" \
  "$PASSWORD" 2>/dev/null | tr -d '\r')
[ -n "$PW_HASH" ] && ok "password hashed" || { bad "bcrypt failed"; exit 1; }
STAMP="$(date +%s%N | tail -c 10)"

mkuser() { # role fullName -> id
  db_insert "INSERT INTO \"User\" (id, \"fullName\", email, \"passwordHash\", role, \"isActive\", \"isEmailVerified\", \"verificationStatus\", \"createdAt\", \"updatedAt\")
    VALUES (gen_random_uuid(), '$2', 'test_content_${1}_${STAMP}@oralign.test', '$PW_HASH', '$1', true, true, 'approved', NOW(), NOW()) RETURNING id;"
}
ADMIN_ID=$(mkuser admin TEST_CONTENT_ADMIN);    remember User "$ADMIN_ID";  is_uuid "$ADMIN_ID" && ok "admin=$ADMIN_ID" || { bad "admin seed -> $ADMIN_ID"; exit 1; }
DOCTOR_ID=$(mkuser dentist TEST_CONTENT_DOCTOR);remember User "$DOCTOR_ID"; is_uuid "$DOCTOR_ID" && ok "doctor=$DOCTOR_ID" || { bad "doctor seed -> $DOCTOR_ID"; exit 1; }

login() { # email -> token  (sign-in wraps the token in `authToken`)
  curl -sS -X POST "$API/auth/sign-in" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}" | jget "o.authToken&&o.authToken.accessToken"
}
ADMIN_TOKEN=$(login "test_content_admin_${STAMP}@oralign.test")
DOCTOR_TOKEN=$(login "test_content_dentist_${STAMP}@oralign.test")
[ -n "$ADMIN_TOKEN" ] && ok "admin logged in" || { bad "admin login failed"; exit 1; }
[ -n "$DOCTOR_TOKEN" ] && ok "doctor logged in" || bad "doctor login failed"

mkstory() { # firstName -> id
  db_insert "INSERT INTO \"CommunitySubmission\"
    (id, format, status, \"firstName\", \"lastNameInitial\", phone, email, role, \"treatmentStatus\", why, journey, consent, \"createdAt\", \"updatedAt\")
    VALUES (gen_random_uuid(), 'photo', 'approved', '$1', 'X', '+21600000000', 'test_content_${STAMP}@oralign.test',
            'adult', 'completed', 'TEST_CONTENT why', 'TEST_CONTENT journey', true, NOW(), NOW()) RETURNING id;"
}
SUB_A=$(mkstory TEST_CONTENT_A); remember CommunitySubmission "$SUB_A"; is_uuid "$SUB_A" && ok "story A=$SUB_A" || { bad "story A seed -> $SUB_A"; exit 1; }
SUB_B=$(mkstory TEST_CONTENT_B); remember CommunitySubmission "$SUB_B"; is_uuid "$SUB_B" && ok "story B (stays live)=$SUB_B" || { bad "story B seed -> $SUB_B"; exit 1; }

# Two media rows + real files for story A, so the purge has something to reclaim.
docker compose -p oralign-app exec -T backend sh -c "mkdir -p '/app/uploads/community/$SUB_A' && echo hi > '/app/uploads/community/$SUB_A/one.jpg' && echo hi > '/app/uploads/community/$SUB_A/two.jpg'"
for f in one two; do
  MID=$(db_insert "INSERT INTO \"CommunitySubmissionMedia\" (id, \"submissionId\", \"relativePath\", \"mimeType\", \"sizeBytes\", \"createdAt\")
    VALUES (gen_random_uuid(), '$SUB_A', 'uploads/community/$SUB_A/$f.jpg', 'image/jpeg', 3, NOW()) RETURNING id;")
  remember CommunitySubmissionMedia "$MID"
done
MEDIA_N=$(db_val "SELECT count(*) FROM \"CommunitySubmissionMedia\" WHERE \"submissionId\"='$SUB_A';")
[ "$MEDIA_N" = "2" ] && ok "story A has 2 media rows + 2 files" || bad "media seed -> $MEDIA_N"

IMG_ID=$(db_insert "INSERT INTO \"BlogImage\" (id, url, \"originalName\", \"generatedName\", \"mimeType\", \"sizeBytes\", \"createdAt\", \"updatedAt\")
  VALUES (gen_random_uuid(), '/uploads/blog/test_content_${STAMP}.jpg', 'TEST_CONTENT.jpg', 'test_content_${STAMP}.jpg', 'image/jpeg', 3, NOW(), NOW()) RETURNING id;")
remember BlogImage "$IMG_ID"; is_uuid "$IMG_ID" && ok "shared blog image=$IMG_ID" || { bad "BlogImage seed -> $IMG_ID"; exit 1; }

mkpost() { # slugSuffix -> id
  db_insert "INSERT INTO \"Blog\" (id, title, slug, audience, status, \"coverImageId\", \"authorId\", \"authorName\", \"createdAt\", \"updatedAt\")
    VALUES (gen_random_uuid(), '{\"en\":\"TEST_CONTENT post\",\"fr\":\"TEST_CONTENT article\"}'::jsonb,
            'test-content-${STAMP}-$1', 'practitioner', 'draft', '$IMG_ID', '$ADMIN_ID', 'TEST_CONTENT_ADMIN', NOW(), NOW())
    RETURNING id;"
}
POST_A=$(mkpost a); remember Blog "$POST_A"; is_uuid "$POST_A" && ok "post A=$POST_A (cover = shared image)" || { bad "post A seed -> $POST_A"; exit 1; }
POST_B=$(mkpost b); remember Blog "$POST_B"; is_uuid "$POST_B" && ok "post B (stays live)=$POST_B" || { bad "post B seed -> $POST_B"; exit 1; }

# ─────────────────────────────────────────────────────────────────────
step "2. Community — archive hides the story from the normal list"

S=$(req DELETE "$API/admin/community-submissions/$SUB_A" "$ADMIN_TOKEN")
[ "$S" = "200" ] && ok "archive -> 200" || bad "archive -> $S $(body)"
DEL=$(db_val "SELECT \"deletedAt\" IS NOT NULL FROM \"CommunitySubmission\" WHERE id='$SUB_A';")
[ "$DEL" = "t" ] && ok "deletedAt set (row still there)" || bad "deletedAt not set"

req GET "$API/admin/community-submissions?limit=100" "$ADMIN_TOKEN" >/dev/null
if body | grep -q "$SUB_A"; then bad "archived story still in the normal list"; else ok "hidden from the normal admin list"; fi
if body | grep -q "$SUB_B"; then ok "the live story is still listed"; else bad "live story disappeared"; fi

req GET "$API/admin/community-submissions?includeDeleted=true&limit=100" "$ADMIN_TOKEN" >/dev/null
if body | grep -q "$SUB_A"; then ok "trash view returns the archived story"; else bad "trash view missing the archived story"; fi
if body | grep -q "$SUB_B"; then bad "trash view leaked a LIVE story"; else ok "trash view excludes live stories"; fi

step "3. Community — permanent delete is trash-first + admin-only"

S=$(req DELETE "$API/admin/community-submissions/$SUB_B/permanent" "$ADMIN_TOKEN")
CODE=$(body | jget "o.errorCode")
{ [ "$S" = "400" ] && [ "$CODE" = "NOT_ARCHIVED" ]; } \
  && ok "purging a LIVE story -> 400 NOT_ARCHIVED" || bad "live purge -> $S/$CODE $(body)"
STILL=$(db_val "SELECT count(*) FROM \"CommunitySubmission\" WHERE id='$SUB_B';")
[ "$STILL" = "1" ] && ok "the live story is untouched" || bad "live story was destroyed"

S=$(req DELETE "$API/admin/community-submissions/$SUB_A/permanent" "$DOCTOR_TOKEN")
[ "$S" = "403" ] && ok "dentist cannot permanently delete (403)" || bad "dentist purge -> $S"
S=$(req PATCH "$API/admin/community-submissions/$SUB_A/restore" "$DOCTOR_TOKEN")
[ "$S" = "403" ] && ok "dentist cannot restore (403)" || bad "dentist restore -> $S"

step "4. Community — restore brings it back intact"

S=$(req PATCH "$API/admin/community-submissions/$SUB_A/restore" "$ADMIN_TOKEN")
[ "$S" = "200" ] && ok "restore -> 200" || bad "restore -> $S $(body)"
DEL=$(db_val "SELECT \"deletedAt\" IS NULL FROM \"CommunitySubmission\" WHERE id='$SUB_A';")
[ "$DEL" = "t" ] && ok "deletedAt cleared" || bad "deletedAt still set"
MEDIA_N=$(db_val "SELECT count(*) FROM \"CommunitySubmissionMedia\" WHERE \"submissionId\"='$SUB_A';")
[ "$MEDIA_N" = "2" ] && ok "media survived the round trip" || bad "media lost ($MEDIA_N)"
FILES=$(docker compose -p oralign-app exec -T backend sh -c "ls '/app/uploads/community/$SUB_A' 2>/dev/null | wc -l" | tr -d '\r[:space:]')
[ "$FILES" = "2" ] && ok "files still on disk (a restore is complete)" || bad "files gone before the purge ($FILES)"

step "5. Community — permanent delete erases row + media + files"

req DELETE "$API/admin/community-submissions/$SUB_A" "$ADMIN_TOKEN" >/dev/null
S=$(req DELETE "$API/admin/community-submissions/$SUB_A/permanent" "$ADMIN_TOKEN")
[ "$S" = "200" ] && ok "purge an archived story -> 200" || bad "purge -> $S $(body)"
GONE=$(db_val "SELECT count(*) FROM \"CommunitySubmission\" WHERE id='$SUB_A';")
[ "$GONE" = "0" ] && ok "submission row gone" || bad "submission row survived"
MEDIA_N=$(db_val "SELECT count(*) FROM \"CommunitySubmissionMedia\" WHERE \"submissionId\"='$SUB_A';")
[ "$MEDIA_N" = "0" ] && ok "media rows gone" || bad "orphan media rows left ($MEDIA_N)"
DIR=$(docker compose -p oralign-app exec -T backend sh -c "[ -d '/app/uploads/community/$SUB_A' ] && echo yes || echo no" | tr -d '\r[:space:]')
[ "$DIR" = "no" ] && ok "upload directory removed" || bad "upload directory left behind"
S=$(req DELETE "$API/admin/community-submissions/$SUB_A/permanent" "$ADMIN_TOKEN")
[ "$S" = "404" ] && ok "purging it again -> 404" || bad "second purge -> $S"

# ─────────────────────────────────────────────────────────────────────
step "6. Blog — archive / trash view / restore"

S=$(req DELETE "$API/admin/blog/$POST_A" "$ADMIN_TOKEN")
[ "$S" = "200" ] && ok "archive -> 200" || bad "archive -> $S $(body)"
DEL=$(db_val "SELECT \"deletedAt\" IS NOT NULL FROM \"Blog\" WHERE id='$POST_A';")
[ "$DEL" = "t" ] && ok "deletedAt set" || bad "deletedAt not set"

req GET "$API/admin/blog?limit=100" "$ADMIN_TOKEN" >/dev/null
if body | grep -q "$POST_A"; then bad "archived post still in the normal list"; else ok "hidden from the normal list"; fi
req GET "$API/admin/blog?includeDeleted=true&limit=100" "$ADMIN_TOKEN" >/dev/null
if body | grep -q "$POST_A"; then ok "trash view returns it"; else bad "trash view missing the post"; fi

S=$(req PATCH "$API/admin/blog/$POST_A/restore" "$ADMIN_TOKEN")
[ "$S" = "200" ] && ok "restore -> 200" || bad "restore -> $S $(body)"
DEL=$(db_val "SELECT \"deletedAt\" IS NULL FROM \"Blog\" WHERE id='$POST_A';")
[ "$DEL" = "t" ] && ok "deletedAt cleared" || bad "restore did not clear deletedAt"

step "7. Blog — permanent delete: trash-first, and the shared image survives"

S=$(req DELETE "$API/admin/blog/$POST_A/permanent" "$ADMIN_TOKEN")
CODE=$(body | jget "o.errorCode")
{ [ "$S" = "400" ] && [ "$CODE" = "NOT_ARCHIVED" ]; } \
  && ok "purging a LIVE post -> 400 NOT_ARCHIVED" || bad "live purge -> $S/$CODE $(body)"

S=$(req DELETE "$API/admin/blog/$POST_A/permanent" "$DOCTOR_TOKEN")
[ "$S" = "403" ] && ok "dentist cannot purge a post (403)" || bad "dentist purge -> $S"

req DELETE "$API/admin/blog/$POST_A" "$ADMIN_TOKEN" >/dev/null
S=$(req DELETE "$API/admin/blog/$POST_A/permanent" "$ADMIN_TOKEN")
[ "$S" = "200" ] && ok "purge an archived post -> 200" || bad "purge -> $S $(body)"
GONE=$(db_val "SELECT count(*) FROM \"Blog\" WHERE id='$POST_A';")
[ "$GONE" = "0" ] && ok "post row gone" || bad "post row survived"
IMG_LEFT=$(db_val "SELECT count(*) FROM \"BlogImage\" WHERE id='$IMG_ID';")
[ "$IMG_LEFT" = "1" ] && ok "the SHARED cover image survived the purge" || bad "purge destroyed a shared image"
COVER=$(db_val "SELECT \"coverImageId\" FROM \"Blog\" WHERE id='$POST_B';")
[ "$COVER" = "$IMG_ID" ] && ok "the other post still points at that image" || bad "post B lost its cover ($COVER)"
POST_B_LEFT=$(db_val "SELECT count(*) FROM \"Blog\" WHERE id='$POST_B';")
[ "$POST_B_LEFT" = "1" ] && ok "the live post is untouched" || bad "live post was destroyed"

# ─────────────────────────────────────────────────────────────────────
log ""; log "── Summary ──"
log "  PASS: $PASS"
log "  FAIL: $FAIL"
[ "$FAIL" -eq 0 ] && log "  ✅ content deletion lifecycle holds" || log "  ❌ regressions above"
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
