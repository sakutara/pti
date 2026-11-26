#!/usr/bin/env bash
# Scaffold a PWA mini app for the pwa-miniapp-sdd skill.
# Usage: scaffold.sh <app-dir> <repo-name> [app-name] [ui-lang]
#   <repo-name> becomes the GitHub Pages base path /<repo-name>/
# Needs: node >= 20.19, npm, git. Network access to the npm registry.
set -euo pipefail

APP_DIR=${1:?usage: scaffold.sh <app-dir> <repo-name> [app-name] [ui-lang]}
REPO=${2:?repo name required}
APP_NAME=${3:-$REPO}
LANG_CODE=${4:-vi}
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
TODAY=$(date -u +%Y-%m-%d)
DB_NAME=$(echo "$REPO" | tr -c 'a-zA-Z0-9-\n' '-')

if [ -e "$APP_DIR" ] && [ -n "$(ls -A "$APP_DIR" 2>/dev/null)" ]; then
  echo "error: $APP_DIR exists and is not empty" >&2; exit 1
fi

echo "==> Vite + Preact + TypeScript template"
npm create vite@latest "$APP_DIR" -- --template preact-ts
cd "$APP_DIR"
rm -f src/index.css src/app.css src/assets/preact.svg public/vite.svg public/icons.svg

echo "==> Dependencies"
npm i dexie @preact/signals
npm i -D tailwindcss @tailwindcss/vite vite-plugin-pwa workbox-window \
  vitest jsdom fake-indexeddb @testing-library/preact @testing-library/jest-dom \
  @playwright/test @vite-pwa/assets-generator gh-pages @fission-ai/openspec

echo "==> Scaffold sources"
cp -R "$SKILL_DIR/assets/scaffold/." .
# Placeholders
sub() { # file
  sed -i.bak -e "s|__REPO__|$REPO|g" -e "s|__APP_NAME__|$APP_NAME|g" \
    -e "s|__LANG__|$LANG_CODE|g" -e "s|__DB_NAME__|$DB_NAME|g" \
    -e "s|__NOW__|$NOW|g" -e "s|__DATE__|$TODAY|g" "$1" && rm -f "$1.bak"
}
for f in vite.config.ts playwright.config.ts index.html src/app.tsx src/db/db.ts; do sub "$f"; done

# vite-plugin-pwa virtual module types
grep -q 'vite-plugin-pwa/client' src/vite-env.d.ts 2>/dev/null || \
  echo '/// <reference types="vite-plugin-pwa/client" />' >> src/vite-env.d.ts

echo "==> PWA icons from public/favicon.svg"
npx pwa-assets-generator --preset minimal-2023 public/favicon.svg

echo "==> package.json scripts"
npm pkg set type=module
npm pkg set scripts.dev="vite"
npm pkg set scripts.build="tsc -b && vite build && node scripts/postbuild.mjs"
npm pkg set scripts.preview="vite preview"
npm pkg set scripts.test="vitest run"
npm pkg set scripts.test:watch="vitest"
npm pkg set scripts.test:e2e="playwright test"
npm pkg set scripts.deploy="npm run test && npm run build && gh-pages -d dist --dotfiles"
npm pkg set scripts.icons:sheet="node .claude/skills/pwa-miniapp-sdd/scripts/icon-sheet.mjs src/icons > icon-sheet.html"
npm pkg set scripts.autobuild="bash scripts/autobuild.sh --force"
npm pkg set scripts.check:okf="node .claude/skills/pwa-miniapp-sdd/scripts/check-okf.mjs knowledge"
npx playwright install chromium

echo "==> OKF knowledge bundle"
mkdir -p knowledge
(cd "$SKILL_DIR/assets/okf" && tar cf - --exclude templates .) | (cd knowledge && tar xf -)
for f in $(find knowledge -name '*.md'); do sub "$f"; done

echo "==> OpenSpec"
npx openspec init --tools claude || npx openspec init
mkdir -p openspec/specs/sync
cp "$SKILL_DIR/assets/openspec/sync-spec.md" openspec/specs/sync/spec.md
mkdir -p openspec/specs/ui
cp "$SKILL_DIR/assets/openspec/ui-spec.md" openspec/specs/ui/spec.md
CTX=$(sed -e "s|<APP_NAME>|$APP_NAME|g" -e "s|<REPO>|$REPO|g" "$SKILL_DIR/assets/openspec/project-context.md" | sed '1,2d')
if [ -f openspec/config.yaml ] && ! grep -q '^context:' openspec/config.yaml; then
  { echo; echo 'context: |'; echo "$CTX" | sed 's/^/  /'; } >> openspec/config.yaml   # OpenSpec >= 1.x
else
  echo "$CTX" > openspec/project.md                                                 # older OpenSpec
fi

echo "==> Claude agents + skill copy"
mkdir -p .claude/agents .claude/skills
cp "$SKILL_DIR/assets/agents/"*.md .claude/agents/
[ -d .claude/skills/pwa-miniapp-sdd ] || cp -R "$SKILL_DIR" .claude/skills/pwa-miniapp-sdd

echo "==> git"
[ -d .git ] || git init -q -b main
grep -q '^dist' .gitignore 2>/dev/null || printf 'dist\ntest-results\nplaywright-report\nicon-sheet.html\n.autobuild\n' >> .gitignore
# Local CI: build main automatically after a branch/worktree is merged into it.
# Hooks are versioned in .githooks/ and shared by every worktree of this repo.
chmod +x .githooks/* scripts/autobuild.sh
git config core.hooksPath .githooks
git config autobuild.branch main

cat <<EOF

Done: $APP_DIR
Next:
  1. Fill the one-sentence purpose in openspec/config.yaml (context) and knowledge/product/overview.md.
  2. npm test && npm run build && npm run test:e2e
  3. Create the GitHub repo '$REPO', add it as origin, and set Pages to deploy from the gh-pages branch.
EOF
