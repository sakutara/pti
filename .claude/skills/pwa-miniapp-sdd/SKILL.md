---
name: pwa-miniapp-sdd
description: >
  Design and build offline-first PWA mini apps using Spec-Driven Development (OpenSpec) plus an
  Open Knowledge Format (OKF) knowledge bundle, strict TDD, mobile-first fluid Tailwind UI,
  local-only data in IndexedDB (no backend, no server database), online resync, and static
  deploys to GitHub Pages built on the local machine. Design work runs on Opus 5.5; writing
  tests and code is delegated to Haiku 5.5 subagents. Use this skill whenever the user wants
  to create, plan, spec, extend, or ship a web app / webapp / mini app / PWA / "ứng dụng web",
  "miniapp", "app chạy offline", "thêm tính năng", "viết spec", or deploy one to GitHub Pages —
  even if they don't say "PWA" or "OpenSpec" — and whenever a project already contains
  `openspec/` and `knowledge/` folders created by this skill.
---

# PWA Mini App — Spec-Driven + Test-Driven

This skill turns a feature idea into a shipped, offline-capable static web app through a fixed
pipeline: **knowledge → spec → design → tests → code → verify → archive → deploy**. Each stage
leaves files behind, so any later session (or a cheaper model) can pick up where the last one
stopped without re-deriving context.

## Non-negotiable product constraints

These are the project's defaults. Hold them until the user explicitly asks otherwise in chat,
and when they do, record the change as an OKF `Decision` doc (see `references/okf-knowledge.md`).

| Constraint | What it means in practice |
|---|---|
| PWA mini app | Installable (manifest + service worker), small bundle, one focused job, app-shell UI. |
| No backend, no database | No server code, no hosted DB, no auth service. All data lives in IndexedDB on the user's device (Dexie). Third-party *public* read-only APIs are allowed only if a spec requires them. |
| Offline-first | Every feature must work offline unless its spec says why it cannot. App shell precached. |
| Resync on reconnect | Writes go through a local outbox; when the device comes back online the sync engine flushes it, refreshes stale remote caches and checks for an app update. With no backend the default adapter is a no-op, but the plumbing exists so a backend can be added later without rewriting features. |
| Mobile-first, fluid | Tailwind v4, design for ~360px first, scale fluidly with `clamp()`; PC view is a supported enhancement (wider layout, side nav), not a separate app. |
| Icon-first CTAs, AI-drawn | Buttons, toolbar actions and tabs prefer an icon over text. Each icon is drawn as SVG by the architect for that specific action (no icon fonts/CDNs), bundled for offline use, with an accessible label and tooltip. Labels are added only where the metaphor isn't obvious or the action is destructive. |
| Static deploy | `npm run build` locally → push `dist/` to the `gh-pages` branch. No CI builds, no server rendering. |
| Auto-build on main | Merging a branch or worktree into `main` (or pulling into it) triggers a local build via versioned git hooks (`.githooks/`): unit tests, spec + OKF validation, production build. Results in `.autobuild/status.json`. It never deploys. |

Why no backend: it keeps the app free to host, private by default and trivially deployable.
The cost is that the user's data lives on one device, so every app ships **Export / Import
(JSON backup)** and requests persistent storage — treat these as part of the baseline, not as
features to be specced later.

## Model split (who does what)

| Work | Model | How |
|---|---|---|
| Requirements, OpenSpec proposal/specs/design/tasks, OKF docs, architecture, UI design, **drawing CTA icons (SVG)**, reviewing diffs, deciding a task is done | **Opus 5.5** (`claude-opus-5-5`) | The main session if it runs on Opus; otherwise delegate to the `pwa-architect` agent. |
| Writing tests, writing code to make tests pass, refactoring, running the build/test commands | **Haiku 5.5** (`claude-haiku-5-5`) | Always delegate to the `pwa-implementer` agent, one task at a time. |

Opus does not write production code or test code itself, even when it would be faster (the
one exception is `src/icons/*.svg`: icons are design artifacts, so Opus draws them): the
point of the split is that the design artifacts must be complete enough for a smaller model to
implement them. If Haiku gets stuck, that is a signal the spec/task is underspecified — fix the
task text, then re-delegate. Details, the delegation prompt template, and the escalation rule
are in `references/tdd-model-split.md`.

The agent definitions live in `assets/agents/`; `scripts/scaffold.sh` copies them into the
project's `.claude/agents/`. If they are missing, copy them before delegating.

## Workflow

Track these stages in the task list. Do not skip a gate: each one exists because skipping it
is where offline bugs and spec drift come from.

### Stage 0 — Bootstrap (new project only)

1. Confirm app name, GitHub repo name (it becomes the Pages base path `/<repo>/`), and
   primary language of the UI.
2. Run `bash <skill>/scripts/scaffold.sh <app-dir> <repo-name>`. It creates a Vite + TypeScript
   + Preact + Tailwind v4 + vite-plugin-pwa + Dexie + Vitest + Playwright project, copies the
   scaffold sources, runs `openspec init`, creates the `knowledge/` OKF bundle and installs the
   two agents. Read the script before running it the first time.
3. The script writes the project constraints into the `context:` block of
   `openspec/config.yaml` (OpenSpec ≥ 1.x; older versions get `openspec/project.md`). Replace
   the `<one sentence job>` placeholder there and in `knowledge/product/overview.md`.
4. Verify: `npm test`, `npm run build`, `npm run test:e2e`, `npm run check:okf` and
   `npx openspec validate --specs` all pass on the empty scaffold.

