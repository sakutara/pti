---
type: Data Store
title: <table> table
description: <what records this Dexie table holds>
status: draft
generated: { by: claude-opus-5-5, at: <ISO-8601 Z> }
---

# Schema

| field | type | notes |
|---|---|---|
| id | string (uuid) | primary key, client-generated |
| updatedAt | number (epoch ms) | index; last-write-wins |
| deleted | 0 \| 1 | soft delete |

# Indexes

`id, updatedAt`

# Versions

- v<n> (<change-id>): <what changed>

# Examples
