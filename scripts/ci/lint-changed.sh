#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# scripts/ci/lint-changed.sh — ESLint ratchet for one app
#
#   bash scripts/ci/lint-changed.sh backend   # or: frontend
#
# The backend still carries lint debt from before the gate existed
# (≈2 700 errors in 120 files, mostly formatting). Failing the whole
# build on it would block every change, so the rule is the boy-scout
# one: every TypeScript file a change ADDS OR TOUCHES must lint clean
# (errors fail, warnings are reported). The debt shrinks each time a
# file is touched and can never grow.
#
# Base of the comparison:
#   - pull request  → the target branch (origin/$GITHUB_BASE_REF)
#   - push          → the previous tip ($GITHUB_EVENT_BEFORE)
#   - anything else → HEAD~1
# The checkout must have history (actions/checkout fetch-depth: 0).
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

app="${1:?usage: lint-changed.sh <backend|frontend>}"
dir="oralign-${app}"
[[ -d "${dir}" ]] || { echo "No ${dir} directory" >&2; exit 2; }

zero="0000000000000000000000000000000000000000"
base=""
if [[ -n "${GITHUB_BASE_REF:-}" ]]; then
  base="origin/${GITHUB_BASE_REF}"
elif [[ -n "${GITHUB_EVENT_BEFORE:-}" && "${GITHUB_EVENT_BEFORE}" != "${zero}" ]] \
  && git cat-file -e "${GITHUB_EVENT_BEFORE}^{commit}" 2>/dev/null; then
  base="${GITHUB_EVENT_BEFORE}"
else
  base="HEAD~1"
fi

mapfile -t files < <(
  git diff --name-only --diff-filter=ACMR "${base}...HEAD" -- "${dir}" \
    | grep -E '\.(ts|tsx|mts|cts)$' \
    | grep -vE '(^|/)(dist|\.next|node_modules)/' \
    || true
)

if [[ ${#files[@]} -eq 0 ]]; then
  echo "No ${app} TypeScript file changed since ${base}: nothing to lint."
  exit 0
fi

echo "Linting ${#files[@]} changed ${app} file(s) since ${base}:"
printf '  %s\n' "${files[@]}"

# Paths relative to the app, where its ESLint config lives.
rel=()
for f in "${files[@]}"; do rel+=("${f#"${dir}/"}"); done

cd "${dir}"
npx eslint --no-warn-ignored "${rel[@]}"
