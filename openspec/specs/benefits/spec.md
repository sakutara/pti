# benefits Specification

## Purpose
Tra cứu quyền lợi theo hạng, loại người được bảo hiểm và năm hợp đồng.

## Requirements

### Requirement: Load datasets offline
The app SHALL load the bundled datasets listed in `data/manifest.json`, validate each against its schema, and keep working offline from the service worker precache; a dataset that fails validation SHALL be reported to the user and not used.

#### Scenario: benefits.dataset.load
- **WHEN** the app loads `data/manifest.json` and `data/benefits/2026.json` that match the schema
- **THEN** the benefits page can read 4 tiers for policy year 2026

#### Scenario: benefits.dataset.invalid
- **GIVEN** a benefits file where tier 3 has `copayPercent` 150
- **WHEN** the dataset is loaded
- **THEN** the benefits page shows "Dữ liệu quyền lợi bị lỗi" and no benefit values

#### Scenario: benefits.dataset.offline
- **GIVEN** the app was opened once online and the device is now offline
- **WHEN** the user opens `#/benefits`
- **THEN** the benefits are shown from the precache

### Requirement: Policy year selection
The app SHALL apply the policy year whose `effectiveFrom`–`effectiveTo` range contains the reference date (today on the benefits page, the treatment date for claims), and SHALL say when no policy year covers that date.

#### Scenario: benefits.year.by-date
- **GIVEN** policy years 2025 (2025-01-01 → 2025-12-31) and 2026 (2026-01-01 → 2026-12-31)
- **WHEN** the reference date is 2026-03-15
- **THEN** policy year 2026 is applied

#### Scenario: benefits.year.none
- **GIVEN** only policy year 2026
- **WHEN** the reference date is 2027-02-01
- **THEN** the page says "Chưa có dữ liệu quyền lợi cho ngày 01/02/2027"

### Requirement: Benefits of a person
The benefits page SHALL show, for the selected person (holder by default), the tier and member type and the matching values grouped by category in the order outpatient, dental, optical, inpatient, maternity, accident, life, income, formatted in VNĐ with unit, day limit and notes.

#### Scenario: benefits.person.default-holder
- **GIVEN** a holder with tier 2 and a dependent with tier 3
- **WHEN** the user opens `#/benefits`
- **THEN** the page shows the holder's name, "Hạng 2", "Nhân viên" and the employee values of tier 2

#### Scenario: benefits.person.switch
- **WHEN** the user selects a voluntary dependent of tier 3
- **THEN** the page shows "Hạng 3", "Người thân tự nguyện" and outpatient "16.500.000 đ/năm"

#### Scenario: benefits.person.format
- **GIVEN** an employee of tier 2
- **WHEN** the outpatient group is shown
- **THEN** it reads "16.000.000 đ/năm" and "4.000.000 đ/lần khám"

#### Scenario: benefits.person.copay
- **GIVEN** a voluntary dependent
- **WHEN** an inpatient, maternity, outpatient or dental group is shown
- **THEN** it reads "Đồng chi trả 30%", and no co-pay is shown for an employee

#### Scenario: benefits.person.special-values
- **WHEN** a value is "actual" or a text such as "30 tháng lương"
- **THEN** it reads "Chi trả thực tế đến hạn mức" or the text

#### Scenario: benefits.person.not-covered
- **GIVEN** a dependent
- **WHEN** the optical group is shown
- **THEN** it reads "Không có quyền lợi này"

### Requirement: Policy conditions
The benefits page SHALL show the extensions, the waiting periods of the selected person's member type, the exclusions (each linking to the extension that overrides part of it), the claim deadline in days and the insurer hotline.

#### Scenario: benefits.conditions.waiting
- **GIVEN** a voluntary dependent
- **WHEN** the page renders
- **THEN** the waiting periods include 6 months for special and pre-existing diseases

#### Scenario: benefits.conditions.override
- **WHEN** the user reads the exclusion about refractive errors
- **THEN** it points to the eye-care benefit that covers glasses for employees

#### Scenario: benefits.conditions.deadline
- **WHEN** the page renders for policy year 2026
- **THEN** it shows a claim deadline of 365 days and the hotline "1900 5454 75"

### Requirement: Compare tiers
The benefits page SHALL let the user compare all four tiers of the selected person's member type for every category.

#### Scenario: benefits.compare.layout.wide
- **WHEN** the viewport is 1280 px wide and the user opens the comparison
- **THEN** a table shows one column per tier and one row per benefit, with the selected person's tier column highlighted

#### Scenario: benefits.compare.layout.narrow
- **WHEN** the viewport is 360 px wide and the user opens the comparison
- **THEN** a tab per tier is shown and one tier's benefits are visible at a time, without horizontal page scroll

### Requirement: Verification label
When the applied benefits dataset has `verified` false, the benefits page SHALL show a visible "Chưa xác minh" label explaining that values must be checked against the policy documents.

#### Scenario: benefits.verified.unverified
- **GIVEN** the 2026 dataset has `verified` false
- **WHEN** the benefits page renders
- **THEN** the label "Chưa xác minh" and its explanation are visible above the benefits

#### Scenario: benefits.verified.verified
- **GIVEN** the 2026 dataset has `verified` true
- **WHEN** the benefits page renders
- **THEN** no "Chưa xác minh" label is shown

### Requirement: Entry points
Trang chủ and each person's page SHALL link to that person's benefits.

#### Scenario: benefits.entry.home
- **WHEN** the user taps "Quyền lợi" on Trang chủ
- **THEN** `#/benefits` opens with the holder selected

#### Scenario: benefits.entry.person
- **WHEN** the user taps "Quyền lợi" on a dependent's page
- **THEN** `#/benefits/<personId>` opens with that dependent selected
