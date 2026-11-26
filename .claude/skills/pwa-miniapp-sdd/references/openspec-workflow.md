# OpenSpec workflow for PWA mini apps

OpenSpec (`@fission-ai/openspec`, Node ≥ 20.19) keeps two trees:

```
openspec/
├── specs/<capability>/spec.md        # current truth: what the app does today
└── changes/
    ├── <change-id>/                  # one proposed change in flight
    │   ├── proposal.md               # why, what, scope, out of scope
    │   ├── design.md                 # how (data model, sync, UI, test plan)
    │   ├── tasks.md                  # TDD task checklist for the implementer
    │   └── specs/<capability>/spec.md  # DELTA specs: ADDED / MODIFIED / REMOVED
    └── archive/YYYY-MM-DD-<change-id>/
```

Project context lives in `openspec/config.yaml` (`context:`, optional `rules:` per artifact)
in OpenSpec ≥ 1.x (verified with 2.1); older versions used `openspec/project.md`. Slash-command
names have shifted between versions (`/openspec:proposal` → `/opsx:propose`), so run
`openspec --help` once per project. The core CLI is stable: `openspec list [--specs]`,
`openspec show <id>`, `openspec validate <id> --strict` (or `--specs`), `openspec archive <id>`.

Useful `config.yaml` rules for this skill:

```yaml
rules:
  proposal:
    - State offline behaviour and list what is out of scope
  specs:
    - Scenario titles carry a dotted ID <capability>.<behavior>.<variant>
    - Data-writing requirements include .offline and .resync scenarios
  tasks:
    - Each task lists Scenarios, Files, Test command, Done when
```

## Naming

- `change-id`: kebab-case, verb-led: `add-reading-progress`, `change-bookmark-sort`.
- `capability`: noun, one per user-facing area: `library`, `reader`, `bookmarks`, `sync`,
  `app-shell`. `sync`, `app-shell` and `ui` exist from day one (scaffold writes them).

## proposal.md

```markdown
# <Change title>

## Why
<problem, who has it, linked OKF concepts e.g. [Bookmark](/knowledge/domain/bookmark.md)>

## What changes
- <bullet per user-visible change>

## Impact
- Capabilities: reader (MODIFIED), bookmarks (ADDED)
- Data: new Dexie table `bookmarks`, schema v2 → v3
- Offline: fully offline | needs network for X (why)
- Out of scope: <explicitly list — this is what keeps Haiku from over-building>
```

## Delta spec syntax

```markdown
## ADDED Requirements

### Requirement: Create bookmark
The app SHALL let the reader bookmark the current page with one tap.

#### Scenario: bookmarks.create.online
- **WHEN** the reader taps the bookmark button on page 12
- **THEN** a bookmark for page 12 is stored in IndexedDB
- **AND** the button shows the filled state within 100 ms

#### Scenario: bookmarks.create.offline
- **GIVEN** the device is offline
- **WHEN** the reader taps the bookmark button
- **THEN** the bookmark is stored locally and an outbox entry `bookmark.upsert` is queued
- **AND** no error is shown

#### Scenario: bookmarks.create.resync
- **GIVEN** 3 bookmarks were created offline
- **WHEN** the device comes back online
- **THEN** the sync engine flushes the 3 outbox entries through the active adapter
- **AND** the outbox is empty afterwards

#### Scenario: bookmarks.layout.narrow / bookmarks.layout.wide
- **WHEN** the viewport is 360 px wide **THEN** the bookmark list is a full-screen sheet
- **WHEN** the viewport is ≥ 1024 px **THEN** the list is a side panel next to the reader
```

Rules:
- Requirement text uses SHALL/MUST; each requirement has ≥ 1 scenario.
- **Give each scenario a stable dotted ID** (`<capability>.<behavior>.<variant>`) in its title.
  Tests are named with the same ID, which is how Opus proves coverage (grep the ID).
- `MODIFIED` requirements repeat the full new requirement text, not a diff.
- Every feature that writes data gets `.offline` and `.resync` scenarios; every feature with UI
  gets `.layout.narrow` and `.layout.wide`; every new icon-only control gets `.a11y`
  (role button + accessible name) and toggles get `.state` (see `iconography.md`).
- Never write a scenario that needs a server. If the user asks for something that does (sharing
  between devices, login, push from server), stop and ask whether they want to lift the
  no-backend constraint — don't spec it silently.

## tasks.md

```markdown
## 1. Data
- [ ] 1.1 Add `bookmarks` table (Dexie v3) + migration
  - Scenarios: bookmarks.create.online
  - Files: src/db/db.ts, tests/unit/db.bookmarks.test.ts
  - Test: npx vitest run tests/unit/db.bookmarks.test.ts
  - Done when: table exists with indexes `id, bookId, [bookId+page]`; v2 data survives upgrade
```

Order tasks: data → domain logic → sync/outbox → UI components → routes/layout → e2e.

## Validate and archive

`openspec validate <id> --strict` must pass before asking the user to approve, and again before
archiving. Archive only when all tasks are ticked and Stage 5 verification passed.
