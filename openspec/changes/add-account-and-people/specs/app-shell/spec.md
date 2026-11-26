## ADDED Requirements

### Requirement: Primary navigation
The app SHALL provide four primary destinations — Trang chủ (`#/`), Hồ sơ claim (`#/claims`), Cơ sở y tế (`#/facilities`), Tài khoản (`#/account`) — as a bottom tab bar on narrow screens and a side nav on wide screens, and SHALL mark the active destination.

#### Scenario: app-shell.nav.active
- **WHEN** the user opens `#/facilities`
- **THEN** the Cơ sở y tế tab has `aria-current="page"` and the other three do not

#### Scenario: app-shell.nav.unknown-route
- **WHEN** the user opens a hash route that does not exist
- **THEN** the app shows Trang chủ and replaces the hash with `#/`

#### Scenario: app-shell.layout.narrow
- **WHEN** the viewport is 360 px wide
- **THEN** the four destinations are shown as a bottom tab bar with icon and short label, and no side nav is visible

#### Scenario: app-shell.layout.wide
- **WHEN** the viewport is 1280 px wide
- **THEN** the four destinations are shown as a side nav with icon and label, and the bottom tab bar is hidden

### Requirement: Vietnamese UI strings
Every user-visible string SHALL come from the Vietnamese dictionary `src/i18n/vi.ts` through a single lookup function, so that a second language can be added without touching components.

#### Scenario: app-shell.i18n.no-missing-keys
- **WHEN** the unit test suite renders each page
- **THEN** no string lookup returns a missing-key marker

### Requirement: Home summary
Trang chủ SHALL show the holder's name and tier, a shortcut to open the card wallet, a shortcut to create a new claim, and the number of claims that are not yet closed.

#### Scenario: app-shell.home.summary
- **GIVEN** an account whose holder is "Nguyễn Văn A", tier 2, with 2 claims in status `submitted` and 1 in `paid`
- **WHEN** the user opens Trang chủ
- **THEN** it shows "Nguyễn Văn A", "Hạng 2" and "2 hồ sơ đang xử lý"

#### Scenario: app-shell.home.no-account
- **GIVEN** no account exists on the device
- **WHEN** the user opens any route
- **THEN** the onboarding screen is shown instead
