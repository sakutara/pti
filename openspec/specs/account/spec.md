# account Specification

## Purpose
Tài khoản, người được bảo hiểm, thẻ bảo hiểm và cài đặt claim lưu trên thiết bị.

## Requirements

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
The Tài khoản page SHALL let the user edit every holder field and the claim settings shared by every insured person of the account: administrator (fixed to Marsh, read-only in this phase), claim email and CC addresses. The email fields SHALL start filled with what will be used (the account's values, else the administrator defaults) and SHALL NOT be saved empty. A value equal to the default SHALL be stored as unset.

#### Scenario: account.settings.defaults
- **GIVEN** an account with no claim email or CC of its own and the Marsh administrator file
- **WHEN** the Tài khoản page opens
- **THEN** the administrator shows "Marsh Việt Nam" read-only, the claim email field shows "nhanhsbt.mn@pti.com.vn" and the CC field "vietnamMMBclaims@marsh.com"
- **AND** saving unchanged stores `claimEmail` null and `claimCc` []

#### Scenario: account.settings.claim-email
- **WHEN** the user changes the claim email to "claims@example.com" and CC to "vietnamMMBclaims@marsh.com, me@example.com"
- **THEN** `account.claimEmail` is "claims@example.com" and `account.claimCc` is ["vietnamMMBclaims@marsh.com", "me@example.com"]

#### Scenario: account.settings.required
- **WHEN** the user empties the claim email or CC field and saves
- **THEN** nothing is saved and the emptied field shows a required error

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
The user SHALL be able to add, edit and delete dependents, each with relation (spouse, child, parent, other), full name, date of birth, tier, member type (sponsored or voluntary) and the same optional fields as the holder, except the payout bank account.

#### Scenario: account.dependents.add
- **WHEN** the user adds a dependent "Nguyễn Thị B", relation spouse, date of birth 1992-03-10, tier 3, member type voluntary
- **THEN** a person with `role` "dependent" is stored and appears in the person list

### Requirement: Payout bank account of the employee
Only the employee (holder) SHALL declare the bank account that receives claim payouts, for their own claims and their dependents'. The bank SHALL be picked from the NAPAS bank list (copied from chia-tien) with accent-insensitive search; it is stored as "<short name> - <full name>". A claim's own bank, then the holder's, is used on the claim form; a dependent's bank or the account default bank stored before this rule is used only when the holder has none.

#### Scenario: account.bank.holder-only
- **WHEN** the user picks "Vietcombank (VCB)" after typing "vietcom", account holder "NGUYEN VAN A" and number "0123" on the employee page
- **THEN** the holder's bank is stored with bankName "Vietcombank - Ngân hàng TMCP Ngoại thương Việt Nam"
- **AND** a dependent's page shows no bank fields

#### Scenario: account.bank.dependent-payout
- **GIVEN** a holder with a bank account and a dependent with an older bank account of its own
- **WHEN** the claim form is built for the dependent
- **THEN** the holder's account is printed

#### Scenario: account.dependents.delete
- **WHEN** the user deletes a dependent and confirms
- **THEN** the person is soft-deleted (`deleted` = 1), disappears from the list, and an outbox op `person.delete` is queued

#### Scenario: account.dependents.holder-not-deletable
- **WHEN** the user views the holder
- **THEN** no delete action is offered

### Requirement: Card photo first
The person page and onboarding SHALL start with the insurance card photo: the card front only (PTI cards have no back), taken with the camera or picked from files and stored after downscaling. A photo picked before the person exists is stored right after the person is saved.

#### Scenario: card-scan.front-only
- **WHEN** the person page renders
- **THEN** the card section is the first section and offers only the card front

### Requirement: Card fields read on the device
When the on-device reading model is present, the card photo SHALL be read with VietOCR and the fields found (full name, date of birth, card number, contract code, policyholder, validity, tier, ID number, employee code) copied onto the form for the user to check before saving. Without the model the photo is kept, the model download is offered, and reading starts once it is ready.

#### Scenario: card-scan.ocr.autofill
- **GIVEN** the reading model is ready
- **WHEN** the user picks a card photo whose text reads "Họ tên/Full name: NGUYỄN VĂN THẾ" and "Hiệu lực/Valid: 01/01/2026 - 31/12/2026"
- **THEN** full name "Nguyễn Văn Thế", valid from 2026-01-01 and valid to 2026-12-31 are filled in and a status says how many fields were filled

#### Scenario: card-scan.ocr.merge
- **GIVEN** the prepared copy reads the name "LEVAN AN" and the photo as taken reads "LE VAN AN"
- **WHEN** both readings are combined
- **THEN** the name "Le Van An" is filled in

#### Scenario: card-scan.ocr.no-model
- **GIVEN** the reading model is not downloaded
- **WHEN** the user picks a card photo
- **THEN** the photo is stored, nothing is read, and the model download offer is shown

### Requirement: Card wallet
Each person's card front image SHALL be viewable full screen with the person's name, card number and validity, offline. A card back stored before the front-only rule is still shown.

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
