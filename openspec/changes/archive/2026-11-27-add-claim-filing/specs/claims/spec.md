## ADDED Requirements

### Requirement: Claim wizard
The app SHALL guide the user through creating a claim in the steps person, claim type, treatment, invoices, documents and review, SHALL save the claim as a `draft` after every step, and SHALL let the user leave and resume a draft at the step where they left.

#### Scenario: claims.wizard.create-draft
- **WHEN** the user picks the holder and type outpatient and continues
- **THEN** a claim with status `draft`, the holder's `personId` and type `outpatient` is stored

#### Scenario: claims.wizard.fields
- **WHEN** the user fills the type and treatment steps
- **THEN** the types offered are outpatient, dental, optical (employee only), inpatient and maternity, and treatment asks for a short reason, date, facility (picked or typed), diagnosis, days off work, situation flags, and admission and discharge dates for inpatient and maternity

#### Scenario: claims.wizard.accident-excluded
- **WHEN** the user opens the claim type step
- **THEN** no accident or death type is offered and a note says those cases are handled directly with PTI, showing the hotline

#### Scenario: claims.wizard.resume
- **GIVEN** a draft whose treatment step is complete and whose invoices step is not
- **WHEN** the user opens the draft
- **THEN** the wizard opens at the invoices step with earlier answers filled in

#### Scenario: claims.wizard.facility-manual
- **WHEN** the user types a facility name that is not in the dataset
- **THEN** the claim stores `facilityId` null and the typed `facilityName`

#### Scenario: claims.wizard.offline
- **GIVEN** the device is offline
- **WHEN** the user completes the treatment step
- **THEN** the claim is updated and an outbox op `claim.upsert` is queued in the same transaction

#### Scenario: claims.wizard.resync
- **GIVEN** 4 claim writes were made offline
- **WHEN** the device comes back online
- **THEN** the sync engine flushes the 4 ops and the outbox is empty

#### Scenario: claims.wizard.layout.narrow
- **WHEN** the viewport is 360 px wide
- **THEN** one step is shown at a time with a step indicator and next/back controls fixed at the bottom

#### Scenario: claims.wizard.layout.wide
- **WHEN** the viewport is 1280 px wide
- **THEN** the step list is a left column and the current step's form is beside it, with the pre-check panel on the right

### Requirement: Pre-submission checks
The app SHALL evaluate for the claim's person and dates, and show as warnings that never prevent saving: card validity, days left to the claim deadline, invoice dates, a child's age, benefit coverage, excluded facilities and direct billing.

#### Scenario: claims.check.deadline
- **GIVEN** treatment date 2026-01-10 and `claimDeadlineDays` 365
- **WHEN** today is 2026-11-26
- **THEN** the check shows "Còn 45 ngày để nộp hồ sơ (hạn 10/01/2027)"

#### Scenario: claims.check.deadline-passed
- **GIVEN** treatment date 2025-10-01 and `claimDeadlineDays` 365
- **WHEN** today is 2026-11-26
- **THEN** the check shows a warning that the deadline passed on 01/10/2026

#### Scenario: claims.check.invoice-date
- **GIVEN** treatment date 2026-11-20 and an invoice dated 2026-11-23
- **WHEN** the check runs
- **THEN** it says to add the receipt or dispensing slip of the actual treatment date

#### Scenario: claims.check.discharge-date
- **GIVEN** an inpatient claim admitted 2026-11-01 and discharged 2026-11-05
- **WHEN** the checks run
- **THEN** the deadline counts from 05/11/2026 and an invoice dated 05/11 raises no date warning

#### Scenario: claims.check.child-age
- **GIVEN** a dependent of relation child born 2000-01-01
- **WHEN** the treatment date is 2026-03-01
- **THEN** the check warns that children are insured up to age 25
- **AND** a child born 2001-01-01 gets no such warning

#### Scenario: claims.check.optical-dependent
- **WHEN** the user picks a dependent
- **THEN** the optical claim type is not offered

#### Scenario: claims.check.card-invalid
- **GIVEN** the person's `cardValidTo` is 2025-12-31
- **WHEN** the treatment date is 2026-02-01
- **THEN** the check warns that the card was not valid on the treatment date

#### Scenario: claims.check.not-covered
- **GIVEN** the person's tier has no `maternity` benefit
- **WHEN** the claim type is maternity
- **THEN** the check warns "Hạng N không có quyền lợi thai sản"

#### Scenario: claims.check.blacklisted
- **GIVEN** the chosen facility has `blacklisted` true
- **WHEN** the check runs
- **THEN** it warns that PTI does not pay costs at this facility

#### Scenario: claims.check.direct-billing-hint
- **GIVEN** an outpatient claim at a facility with `outpatient` direct billing
- **WHEN** the check runs
- **THEN** it says this facility offers direct billing for outpatient care, so next time the person can bring the card and ID instead of paying

