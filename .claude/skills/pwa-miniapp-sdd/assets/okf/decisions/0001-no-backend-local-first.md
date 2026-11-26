---
type: Decision
title: No backend, local-first storage
description: All data stays in IndexedDB on the user's device until the owner explicitly asks for a backend.
status: stable
generated: { by: claude-opus-5-5, at: __NOW__ }
---

# Context

The app is a static PWA hosted on GitHub Pages. A backend adds cost, accounts and privacy
obligations.

# Decision

- No server code, no hosted database. Dexie over IndexedDB is the only persistence.
- Writes go through an outbox; the sync engine uses the `localOnlyAdapter` until a backend is approved.
- Every app ships JSON export/import and requests persistent storage, because data lives on one device.

# Consequences

- No cross-device sync or sharing without lifting this decision (write a new Decision doc that supersedes this one and set this one to `status: deprecated`).
