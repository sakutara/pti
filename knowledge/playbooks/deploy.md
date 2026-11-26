---
type: Playbook
title: Deploy to GitHub Pages
description: Build locally, copy the build into docs/ on main, commit and push; Pages serves main /docs.
status: stable
generated: { by: claude-sonnet-5-5, at: 2026-11-26T15:00:00Z }
---

Một lần khi tạo repo trên GitHub: Settings → Pages → Deploy from a branch → `main`, thư mục `/docs`
([0013](/decisions/0013-main-only.md)).

# Steps

1. On `main`: `git pull`, commit xong mọi thay đổi, `npm run autobuild` (status `passed`), rồi `npm run test:e2e`.
2. `npm run preview` → load, go offline, reload: shell must render.
3. Owner confirms the deploy.
4. `npm run deploy` (tests → build → postbuild 404.html/.nojekyll → chép `dist/` vào `docs/`). Lệnh này không commit, không push.
5. Commit `docs/` và push `main`.
6. Open `https://pti.fiddle.vn/` and confirm the service worker is active.
