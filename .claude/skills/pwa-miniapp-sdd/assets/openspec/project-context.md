# Project context (paste into openspec/project.md or the context block of openspec/config.yaml)

## Purpose
<APP_NAME> is a PWA mini app that <one sentence job>. Knowledge base: /knowledge/index.md.

## Constraints (hold until the owner explicitly lifts them; record lifts in /knowledge/decisions/)
- No backend, no server database. All data in IndexedDB on the user's device (Dexie).
- Offline-first: every feature works offline unless its spec states why not.
- Writes go through the outbox; the sync engine resyncs on reconnect (default adapter: local-only).
- Mobile-first fluid UI with Tailwind v4; PC layout from `lg` (side nav, two panes).
- Static build on the local machine, deployed to GitHub Pages (`gh-pages` branch), base path `/<REPO>/`, hash routing.
- Merging into `main` auto-runs a local build (git hooks in .githooks/); deploy only from a passing main.
- Every app ships JSON export/import and requests persistent storage.
- Controls are icon-first: icons are drawn per action as SVG by the architect (src/icons/), with accessible labels; see /knowledge/ui/iconography.md.

## Tech stack
Vite · TypeScript strict · Preact · Tailwind v4 · Dexie · vite-plugin-pwa (Workbox) · Vitest + fake-indexeddb + @testing-library/preact · Playwright.

## Conventions
- Scenario IDs `<capability>.<behavior>.<variant>`; tests are named with them.
- Data-writing requirements need `.offline` and `.resync` scenarios; UI requirements need `.layout.narrow`, `.layout.wide` and, for icon-only controls, `.a11y`.
- Design and specs: Opus 5.5. Tests and code: Haiku 5.5 (`pwa-implementer`), strict TDD.
