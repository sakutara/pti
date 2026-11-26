# OKF knowledge bundle

Open Knowledge Format (OKF) is an open spec (published by Google Cloud, June 2026; v0.2 here,
development continuing at github.com/open-knowledge-format/open-knowledge-format) for
knowledge that both agents and humans read: **a directory of Markdown files with YAML
frontmatter**. It is a format, not a tool — no server, no index service — which fits the
no-backend rule.

## Division of labour with OpenSpec

| OpenSpec (`openspec/`) | OKF (`knowledge/`) |
|---|---|
| Testable behaviour: requirements + scenarios | Context: domain vocabulary, data shapes, decisions, playbooks |
| Changes over time via proposals/deltas | Living docs, updated in place, history in `log.md` |
| Read by the implementer for *what to build* | Read by the architect (and implementer when linked) for *what things mean* |

Specs link to knowledge docs with bundle-absolute links; knowledge docs link back to the
capability spec they inform. Don't copy requirements into OKF or definitions into specs.

## Layout used by this skill

```
knowledge/
├── index.md              # reserved: listing (root one may carry okf_version: "0.2")
├── log.md                # reserved: newest-first history, `## YYYY-MM-DD` headings
├── product/overview.md   # type: Product  — the app's purpose, users, constraints
├── domain/<concept>.md   # type: Domain Concept — e.g. book.md, bookmark.md
├── data/<table>.md       # type: Data Store — one per Dexie table: fields, indexes, version
├── decisions/NNNN-<slug>.md  # type: Decision — ADR-style, incl. any constraint lifted
├── ui/<pattern>.md       # type: UI Pattern — layout rules, components
└── playbooks/<task>.md   # type: Playbook — deploy, add a Dexie migration, release
```

## Frontmatter

Only `type` is required by OKF; consumers must accept unknown types and extra keys. This skill
always writes:

```yaml
---
type: Domain Concept          # free-form; use the types listed above for consistency
title: Bookmark
description: A reader-saved position inside a book.   # one sentence
tags: [reader, bookmarks]
status: draft                 # draft | stable | deprecated (absent = stable)
generated: { by: claude-opus-5-5, at: 2026-11-23T10:00:00Z }
verified:                     # list of {by, at}; a human:<id> entry = human-reviewed
  - { by: human:owner, at: 2026-11-24T09:00:00Z }
stale_after: 2027-05-23T00:00:00Z   # optional freshness horizon
sources:                      # optional; ids are footnote labels in the body
  - id: spec-bookmarks
    resource: /openspec/specs/bookmarks/spec.md
---
```

Conventions:
- Timestamps are ISO 8601 with an explicit offset (`Z`).
- Actor strings: model id (`claude-opus-5-5`, `claude-haiku-5-5`), `human:<id>`, `process:<id>`.
- New docs start as `status: draft`; move to `stable` and add a `human:` entry to `verified`
  when the user approves the spec that uses them.
- Links: standard Markdown, bundle-absolute (`[Book](/domain/book.md)`) inside `knowledge/`;
  from specs use repo-relative paths (`/knowledge/domain/book.md`). Links are untyped — say the
  relationship in the sentence.
- `index.md` has no frontmatter (except `okf_version` at the root). Body: `# Section` headings
  with bullets `* [Title](relative-url) - description`. Regenerate it whenever docs change.
- `log.md` entries: `## 2026-11-23` then bullets like `- add-bookmarks: added domain/bookmark.md, data/bookmarks.md`.

## Data Store doc body (most important for implementers)

```markdown
# Schema
| field | type | notes |
|---|---|---|
| id | string (uuid v7) | primary key |
| bookId | string | index |
| page | number | compound index [bookId+page] |
| updatedAt | number (epoch ms) | used for last-write-wins |
| deleted | 0 \| 1 | soft delete so deletions can resync |

# Versions
- v3 (add-bookmarks): table created

# Examples
{ "id": "0190...", "bookId": "b1", "page": 12, "updatedAt": 1763892000000, "deleted": 0 }
```

Run `node <skill>/scripts/check-okf.mjs knowledge` after edits: it checks every non-reserved
`.md` has frontmatter with a non-empty `type`, timestamps have offsets, and `status` is valid.
