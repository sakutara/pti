#!/usr/bin/env bash
# Local CI for the main branch: runs after a branch/worktree is merged into main (git hooks in
# .githooks/) or by hand with `npm run autobuild`. Never deploys — deploying stays a manual,
# confirmed step (`npm run deploy`).
# Result: .autobuild/status.json + .autobuild/last.log (git-ignored).
set -uo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
MAIN=$(git config --get autobuild.branch || echo main)
BRANCH=$(git symbolic-ref --quiet --short HEAD || echo DETACHED)
FORCE=${1:-}

if [ "${SKIP_AUTOBUILD:-0}" = 1 ]; then echo "autobuild: skipped (SKIP_AUTOBUILD=1)"; exit 0; fi
if [ "$BRANCH" != "$MAIN" ] && [ "$FORCE" != "--force" ]; then exit 0; fi

OUT=.autobuild
mkdir -p "$OUT"
# One build at a time per checkout (mkdir is atomic).
if ! mkdir "$OUT/lock" 2>/dev/null; then echo "autobuild: another build is running, skipped"; exit 0; fi
trap 'rmdir "$OUT/lock" 2>/dev/null' EXIT

SHA=$(git rev-parse --short HEAD)
START=$(date +%s)
LOG="$OUT/last.log"
: > "$LOG"
step() { # name, command...
  local name=$1; shift
  echo "==> $name" | tee -a "$LOG"
  if ! "$@" >> "$LOG" 2>&1; then FAILED=$name; return 1; fi
}
FAILED=""

echo "autobuild: $MAIN @ $SHA" | tee -a "$LOG"
# Reinstall only when the merge changed dependencies (ORIG_HEAD = main before the merge).
if [ -z "$(ls -A node_modules 2>/dev/null)" ] || \
   { git rev-parse -q --verify ORIG_HEAD >/dev/null && ! git diff --quiet ORIG_HEAD HEAD -- package-lock.json; }; then
  step "npm ci" npm ci
fi
[ -z "$FAILED" ] && step "unit tests" npm run --silent test
[ -z "$FAILED" ] && step "openspec validate" npx --no-install openspec validate --all --strict
[ -z "$FAILED" ] && step "okf check" npm run --silent check:okf
[ -z "$FAILED" ] && step "build" npm run --silent build

DUR=$(( $(date +%s) - START ))
STATUS=$([ -z "$FAILED" ] && echo passed || echo failed)
printf '{ "status": "%s", "branch": "%s", "commit": "%s", "failedStep": "%s", "seconds": %s, "finishedAt": "%s" }\n' \
  "$STATUS" "$MAIN" "$SHA" "$FAILED" "$DUR" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$OUT/status.json"

if [ "$STATUS" = passed ]; then
  echo "autobuild: PASSED in ${DUR}s — dist/ is ready. Deploy with: npm run deploy"
else
  echo "autobuild: FAILED at '$FAILED' — see $OUT/last.log" >&2
  tail -n 30 "$LOG" >&2
  # Desktop notification on macOS, best effort.
  command -v osascript >/dev/null && osascript -e "display notification \"Failed at $FAILED ($SHA)\" with title \"autobuild: $MAIN\"" >/dev/null 2>&1
fi
# A failed build never blocks or reverts the merge (post-merge hooks can't); fix forward on a branch.
exit 0
