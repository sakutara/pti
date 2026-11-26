# Responsive fluid UI with Tailwind v4

Mobile is the primary target; PC view must be comfortable but is an enhancement of the same
components, not a second layout codebase.

## Setup (Tailwind v4)

`@tailwindcss/vite` plugin + `src/styles/app.css` starting with `@import "tailwindcss";`.
Design tokens live in `@theme` (see `assets/scaffold/src/styles/app.css`). No
`tailwind.config.js` unless a plugin needs one.

## Fluid tokens

Type and spacing scale continuously between a 360 px and a 1280 px viewport using `clamp()`:

```css
@theme {
  --text-fluid-sm:   clamp(0.875rem, 0.84rem + 0.15vw, 0.95rem);
  --text-fluid-base: clamp(1rem,     0.95rem + 0.25vw, 1.125rem);
  --text-fluid-lg:   clamp(1.125rem, 1.03rem + 0.45vw, 1.375rem);
  --text-fluid-xl:   clamp(1.375rem, 1.2rem + 0.9vw,  2rem);
  --spacing-gutter:  clamp(1rem, 0.7rem + 1.3vw, 2rem);
}
```

Use them as `text-fluid-base`, `px-gutter`. Breakpoints are for *layout changes*, fluid tokens
are for *size changes* — don't stack `text-sm md:text-base lg:text-lg`.

## Layout rules

| Viewport | Shell |
|---|---|
| < 768 px (default) | Single column, sticky top bar, **bottom tab bar** (thumb reach), sheets/full-screen dialogs |
| `md` ≥ 768 px | Same, content max-width `48rem` centered, dialogs become centered modals |
| `lg` ≥ 1024 px | **Side nav** replaces bottom bar; list/detail as two panes; content max-width `80rem` |

- Prefer container queries (`@container`, `@md:`) for components that appear in both a narrow
  pane and a full page (cards, lists) — they adapt to their slot, not the window.
- Heights: `min-h-dvh`, never `h-screen` (mobile browser chrome).
- Safe areas: `pb-[env(safe-area-inset-bottom)]` on the bottom bar, `pt-[env(safe-area-inset-top)]`
  on the top bar; `viewport-fit=cover` in the viewport meta.
- Controls are icon-first (`IconButton`, see `iconography.md`); icon-only buttons still need
  their label as `aria-label` + tooltip. Side nav at `lg` shows icon + label.
- Touch targets ≥ 44×44 px (`min-h-11 min-w-11`); spacing between targets ≥ 8 px.
- Input `font-size` ≥ 16 px to stop iOS zoom on focus.
- Pointer-specific affordances behind `hover:` only via `@media (hover: hover)` — Tailwind v4's
  `hover:` already does this.
- Dark mode via `prefers-color-scheme` (`dark:`), plus a manual toggle stored in IndexedDB settings.
- Respect `motion-reduce:`; keep transitions ≤ 200 ms.
- Keyboard: on PC every action reachable by keyboard, visible `focus-visible:` rings.

## Testing layout scenarios

`.layout.narrow` / `.layout.wide` scenarios are checked in Playwright with two projects
(375×812 and 1280×800): assert visibility of the bottom bar vs side nav and pane arrangement by
role, not pixels. Also assert no horizontal scroll: `document.documentElement.scrollWidth <= innerWidth`.
