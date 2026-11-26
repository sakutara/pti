---
type: UI Pattern
title: Icon-first controls
description: Interactive controls prefer AI-drawn SVG icons over text, with accessible labels and tooltips.
status: stable
generated: { by: claude-opus-5-5, at: __NOW__ }
---

# Rules

- Buttons, toolbar actions and tabs show an icon; the text label is the accessible name
  (`aria-label`) and appears as a tooltip on hover, keyboard focus and long-press.
- Visible label as well as the icon only for: first-use primary CTAs with a non-obvious
  metaphor, destructive actions, bottom tabs (tiny label), and the PC side nav.
- Icons are drawn for each action by the architect (claude-opus-5-5) as SVG in `src/icons/`:
  24 grid, 2px round stroke, `currentColor` only, at most 6 primitives, no text. Toggles have
  a `-filled` variant.
- Catalog of drawn icons and where they are used: [Icon catalog](/ui/icons.md).
