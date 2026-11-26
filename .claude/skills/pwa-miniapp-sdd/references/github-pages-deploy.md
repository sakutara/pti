# Local build → GitHub Pages (static)

The app is always built on the developer's machine and the built `dist/` is pushed to the
`gh-pages` branch. No GitHub Actions build step, no server.

## One-time setup

1. Repo exists on GitHub; local project has `origin` remote.
2. `vite.config.ts` `base: process.env.BASE_PATH ?? '/<repo>/'` (user/org site `<name>.github.io` → `'/'`).
3. Repo → Settings → Pages → Source: *Deploy from a branch*, branch `gh-pages`, folder `/ (root)`.
   This is a repo setting the user changes themselves.
4. `npm i -D gh-pages`.

## Scripts (in package.json from the scaffold)

```json
"build": "tsc --noEmit && vite build && node scripts/postbuild.mjs",
"deploy": "npm run test && npm run build && gh-pages -d dist --dotfiles -m \"deploy $(git rev-parse --short HEAD)\""
```

`scripts/postbuild.mjs` copies `dist/index.html` → `dist/404.html` (deep-link fallback) and
writes `dist/.nojekyll` (so files starting with `_` are served).

## Routing

Use **hash routing** (`#/library`, `#/book/123`) by default: it works on Pages without any
redirect trick and with the service worker's navigateFallback. Switch to path routing only if
the user asks, relying on the `404.html` copy.

## Service worker and caching on Pages

- Pages serves with `Cache-Control: max-age=600`; Workbox precache revisioning handles updates,
  and the `prompt` register type shows the update toast once the new SW is waiting.
- SW scope = base path; manifest `scope`/`start_url` relative (`./`) so it follows the base.
- Don't put secrets in the build: everything in `dist/` is public. `VITE_*` env vars are
  inlined into JS.

## Auto-build on main (local CI)

Because builds are local, "CI" is a pair of git hooks versioned in `.githooks/` and enabled by
`git config core.hooksPath .githooks` (the scaffold does this; a fresh clone must run it once).

| Trigger | Hook |
|---|---|
| `git merge <branch>` into main (incl. fast-forward), `git pull` on main | `post-merge` |
| `git pull --rebase` on main | `post-rewrite` (rebase) |
| Squash merge, `--no-verify`, merges done on GitHub then pulled with a tool that skips hooks | none — run `npm run autobuild` |

`scripts/autobuild.sh` exits immediately unless `main` (`git config autobuild.branch`) is
checked out, so merges between feature branches and work inside other worktrees don't build.
On main it runs: `npm ci` (only if `node_modules` is missing or `package-lock.json` changed in
the merge) → `npm test` → `openspec validate --all --strict` → `check:okf` → `npm run build`.
It writes `.autobuild/status.json` (`status`, `commit`, `failedStep`, `seconds`) and
`.autobuild/last.log`, shows a macOS notification on failure, and holds a lock so two merges
can't build at once. E2E tests are left out to keep merges fast; run `npm run test:e2e` before
deploying. Set `SKIP_AUTOBUILD=1` to skip one run.

It never deploys and never reverts a merge: a failed build means fix forward on a branch.

## Before every deploy

- On `main`, `.autobuild/status.json` is `passed` for the current `git rev-parse --short HEAD`.
- `npm run test:e2e` green.
- `npm run preview`, load once, go offline in devtools, reload → app shell still renders.
- Ask the user to confirm the deploy (it publishes publicly), then `npm run deploy`.
- After deploy: open `https://<user>.github.io/<repo>/`, check the SW is active and the app
  installs.
