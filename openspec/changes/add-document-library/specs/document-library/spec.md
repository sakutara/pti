## ADDED Requirements

### Requirement: Add photos
The documents page SHALL let the user add documents by taking a photo or by choosing one or more image or PDF files from the device, SHALL store each file as its own document (images downscaled to at most 2400 px keeping colour, PDF files unchanged), and SHALL report files it cannot read without losing the others.

#### Scenario: document-library.add.capture
- **WHEN** the user takes a photo of a receipt
- **THEN** one document with one page is stored and listed first

#### Scenario: document-library.add.upload-many
- **WHEN** the user picks 3 images from the device at once
- **THEN** 3 documents are stored

#### Scenario: document-library.add.einvoice-pdf
- **WHEN** the user picks an e-invoice PDF
- **THEN** one document is stored with the file's bytes unchanged and a preview of its first page

#### Scenario: document-library.add.protected-pdf
- **WHEN** the user picks a password-protected PDF
- **THEN** it is not stored and the app says why

#### Scenario: document-library.add.low-resolution
- **WHEN** the user adds an image whose longest edge is under 1200 px
- **THEN** it is stored and marked as possibly not readable enough

#### Scenario: document-library.add.unreadable
- **WHEN** one of 3 picked files cannot be decoded
- **THEN** 2 documents are stored and the app names the file that failed

#### Scenario: document-library.add.duplicate
- **GIVEN** an image with the same sha256 already belongs to a document that is not deleted
- **WHEN** the user adds it again
- **THEN** no second copy is stored and the app says it is already there

#### Scenario: document-library.add.offline
- **GIVEN** the device is offline
- **WHEN** the user adds a photo
- **THEN** the document is stored and outbox ops are queued in the same transaction

#### Scenario: document-library.add.resync
- **GIVEN** 3 document writes were made offline
- **WHEN** the device comes back online
- **THEN** the sync engine flushes them and the outbox is empty

### Requirement: Organise documents
The user SHALL be able to set each document's category, person, date and, for invoices, amount, add pages to a document, merge selected documents into one, and filter by category, person and "not in a claim".

#### Scenario: document-library.edit.invoice
- **WHEN** the user sets a document to category invoice with date 2026-11-20 and amount 750000
- **THEN** those values are stored with `amountSource` "manual" and `amountConfirmed` true

#### Scenario: document-library.edit.invalid-amount
- **WHEN** the user enters 0, a negative or a non-integer amount
- **THEN** nothing is saved and an error is shown

#### Scenario: document-library.edit.merge
- **GIVEN** two documents not in any claim
- **WHEN** the user selects both and merges them
- **THEN** one document holds both pages in selection order, with the first one's fields, and the other is soft-deleted

#### Scenario: document-library.edit.filter
- **GIVEN** documents of which some belong to a claim
- **WHEN** the user selects "Chưa vào hồ sơ"
- **THEN** only documents with no claim are listed

### Requirement: Delete documents
The user SHALL be able to delete a document that is not in a claim, after confirmation; a document in a claim SHALL first be removed from that claim.

#### Scenario: document-library.delete.free
- **WHEN** the user deletes a document that is in no claim and confirms
- **THEN** the document and its files are soft-deleted and outbox ops are queued

#### Scenario: document-library.delete.in-claim
- **GIVEN** a document that belongs to a claim
- **WHEN** the user opens it
- **THEN** delete is not offered and the claim it belongs to is named

### Requirement: Documents layout
The documents page SHALL adapt to the viewport and its icon-only controls SHALL be accessible.

#### Scenario: document-library.layout.narrow
- **WHEN** the viewport is 360 px wide
- **THEN** documents are a two-column grid and opening one shows its editor full screen

#### Scenario: document-library.layout.wide
- **WHEN** the viewport is 1280 px wide
- **THEN** the grid is on the left and the selected document's editor is a right pane

#### Scenario: document-library.add.a11y
- **WHEN** the editor renders its icon-only add-page control
- **THEN** it is reachable by role `button` with an accessible name
