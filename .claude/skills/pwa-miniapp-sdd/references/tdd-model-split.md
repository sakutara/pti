# TDD with an Opus/Haiku model split

## Roles

- **Opus 5.5 (architect / reviewer)** — writes OKF docs, OpenSpec changes, `design.md`,
  `tasks.md`; reviews every RED test and every GREEN diff; ticks tasks. Never writes source or
  test files itself. If the main session isn't on Opus (check the model in the system prompt),
  delegate design stages to the `pwa-architect` agent instead of doing them in-session.
- **Haiku 5.5 (implementer)** — the `pwa-implementer` agent. Writes tests and code for exactly
  one task, runs commands, reports results. Does not edit `openspec/` or `knowledge/`.

Agent definitions pin the models (`model: opus` / `model: haiku` in frontmatter, which resolve
to the latest Opus 5.5 / Haiku 5.5). When calling the Agent tool you may also pass
`model: "haiku"` explicitly; never let implementation fall back to the parent model silently.

## The loop per task

```
Opus: pick next unticked task from tasks.md
  └─► Agent(pwa-implementer, phase=RED)   → writes failing tests, returns failure output
Opus: does the test encode the scenario? (assert on behaviour, not implementation; offline
      tests really toggle offline; no `.skip`) — if not, send back with specific corrections
  └─► Agent(pwa-implementer, phase=GREEN+REFACTOR) → minimal code, full suite green
Opus: review diff vs spec + design (scope creep? new deps? network calls? data outside IndexedDB?)
      → tick task in tasks.md, or send back
```

RED and GREEN can be one delegation for trivial tasks, but the implementer must still show the
failing run before the passing run in its report — that's the evidence TDD actually happened.

## Delegation prompt template

```
Phase: RED | GREEN+REFACTOR
Task: <task number + title from tasks.md>
Scenarios (verbatim from spec):
<paste the full #### Scenario blocks>
Relevant design excerpt:
<paste only the design.md parts this task needs: table schema, function signatures, component props>
Files you may create/edit: <list>
Files you must not edit: openspec/**, knowledge/**, anything not listed above
Test command: <exact command>
Conventions: test names start with the scenario ID, e.g. it('bookmarks.create.offline: queues outbox entry', ...)
Report back: files changed, the test command output (failing run for RED, passing full-suite run for GREEN), and anything in the task you found ambiguous.
```

Paste content rather than telling Haiku to "read the spec": it keeps the context small and
removes the chance it reads the wrong section.

## Escalation

- Implementer reports ambiguity, or fails the same task twice → the task is underspecified.
  Opus rewrites the task (and the design excerpt if needed) and re-delegates. Don't take over
  the coding.
- A scenario turns out to be wrong or impossible → stop, update the delta spec, re-validate,
  and tell the user if it changes behaviour they approved.

## Test stack and conventions

| Layer | Tool | Notes |
|---|---|---|
| Unit / domain / db | Vitest + `fake-indexeddb/auto` | each test file gets a fresh DB (`await db.delete(); await db.open()`) |
| Components | Vitest + `@testing-library/preact` + jsdom | query by role/label; no snapshot tests |
| Sync engine | Vitest with a fake adapter + stubbed `navigator.onLine` and dispatched `online`/`offline` events | |
| E2E / offline | Playwright against `vite preview` (real service worker) | `context.setOffline(true)`; viewport projects `mobile` 375×812 and `desktop` 1280×800 |

Coverage proof: for every scenario ID in the change's delta specs,
`grep -r "<scenario-id>" tests/` must find at least one test. Opus runs this before Stage 6.
