# public-pages Specification

## Purpose
Trang giới thiệu và chính sách quyền riêng tư công khai.

## Requirements

### Requirement: About page
The site SHALL serve a static page at `/about/` that states in Vietnamese, with an English summary, what the app does, who it is for, that it is an independent personal non-profit project not affiliated with PTI or Marsh, that all personal data stays on the user's device, and how the optional Gmail permission is used, and that links to `/privacy/` and to the app.

#### Scenario: public-pages.about.content
- **WHEN** the built `/about/index.html` is read without running JavaScript
- **THEN** it contains the app name, a description of preparing and sending insurance claims, the statement that data stays on the device, and the non-affiliation statement

#### Scenario: public-pages.about.gmail-usage
- **WHEN** the page is read
- **THEN** it states that the app asks only for permission to send email on the user's behalf, sends only emails the user composed and confirmed, and cannot read the mailbox

#### Scenario: public-pages.about.links
- **WHEN** the page is read
- **THEN** it links to `/privacy/` and to the app at `/`, and the privacy link is visible without scrolling on a 360 px wide viewport

#### Scenario: public-pages.about.english-summary
- **WHEN** the page is read
- **THEN** it contains a section with `lang="en"` summarizing purpose, data handling and Gmail permission use

### Requirement: Privacy policy page
The site SHALL serve a static page at `/privacy/`, in Vietnamese and English, that states what data the app handles and where it is stored, that no personal data is sent to or stored on any server operated by the project, how Google user data is used, how to revoke access and delete data, a contact email, and the effective date.

#### Scenario: public-pages.privacy.no-server
- **WHEN** the page is read
- **THEN** it states that personal data is stored only in the browser on the user's device and that the project operates no server that receives it

#### Scenario: public-pages.privacy.google-data
- **WHEN** the page is read
- **THEN** it states that the Gmail permission is used only to send emails the user initiates, that mailbox content is never read, that the access token is kept only in memory, and that Google user data is not transferred, sold or used for advertising

#### Scenario: public-pages.privacy.limited-use
- **WHEN** the page is read
- **THEN** it contains the statement that the app's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements

#### Scenario: public-pages.privacy.revoke-delete
- **WHEN** the page is read
- **THEN** it explains how to disconnect Gmail in the app, how to revoke access at `https://myaccount.google.com/permissions`, and how to delete all local data by clearing site data or the in-app reset

#### Scenario: public-pages.privacy.contact
- **WHEN** the built page is checked
- **THEN** it contains a real contact email address and no unreplaced placeholder such as `__CONTACT_EMAIL__`

### Requirement: Served as static pages
`/about/` and `/privacy/` SHALL be served as their own HTML documents by the static host and SHALL NOT be answered with the app shell by the service worker navigation fallback.

#### Scenario: public-pages.routing.not-spa-fallback
- **WHEN** the service worker configuration is read
- **THEN** the navigation fallback denylist contains `/about/` and `/privacy/`

#### Scenario: public-pages.routing.in-dist
- **WHEN** the production build finishes
- **THEN** `dist/about/index.html` and `dist/privacy/index.html` exist

#### Scenario: public-pages.offline
- **GIVEN** the app was opened online once
- **WHEN** the device is offline and the user opens `/privacy/`
- **THEN** the policy page is shown from the precache

#### Scenario: public-pages.layout.narrow
- **WHEN** the pages are opened at 360 px wide
- **THEN** text is readable without horizontal scrolling

#### Scenario: public-pages.layout.wide
- **WHEN** the pages are opened at 1280 px wide
- **THEN** the text column is capped at a readable line length and centered

### Requirement: Links inside the app
The onboarding screen, the Tài khoản page and the app footer SHALL link to the about and privacy pages.

#### Scenario: public-pages.links.onboarding
- **WHEN** the onboarding screen renders
- **THEN** it shows links named "Giới thiệu" and "Chính sách quyền riêng tư" that open `/about/` and `/privacy/`

#### Scenario: public-pages.links.account
- **WHEN** the Tài khoản page renders
- **THEN** the same two links are present
