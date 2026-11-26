## ADDED Requirements

### Requirement: Ready state
A claim SHALL become `ready` only when every applicable required document is present, every invoice (at least one) has a confirmed amount and every required claim form field is filled; the review step SHALL list what is missing with a link to fill it.

#### Scenario: claim-submission.ready.missing
- **GIVEN** a claim without a prescription and a holder without employee number
- **WHEN** the review step renders
- **THEN** it lists "Đơn thuốc hoặc sổ khám" and "Mã số nhân viên" as missing and the build action is disabled

#### Scenario: claim-submission.ready.form-fields
- **WHEN** one of reason, treatment date, facility, diagnosis, patient name, date of birth, tier, policyholder name, contract number, phone number, employee name, employee number, job title, employee email or payout bank account is empty
- **THEN** the claim cannot become `ready`

#### Scenario: claim-submission.ready.unconfirmed-amount
- **GIVEN** one invoice amount is not confirmed
- **WHEN** the review step renders
- **THEN** it asks to confirm that invoice and the build action is disabled

#### Scenario: claim-submission.ready.complete
- **GIVEN** nothing is missing
- **WHEN** the user builds the files
- **THEN** the claim status becomes `ready` and a `claimEvents` entry with status `ready` is stored

### Requirement: Filled claim form
The app SHALL generate on the device a PDF claim form by writing the user's data onto the blank owner-provided template: personal, payment and treatment fields, and the table of medical expenses with one row per invoice and the total in figures and Vietnamese words, with signature boxes left blank; the file name SHALL be `GYC bồi thường <reason>.pdf`.

#### Scenario: claim-submission.form.fields
- **GIVEN** a dependent's claim
- **WHEN** the form is built
- **THEN** patient name, date of birth and tier are the dependent's, employee name, number, job title and email are the holder's, and policyholder, contract number, bank details, days off, visit date, diagnosis and facility are filled with Vietnamese diacritics intact

#### Scenario: claim-submission.form.expenses
- **GIVEN** invoices dated 2026-11-20 (450000) and 2026-11-18 (300000)
- **WHEN** the form is built
- **THEN** the table lists 18/11 then 20/11 with their amounts, the total "750.000", and the claimed amount on page 1 is the same

#### Scenario: claim-submission.form.words
- **WHEN** the total is 2718900
- **THEN** the words are "hai triệu bảy trăm mười tám nghìn chín trăm đồng chẵn"

#### Scenario: claim-submission.form.many-rows
- **GIVEN** 40 invoices
- **WHEN** the form is built
- **THEN** every invoice is listed, extra copies of the table page hold the remaining rows and the total is only on the last one

#### Scenario: claim-submission.form.long-values
- **GIVEN** a diagnosis longer than its field
- **WHEN** the form is built
- **THEN** it is wrapped or shrunk to stay inside the field and is not cut off

#### Scenario: claim-submission.form.blank-template
- **WHEN** the shipped template is read
- **THEN** it contains the form labels and no person's data, company name or contract number

#### Scenario: claim-submission.form.preview
- **GIVEN** the device is offline
- **WHEN** the user previews the claim form
- **THEN** the PDF is shown without any network request

### Requirement: Attachment files
Besides the claim form the app SHALL build exactly one PDF `Chứng từ <reason>.pdf` holding every photo and e-invoice of the claim in checklist order; the two attachments SHALL total less than 15 MB, lowering photo quality only as far as a floor of 1600 px at JPEG quality 0.65.

#### Scenario: claim-submission.attachments.two-files
- **GIVEN** a ready claim with reason "kính mắt"
- **WHEN** the files are built
- **THEN** there are exactly "GYC bồi thường kính mắt.pdf" and "Chứng từ kính mắt.pdf", stored as `files` records of kind "bundle"

#### Scenario: claim-submission.attachments.order
- **GIVEN** one prescription with 2 pages and one invoice
- **WHEN** the document PDF is built
- **THEN** it has 3 pages: prescription ×2 then invoice, each photo page labelled

#### Scenario: claim-submission.attachments.size
- **GIVEN** photos whose first-pass files exceed 15 MB
- **WHEN** they are built
- **THEN** photos are re-encoded step by step until the total is at most 15 MB, keeping colour

