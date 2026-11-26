## ADDED Requirements

### Requirement: On-device OCR model
The app SHALL read documents only with a model running on the device, SHALL download the model only after the user agrees to the stated size, show progress, allow retrying a failed download, and use it offline afterwards; images SHALL NOT be sent over the network.

#### Scenario: document-ocr.model.consent
- **GIVEN** the model is not on the device
- **WHEN** the user adds an invoice photo
- **THEN** the app offers the download with its size and downloads nothing until the user accepts

#### Scenario: document-ocr.model.progress
- **WHEN** the download runs
- **THEN** downloaded and total size are shown, and the model is marked ready only when every file is stored

#### Scenario: document-ocr.model.failure
- **GIVEN** the connection drops during the download
- **WHEN** the user retries online
- **THEN** only the missing files are downloaded and manual entry stayed usable meanwhile

#### Scenario: document-ocr.model.offline-ready
- **GIVEN** the model is on the device and the device is offline
- **WHEN** the user adds an invoice photo
- **THEN** it is read and no network request carries image data

### Requirement: Reading queue
Invoice documents without a confirmed amount SHALL be queued for reading and processed one at a time whenever the model is ready; a reading failure SHALL leave the document editable by hand.

#### Scenario: document-ocr.queue.offline
- **GIVEN** the device is offline and the model is not downloaded
- **WHEN** the user adds an invoice photo
- **THEN** the document is stored with `ocrStatus` "pending" and the user can type the amount

#### Scenario: document-ocr.queue.resync
- **GIVEN** 3 invoices are pending
- **WHEN** the model becomes ready
- **THEN** they are read one after another and their status becomes "done"

#### Scenario: document-ocr.queue.failure
- **WHEN** reading a document fails
- **THEN** its status is "failed", the next one is processed and the editor offers to read it again

### Requirement: Total amount extraction
From the recognised lines the app SHALL propose the amount the patient has to pay, preferring a patient-payable label over a grand total, ignoring cash tendered, change, tax codes, phone and account numbers, and marking a proposal without a recognised label as low confidence.

#### Scenario: document-ocr.extract.total-label
- **GIVEN** lines "Cộng tiền hàng 2.500.000", "Tổng tiền thanh toán: 2.718.900"
- **THEN** the proposal is 2718900 with high confidence

#### Scenario: document-ocr.extract.patient-share
- **GIVEN** lines "Tổng cộng 1.000.000", "BHYT chi trả 600.000", "Người bệnh phải trả 400.000"
- **THEN** the proposal is 400000

#### Scenario: document-ocr.extract.ignore
- **GIVEN** lines "Tổng cộng 450.000", "Tiền khách đưa 500.000", "Tiền thừa 50.000", "MST: 0100774631"
- **THEN** the proposal is 450000

#### Scenario: document-ocr.extract.next-line
- **GIVEN** the label "TỔNG THANH TOÁN" and "350.000 đ" on the following line
- **THEN** the proposal is 350000

#### Scenario: document-ocr.extract.low-confidence
- **GIVEN** no total label and the amounts 120.000 and 300.000
- **THEN** the proposal is 300000 with low confidence

#### Scenario: document-ocr.extract.none
- **GIVEN** no line holds a valid amount
- **THEN** there is no proposal and the editor asks the user to type it

#### Scenario: document-ocr.extract.date
- **GIVEN** a line "Ngày 04 tháng 10 năm 2026"
- **THEN** the proposed document date is 2026-10-04

### Requirement: E-invoice reading
For a PDF document the app SHALL take the amount and date from the PDF's text when it has any, without needing the OCR model, and SHALL otherwise read its rendered pages with OCR.

#### Scenario: document-ocr.pdf.text
- **GIVEN** the model is not on the device and a PDF whose text holds "Tổng tiền thanh toán 2.718.900"
- **WHEN** it is added
- **THEN** 2718900 is proposed

#### Scenario: document-ocr.pdf.scanned
- **GIVEN** a PDF with no text layer
- **WHEN** it is added
- **THEN** it is queued and its pages are read once the model is ready

### Requirement: User confirms amounts
A proposed amount SHALL be marked unconfirmed until the user confirms or edits it, SHALL be shown beside the image, and SHALL never overwrite an amount the user typed or confirmed.

#### Scenario: document-ocr.review.confirm
- **GIVEN** a proposal of 2718900
- **WHEN** the user confirms it
- **THEN** `amount` is 2718900, `amountSource` "ocr" and `amountConfirmed` true

#### Scenario: document-ocr.review.other-candidate
- **GIVEN** two candidates
- **WHEN** the user picks the second
- **THEN** it becomes the confirmed amount

#### Scenario: document-ocr.review.keep-manual
- **GIVEN** the user typed 700000 while the document was pending
- **WHEN** reading finishes with 750000
- **THEN** `amount` stays 700000 and 750000 is only listed as a candidate

#### Scenario: document-ocr.review.layout.narrow
- **WHEN** the viewport is 360 px wide
- **THEN** the image is above the amount field and both are reachable without horizontal scrolling

#### Scenario: document-ocr.review.layout.wide
- **WHEN** the viewport is 1280 px wide
- **THEN** the image and the fields are side by side
