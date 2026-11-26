# ui

## Purpose
Shared interaction rules for every screen: icon-first controls with accessible names.

## Requirements

### Requirement: Icon-first controls
Interactive controls SHALL show an app-drawn SVG icon and SHALL expose their action as an accessible name; a visible text label SHALL be added only for destructive actions, first-use primary actions with a non-obvious metaphor, tab bars and the wide-screen side nav.

#### Scenario: ui.icon-button.a11y
- **WHEN** an icon-only button renders
- **THEN** it is reachable by role `button` with its label as accessible name
- **AND** the label shows as a tooltip on hover and keyboard focus

#### Scenario: ui.icon-button.state
- **WHEN** a toggle button is switched on
- **THEN** `aria-pressed` is `true` and the filled icon variant is shown

#### Scenario: ui.icon-button.hit-area
- **WHEN** any icon button renders
- **THEN** its hit area is at least 44 × 44 CSS px

### Requirement: Icon house style
Every icon in `src/icons/` SHALL use a 24 × 24 viewBox, `currentColor` only, a 2 px round stroke (or fill for `-filled` variants), at most 6 primitives and no text, scripts, images or external references.

#### Scenario: ui.icons.house-style
- **WHEN** the unit test suite runs
- **THEN** every SVG in `src/icons/` passes the house-style checks