#### Scenario: claim-submission.attachments.keep-quality
- **GIVEN** files that total 6 MB with the stored photos
- **WHEN** they are built
- **THEN** no photo is re-encoded

#### Scenario: claim-submission.attachments.einvoice
- **GIVEN** a claim with 2 photos and a 2-page e-invoice PDF
- **WHEN** the files are built
- **THEN** the document PDF has 4 pages and the e-invoice pages are copied without being rasterised

#### Scenario: claim-submission.attachments.too-large
- **GIVEN** files that stay above 15 MB at the floor quality
- **WHEN** the user builds them
- **THEN** no files are produced, the claim does not become `ready`, and the app shows the total size and the largest documents to remove or replace

#### Scenario: claim-submission.attachments.offline
- **GIVEN** the device is offline
- **WHEN** the user builds the files
- **THEN** both are produced and stored on the device

### Requirement: Email composition
The app SHALL compose the email from the administrator configuration and account settings: recipient (account override, else the administrator's address), CC (administrator's and account's), subject "HS YCBT – <patient name> – <contract number> – <policyholder name>", a Vietnamese body with the patient, employee, treatment, total and attachment names, and for the fallback channel a `mailto:` URL of at most 1800 characters.

#### Scenario: claim-submission.email.recipient-default
- **GIVEN** no account override
- **WHEN** the email is composed for Marsh
- **THEN** the recipient is "nhanhsbt.mn@pti.com.vn" and CC contains "vietnamMMBclaims@marsh.com"

#### Scenario: claim-submission.email.recipient-account
- **GIVEN** `account.claimEmail` "claims@example.com" and account CC ["me@example.com"]
- **WHEN** the email is composed
- **THEN** the recipient is "claims@example.com" and CC holds the Marsh address and "me@example.com" once each

#### Scenario: claim-submission.email.no-recipient
- **GIVEN** neither the account nor the administrator has a claim email
- **WHEN** the user reaches the send step
- **THEN** the app explains that the address is missing and links to the claim settings

#### Scenario: claim-submission.email.subject
- **GIVEN** patient "Nguyễn Văn A", contract number "HD-001" and policyholder "Công ty Mẫu"
- **WHEN** the email is composed
- **THEN** the subject is "HS YCBT – Nguyễn Văn A – HD-001 – Công ty Mẫu"

#### Scenario: claim-submission.email.length
- **GIVEN** a claim with 30 invoices
- **WHEN** the email is composed
- **THEN** the `mailto:` URL is at most 1800 characters, shortening the body first

### Requirement: Send by Gmail
When Gmail is connected, the send step SHALL show a confirmation with sender, recipient, CC, an editable subject and the attachment names and sizes, and SHALL send the claim form and document PDFs from the user's own account through the Gmail API only after the user taps "Gửi"; on success it SHALL set the claim to `submitted` with `submittedAt`, `sentVia` "gmail" and the thread id.

#### Scenario: claim-submission.gmail.confirm
- **GIVEN** Gmail is connected as "me@gmail.com" and the claim is `ready`
- **WHEN** the user opens the send step
- **THEN** the confirmation shows "me@gmail.com", the recipient, CC, subject and "GYC bồi thường kính mắt.pdf" and "Chứng từ kính mắt.pdf" with their sizes and nothing is sent until the user taps "Gửi"

#### Scenario: claim-submission.gmail.success
- **WHEN** the user taps "Gửi" and the Gmail API answers success with thread id "t1"
- **THEN** the claim status is `submitted`, `sentVia` is "gmail", `gmailThreadId` is "t1" and a `claimEvents` entry with status `submitted` is stored

#### Scenario: claim-submission.gmail.message
- **WHEN** the email is built for sending
- **THEN** it is a multipart message with the sender, recipient and CC addresses, an RFC 2047 encoded UTF-8 subject, a UTF-8 text body and both PDFs as `application/pdf` attachments whose bytes equal the built files

#### Scenario: claim-submission.gmail.failure
- **GIVEN** the Gmail API answers with an error
- **WHEN** the user taps "Gửi"
- **THEN** the claim stays `ready`, no `submitted` event is stored and the error and a retry action are shown

#### Scenario: claim-submission.gmail.offline
- **GIVEN** the device is offline
- **WHEN** the send step renders
- **THEN** the "Gửi" action is disabled with an explanation, the claim stays `ready`, and the app does not send automatically when the device comes back online

#### Scenario: claim-submission.gmail.open-thread
- **GIVEN** a claim sent by Gmail with thread id "t1"
- **WHEN** the claim detail renders
- **THEN** a link opens `https://mail.google.com/mail/u/0/#all/t1`

### Requirement: Fallback send with mailto
When Gmail is not connected, not configured, or the user chooses another mail app, the send step SHALL show three ordered actions — save the PDF files, open the prepared `mailto:` email, confirm the email was sent — and SHALL set the claim to `submitted` with `sentVia` "mailto" only when the user confirms; when the browser can share files it SHALL also offer sharing the files, copying the recipient address to the clipboard first.

#### Scenario: claim-submission.send.flow
- **WHEN** the user saves the files, opens the email, and taps "Tôi đã gửi email"
- **THEN** the claim status is `submitted`, `sentVia` is "mailto", `submittedAt` is set and a `claimEvents` entry with status `submitted` is stored

#### Scenario: claim-submission.send.not-confirmed
- **WHEN** the user opens the email and returns without confirming
- **THEN** the claim stays `ready`

#### Scenario: claim-submission.send.choose-mailto
- **GIVEN** Gmail is connected
- **WHEN** the user chooses "Dùng ứng dụng email khác"
- **THEN** the three-step mailto flow is shown instead of the Gmail confirmation

#### Scenario: claim-submission.send.share
- **GIVEN** `navigator.canShare({ files })` returns true
- **WHEN** the user taps share
- **THEN** the recipient address is copied to the clipboard and `navigator.share` is called with the PDF files, the subject as title and the body as text

#### Scenario: claim-submission.send.no-share
- **GIVEN** `navigator.canShare` is missing or returns false for files
- **WHEN** the send step renders
- **THEN** no share action is shown

### Requirement: Original documents
For inpatient and maternity claims the app SHALL say before and after sending that the email only serves a completeness check and that the originals must reach the insurer, show the PTI claim centre addresses, and let the user record the date the originals were handed in.

#### Scenario: claim-submission.originals.reminder
- **GIVEN** a ready inpatient claim
- **WHEN** the send step renders
- **THEN** it shows that originals are required and both claim centre addresses

#### Scenario: claim-submission.originals.not-needed
- **GIVEN** a ready outpatient claim
- **WHEN** the send step renders
- **THEN** no original-document step is shown

#### Scenario: claim-submission.originals.confirm
- **GIVEN** a submitted inpatient claim
- **WHEN** the user records that the originals were handed in today
- **THEN** `originalsSubmittedAt` is stored with an outbox op and a timeline entry

### Requirement: Send state is stored locally and resynced
Status changes made while sending SHALL be written with outbox ops in the same transaction and flushed through the active sync adapter when the device is online.

#### Scenario: claim-submission.send.offline
- **GIVEN** the device is offline
- **WHEN** the user confirms a mailto email was sent
- **THEN** the status change is stored and an outbox op `claim.upsert` is queued

#### Scenario: claim-submission.send.resync
- **GIVEN** a status change made offline
- **WHEN** the device comes back online
- **THEN** its outbox ops are flushed and the outbox is empty

### Requirement: Send step layout
The send step SHALL adapt to the viewport.

#### Scenario: claim-submission.layout.narrow
- **WHEN** the viewport is 360 px wide
- **THEN** the confirmation and the actions are stacked in one column with full-width buttons

#### Scenario: claim-submission.layout.wide
- **WHEN** the viewport is 1280 px wide
- **THEN** the actions are beside a preview of the email subject and body

### Requirement: Supplementary submission
For a claim in `need_info`, the app SHALL let the user attach more photos and send again through the same send step (Gmail or mailto), with the subject prefixed "[Bổ sung] ", the claim form rebuilt and the document PDF containing only the photos added since the last submission.

#### Scenario: claim-submission.supplement.subject
- **GIVEN** a claim in `need_info`
- **WHEN** the email is composed
- **THEN** the subject starts with "[Bổ sung] HS YCBT – "

#### Scenario: claim-submission.supplement.bundle
- **GIVEN** 4 photos were sent before and 1 photo was added after `need_info`
- **WHEN** the supplementary files are built
- **THEN** the document PDF has 1 page, the new photo, and the claim form is attached
