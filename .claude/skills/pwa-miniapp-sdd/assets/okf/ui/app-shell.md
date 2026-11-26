---
type: UI Pattern
title: App shell layout
description: Mobile-first shell with bottom tab bar, switching to a side nav and two panes on large screens.
status: stable
generated: { by: claude-opus-5-5, at: __NOW__ }
---

# Rules

- < 1024 px: sticky top bar, bottom tab bar (safe-area padded), single column.
- ≥ 1024 px (`lg`): side nav, list/detail two panes, content max-width 80rem.
- Sizes use fluid tokens (`text-fluid-*`, `px-gutter`) from `src/styles/app.css`.
- Controls are icon-first, see [Icon-first controls](/ui/iconography.md).
- Touch targets ≥ 44 px; `min-h-dvh`; dark mode via `dark:`.
