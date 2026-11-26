# Icon-first CTAs with AI-drawn icons

Interactive controls (CTA buttons, toolbar actions, tab items, FAB) **prefer an icon over a
text label**. Each icon is **drawn for this app by the architect (Opus 5.5)** as hand-written
SVG, based on what that specific button does — not pulled from an icon font or CDN. This
keeps the app offline (icons are bundled), visually consistent, and lets each metaphor fit
the app's own domain (a "save to shelf" icon in a reading app looks like a book going onto a
shelf, not a generic floppy disk).

## When icon-only, when icon + label

Icon-first is a preference, not an absolute. Decide per CTA in `design.md`:

| Situation | Treatment |
|---|---|
| Universally understood action (back, close, search, add, share, settings, more) | Icon only |
| Frequent, repeated in-context action (bookmark, like, next page) | Icon only |
| Primary CTA of a screen the user sees for the first time, or a domain-specific action whose metaphor isn't obvious | Icon + short label (≤ 2 words) on first use; may collapse to icon-only after onboarding or in compact toolbars |
| Destructive or irreversible (delete, reset, clear data) | Icon + label, plus confirmation |
| Bottom tab bar | Icon + tiny label (`text-[0.6875rem]`) — tabs are navigation, recognition matters |
| PC view (`lg`) side nav | Icon + label (space is available) |

Every icon-only control still has an accessible name and a visible hint:
- `aria-label` with the action in the UI language (required — tests enforce it).
- Tooltip on hover/focus on pointer devices (`title` is not enough: use the `IconButton`
  tooltip, which also shows on keyboard focus); long-press shows it on touch.
- Never rely on color alone to convey state; toggled states change the drawing (outline →
  filled) and set `aria-pressed`.

## Icon brief (architect writes this in design.md for every CTA)

```markdown
| id | action (what happens) | context | metaphor | icon-only? | states |
|---|---|---|---|---|---|
| bookmark-add | save current page to bookmarks | reader toolbar | ribbon tab hanging from a page corner | yes | off: outline · on: filled |
| shelf-add | add book to my shelf | book detail, primary CTA | book sliding onto a shelf line, small + | no (label "Thêm vào kệ") | — |
```

Metaphor guidance: name the *concrete object* the icon shows, pick the most literal widely
recognised image first, avoid text/letters inside icons (they don't localise), avoid culture-
specific gestures. If two CTAs on the same screen get similar silhouettes, redraw one.

## Drawing rules (house style)

All icons share one grid so they look like one family:

- `viewBox="0 0 24 24"`, designed on a 24 px grid with a 2 px safe margin (live area 20×20).
- Stroke-based: `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
  stroke-linejoin="round"`. Filled variants (`-filled`) use `fill="currentColor"` and no stroke.
- Color only through `currentColor` — the button sets color via Tailwind (`text-accent`), dark
  mode works for free. No hard-coded colors, gradients, filters, `<text>`, `<image>`, `<script>`,
  `<foreignObject>`, `style=` or `on*=` attributes.
- Simple: ≤ 6 primitives, ≤ ~1 KB per file, no transforms needed to read it. Coordinates on
  whole or half pixels so 2 px strokes stay crisp at 24 px.
- Optical balance: a circle-ish icon uses ~18–20 px diameter, a square-ish one ~16–18 px, so
  they feel the same size side by side.
- Must read at 20 px (compact toolbar) and 24 px (default). Rendered inside a ≥ 44 px hit area.

File: `src/icons/<id>.svg` (and `<id>-filled.svg` for the on state). One root `<svg>`, no
width/height attributes (size comes from CSS).

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h10a1 1 0 0 1 1 1v17l-6-4-6 4V4a1 1 0 0 1 1-1z"/></svg>
```

## Workflow inside the pipeline

1. **Stage 3 (design, Opus)** — write the icon brief table, then draw each SVG into
   `src/icons/`. Icons are design artifacts, so the architect writes them (the one exception
   to "Opus doesn't write files under src/"). Reuse an existing icon when the meaning really
   is the same; don't redraw `close` per screen.
2. **Review sheet** — run `node <skill>/scripts/icon-sheet.mjs src/icons > icon-sheet.html` and
   open it (browser pane). It shows every icon at 20/24/48 px, light and dark, in a 44 px button.
   Look at it before handing off; redraw anything that is ambiguous, unbalanced, or blurry.
   Ask the user to glance at the sheet when a change adds new CTAs — icons are taste.
3. **Record** — add/update `knowledge/ui/icons.md` (catalog: id, meaning, where used) so later
   changes reuse icons instead of drawing near-duplicates.
4. **Implement (Haiku)** — the implementer uses `<IconButton icon="bookmark-add" label="…">`
   and must not edit or create SVGs; if an icon is missing it reports back.
5. **Tests** — `tests/unit/icons.test.ts` (scaffold) checks every SVG against the house rules;
   component tests assert every icon-only button has an accessible name.

## Spec scenarios

UI requirements that add CTAs include, alongside `.layout.*`:

- `<cap>.<cta>.a11y` — WHEN the screen renders THEN the control is reachable by role
  `button` with name "<label>".
- For toggles: `<cap>.<cta>.state` — WHEN toggled THEN `aria-pressed` flips and the filled
  icon shows.
