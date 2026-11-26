## ADDED Requirements

### Requirement: Onboarding creates the local account
On first launch the app SHALL ask for the holder's required details (full name, date of birth, tier 1–4; the holder's member type is employee) and optional details (ID number, phone, email, address, employee code, job title, policyholder name, contract/certificate code, card number, card validity), then create exactly one `account` record and one holder `person`, without any login or network call.

#### Scenario: account.onboarding.create
- **GIVEN** no account exists
- **WHEN** the user enters full name "Nguyễn Văn A", date of birth 1990-05-01, tier 2 and confirms
- **THEN** one account with `administrator` "marsh" and one person with `role` "holder", `relation` "self" are stored
- **AND** the app navigates to Trang chủ

#### Scenario: account.onboarding.validation
- **WHEN** the user confirms with an empty full name or a date of birth in the future
- **THEN** nothing is stored and the invalid field shows an error message

#### Scenario: account.onboarding.no-network
- **GIVEN** the device is offline
- **WHEN** the user completes onboarding
- **THEN** the account is created and no network request is made

#### Scenario: account.onboarding.install-hint
- **GIVEN** the app is not running as an installed app (`display-mode` is not `standalone`)
- **WHEN** onboarding completes
- **THEN** a one-time hint explains how to add the app to the home screen and that data lives only on this device

### Requirement: Edit holder and claim settings
The Tài khoản page SHALL let the user edit every holder field, the default bank account (bank name, account holder name, account number, optional bank address) and the claim settings: administrator (only "Marsh" selectable in this phase), claim email and CC addresses.

#### Scenario: account.settings.claim-email
- **WHEN** the user enters claim email "claims@example.com" and CC "me@example.com"
- **THEN** `account.claimEmail` is "claims@example.com" and `account.claimCc` is ["me@example.com"]

#### Scenario: account.settings.invalid-email
- **WHEN** the user enters "abc" as claim email
- **THEN** the value is not saved and the field shows an email-format error

#### Scenario: account.settings.offline
- **GIVEN** the device is offline
- **WHEN** the user changes the holder's phone number
- **THEN** the change is stored and an outbox op `person.upsert` is queued in the same transaction

#### Scenario: account.settings.resync
- **GIVEN** 2 account edits were made offline
- **WHEN** the device comes back online
- **THEN** the sync engine flushes both ops through the active adapter and the outbox is empty

#### Scenario: account.layout.narrow
- **WHEN** the viewport is 360 px wide
- **THEN** the holder, dependents, claim settings and backup sections are stacked in one column

#### Scenario: account.layout.wide
- **WHEN** the viewport is 1280 px wide
- **THEN** the person list is shown in a left pane and the selected person's form in a right pane

### Requirement: Manage dependents
The user SHALL be able to add, edit and delete dependents, each with relation (spouse, child, parent, other), full name, date of birth, tier, member type (sponsored or voluntary) and the same optional fields as the holder, including an own bank account that falls back to the default bank account when empty.

#### Scenario: account.dependents.add
- **WHEN** the user adds a dependent "Nguyễn Thị B", relation spouse, date of birth 1992-03-10, tier 3, member type voluntary
- **THEN** a person with `role` "dependent" is stored and appears in the person list

#### Scenario: account.dependents.bank-fallback
- **GIVEN** a dependent with no own bank account and an account default bank "VCB / NGUYEN VAN A / 0123"
- **WHEN** the app resolves the payout bank for that dependent
- **THEN** it returns "VCB / NGUYEN VAN A / 0123"

#### Scenario: account.dependents.delete
- **WHEN** the user deletes a dependent and confirms
- **THEN** the person is soft-deleted (`deleted` = 1), disappears from the list, and an outbox op `person.delete` is queued

#### Scenario: account.dependents.holder-not-deletable
- **WHEN** the user views the holder
- **THEN** no delete action is offered

### Requirement: Card wallet
Each person SHALL have a card front and optional card back image, taken with the camera or picked from files, stored on the device after downscaling, and viewable full screen with the person's name, card number and validity, offline.

#### Scenario: account.card.capture
- **WHEN** the user picks a 4000 × 3000 JPEG as card front for the holder
- **THEN** a `files` record of kind "card-front" is stored whose longest edge is at most 2000 px
- **AND** the holder's `cardFrontFileId` points to it

#### Scenario: account.card.replace
- **GIVEN** the holder already has a card front image
- **WHEN** the user picks a new image
- **THEN** the old file is soft-deleted and the new one is linked

#### Scenario: account.card.view-offline
- **GIVEN** the device is offline and the holder has a card front image
- **WHEN** the user opens the card wallet
- **THEN** the image is shown full screen with full name, card number and validity dates

#### Scenario: account.card.expired-warning
- **GIVEN** a card whose `cardValidTo` is before today
- **WHEN** the card is shown
- **THEN** a warning "Thẻ đã hết hiệu lực" is visible

#### Scenario: account.card.a11y
- **WHEN** the card wallet renders its icon-only controls (next card, previous card, close)
- **THEN** each is reachable by role `button` with an accessible name