### Requirement: Claim invoices
The invoices step SHALL let the user add invoices to the claim from the document library or by taking or uploading photos there, edit and confirm each invoice's date and amount, and remove an invoice back to the library; `totalClaimed` SHALL always equal the sum of the confirmed amounts of the claim's invoices.

#### Scenario: claims.invoices.total
- **WHEN** the claim has confirmed invoices of 300000 and 450000
- **THEN** `totalClaimed` is 750000 and the step shows "750.000 đ"

#### Scenario: claims.invoices.unconfirmed
- **GIVEN** an invoice whose amount of 200000 was proposed by OCR and not confirmed
- **WHEN** the step renders
- **THEN** it is marked "Cần xác nhận" and is not part of the total

#### Scenario: claims.invoices.remove
- **GIVEN** invoices of 300000 and 450000
- **WHEN** the user removes the 450000 invoice from the claim
- **THEN** `totalClaimed` is 300000 and the invoice is back in the library

#### Scenario: claims.invoices.pick
- **GIVEN** documents of which one belongs to another claim
- **WHEN** the user opens the library picker
- **THEN** that document is not offered

### Requirement: Document checklist
The documents step SHALL list the requirements from `claim-requirements.json` that apply to the claim type and whose conditions hold for the claim (flags and claim total), mark each as required or optional, show its content checklist, treat a requirement as met when the claim has a document of one of its categories, and let the user add documents or mark an optional requirement as not applicable.

#### Scenario: claims.docs.outpatient
- **WHEN** an outpatient claim without flags opens the documents step
- **THEN** the list contains prescription or medical book and VAT invoice as required

#### Scenario: claims.docs.public-breakdown
- **GIVEN** an outpatient claim of 900000 flagged as a public facility
- **WHEN** the documents step opens
- **THEN** the itemised bill is not required
- **AND** with a total of 1200000 it is required

#### Scenario: claims.docs.optical
- **WHEN** an optical claim opens the documents step
- **THEN** the examination record with a diagnosis, the glasses prescription and the invoice are required

#### Scenario: claims.docs.attach
- **WHEN** the user takes 2 photos for the prescription requirement
- **THEN** 2 documents of category prescription belong to the claim and the requirement is met

#### Scenario: claims.docs.reuse
- **GIVEN** the library holds a prescription of this person that is in no claim
- **WHEN** the user picks it for the requirement
- **THEN** the document belongs to the claim without storing the image again

#### Scenario: claims.docs.detach
- **WHEN** the user removes a document from the claim
- **THEN** it returns to the library with its fields and images

#### Scenario: claims.docs.progress
- **GIVEN** 3 required requirements of which 2 are met
- **WHEN** the documents step renders
- **THEN** it shows "2/3 chứng từ bắt buộc"

#### Scenario: claims.docs.a11y
- **WHEN** a requirement row renders its icon-only camera, pick-image and remove controls
- **THEN** each is reachable by role `button` with an accessible name that includes the requirement title

### Requirement: Invoice guidance
The app SHALL provide an invoice guidance card, reachable from the claim wizard and from Trang chủ, telling the user to have the invoice issued to the insured person (full name, residential address matching the medical record, ID number recommended) and signed by them, on the treatment or discharge date, with an itemised bill and a tax lookup code, with a one-tap copy for each of the person's values.

#### Scenario: claims.invoice.person-name
- **GIVEN** the claim is for dependent "Nguyễn Thị B"
- **WHEN** the card opens from that claim
- **THEN** the buyer name, address and ID number are hers

#### Scenario: claims.invoice.copy
- **WHEN** the user taps copy next to the address
- **THEN** the address is written to the clipboard and a confirmation is shown

#### Scenario: claims.invoice.missing-address
- **GIVEN** the person has no address
- **WHEN** the card opens
- **THEN** it offers to add the address to the person

#### Scenario: claims.invoice.offline
- **GIVEN** the device is offline
- **WHEN** the user opens the invoice guidance card
- **THEN** all values are shown

### Requirement: Claim list
The Hồ sơ claim page SHALL list claims newest treatment date first with person, type, treatment date, total and status, SHALL filter by status group (đang soạn, đang xử lý, đã xong) and by person, and SHALL let the user delete a draft after confirmation.

#### Scenario: claims.list.filter
- **GIVEN** claims in status draft, submitted, need_info and paid
- **WHEN** the user selects "Đang xử lý"
- **THEN** only the submitted and need_info claims are listed

#### Scenario: claims.list.delete-draft
- **WHEN** the user deletes a draft and confirms
- **THEN** the claim is soft-deleted, its documents return to the library and outbox ops are queued for each change

#### Scenario: claims.list.no-delete-submitted
- **WHEN** the user views a submitted claim
- **THEN** no delete action is offered