### Stage 1 — Knowledge (Opus)

Before writing a spec, capture what the feature *is about* in the OKF bundle under
`knowledge/`: domain concepts, the data the feature stores, user roles, constraints, decisions.
OpenSpec says *what the system must do*; OKF holds the *why and the vocabulary* that specs link
to. Reuse and update existing docs rather than duplicating. See `references/okf-knowledge.md`.

### Stage 2 — Spec (Opus) — GATE: user approves

Create an OpenSpec change (`openspec/changes/<change-id>/`) with `proposal.md`, delta specs
under `specs/<capability>/spec.md`, `design.md`, and `tasks.md`. Every requirement has at least
one `#### Scenario:` written as WHEN/THEN, and every feature spec includes **offline** and
**resync** scenarios plus a **narrow (mobile) and wide (PC) layout** scenario where UI is
involved. Run `openspec validate <change-id> --strict`. Show the user the proposal and the
scenarios and wait for approval. See `references/openspec-workflow.md`.

### Stage 3 — Design (Opus)

In `design.md`: data model (Dexie tables, indexes, schema version bump + migration), outbox
operations, caching strategy for any remote resource, component tree, routes, responsive
layout at each breakpoint, and the test plan mapping scenario → test file. Reference
`references/pwa-offline-sync.md` and `references/responsive-tailwind.md`.

For every new interactive control, add a row to the **icon brief** table (action, context,
metaphor, icon-only or icon + label, states), then draw the missing icons into `src/icons/`
following `references/iconography.md`. Reuse icons from `knowledge/ui/icons.md` when the
meaning is the same. Render the review sheet (`node <skill>/scripts/icon-sheet.mjs src/icons >
icon-sheet.html`), look at it, and redraw anything ambiguous before handing off. When a change
adds new icons, show the user the sheet along with the spec, since icons come down to taste.

Then write `tasks.md` as small TDD tasks (each ≤ ~1 file of code + its tests), each carrying:
scenario IDs covered, files to touch, the exact test command, and acceptance criteria. A task
Haiku can't finish without asking questions is too vague.

### Stage 4 — Implement (Haiku, via `pwa-implementer`) — strict TDD

For each task, in order:
1. **RED** — implementer writes the failing test(s) named after the scenario, runs them, and
   reports the failure output. Opus checks that the test actually encodes the scenario.
2. **GREEN** — implementer writes the minimum code to pass; runs the full unit suite.
3. **REFACTOR** — implementer cleans up with tests green.
4. Opus reviews the diff against the spec, then ticks the task in `tasks.md`.

Independent tasks (different files, no shared result) may be delegated in parallel; tasks that
touch the same files go one at a time.

### Stage 5 — Verify (Haiku runs, Opus judges)

`npm run test` (unit, with fake-indexeddb), `npm run test:e2e` (Playwright, including the
offline/online toggle tests), `npm run build`, then a Lighthouse-style PWA check via
`npm run preview`. Opus confirms every scenario has a passing test and that the app works
offline in the preview build (service workers don't run in `vite dev` by default).

### Branches, worktrees and merging

Work on a change in its own branch (or git worktree) named after the change id. When it's
done and verified, merge it into `main` from the main checkout (`git merge --no-ff <branch>`)
— merging is an outward step, so do it when the user asks. The `post-merge` hook then runs
`scripts/autobuild.sh` on `main` automatically (hooks are shared by every worktree, and the
script only acts when `main` is checked out). After any merge into `main`, read
`.autobuild/status.json`; if it says `failed`, report the failed step and the tail of
`.autobuild/last.log`, and fix forward on a new branch — the merge itself is never reverted
automatically. Squash merges and `--no-verify` skip the hook: run `npm run autobuild` then.

### Stage 6 — Archive (Opus)

`openspec archive <change-id>` to merge deltas into `openspec/specs/`. Update OKF docs touched
by the change (`status`, `verified`), and add a dated entry to `knowledge/log.md`.

### Stage 7 — Deploy — GATE: user confirms

Deploying publishes the site publicly, so ask before the first deploy of each change. Deploy only from
`main` with a `passed` autobuild for the current commit. Then
run `npm run deploy` (tests → build → push `dist/` to `gh-pages`). See
`references/github-pages-deploy.md` for base path, SPA fallback and cache-busting details.

## Reference map

Read only what the current stage needs:

- `references/openspec-workflow.md` — change layout, spec syntax, scenario conventions, CLI.
- `references/okf-knowledge.md` — OKF v0.2 bundle layout, frontmatter, doc types used here.
- `references/tdd-model-split.md` — Opus/Haiku orchestration, delegation template, test naming.
- `references/pwa-offline-sync.md` — service worker, Dexie, outbox, resync engine, storage persistence, backup.
- `references/responsive-tailwind.md` — fluid tokens, breakpoints, mobile vs PC layout patterns.
- `references/github-pages-deploy.md` — local build + gh-pages deploy, base path, SW scope, auto-build on main.
- `references/iconography.md` — icon-only vs icon + label, icon brief, SVG house style, review sheet.

Assets: `assets/scaffold/` (starter source copied by the scaffold script),
`assets/okf/` (OKF doc templates), `assets/openspec/` (project context + change templates),
`assets/agents/` (subagent definitions). Scripts: `scripts/check-okf.mjs` validates the
bundle; `scripts/icon-sheet.mjs` renders the icon review sheet. The scaffold ships `Icon` /
`IconButton` components and `tests/unit/icons.test.ts`, which enforces the SVG house style.
