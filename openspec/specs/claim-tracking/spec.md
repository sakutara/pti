# claim-tracking Specification

## Purpose
Theo dõi trạng thái, kết quả, dòng thời gian và hồ sơ quá hạn phản hồi.

## Requirements

### Requirement: Status updates
The claim detail SHALL let the user record the outcome reported by email, allowing only the transitions submitted → need_info | approved | partially_approved | rejected, need_info → submitted (through supplementary submission) | rejected, approved | partially_approved → paid, and SHALL require an approved amount not greater than the total for approved and partially approved, and a reason for partially approved and rejected.

#### Scenario: claim-tracking.status.partial
- **GIVEN** a submitted claim with total 750000
- **WHEN** the user records partially approved with amount 500000 and reason "Thuốc bổ không được chi trả"
- **THEN** status is `partially_approved`, `approvedAmount` is 500000, `rejectionReason` is stored and a `claimEvents` entry is added

#### Scenario: claim-tracking.status.amount-too-high
- **WHEN** the user records approved with amount 800000 for a total of 750000
- **THEN** nothing is saved and an error is shown

#### Scenario: claim-tracking.status.invalid-transition
- **GIVEN** a claim in status `paid`
- **WHEN** the detail renders
- **THEN** no status change is offered

#### Scenario: claim-tracking.status.offline
- **GIVEN** the device is offline
- **WHEN** the user records an outcome
- **THEN** the claim and the event are stored and outbox ops are queued in the same transaction

#### Scenario: claim-tracking.status.resync
- **GIVEN** 2 outcomes were recorded offline
- **WHEN** the device comes back online
- **THEN** their outbox ops are flushed and the outbox is empty

### Requirement: Timeline
The claim detail SHALL show every `claimEvents` entry oldest first with date, status label, note and amount, and SHALL show the claimed total, the approved amount and the difference once an outcome exists.

#### Scenario: claim-tracking.timeline.order
- **GIVEN** events ready (20/11), submitted (21/11), need_info (28/11)
- **WHEN** the detail renders
- **THEN** the timeline lists them in that order with their dates

#### Scenario: claim-tracking.timeline.amounts
- **GIVEN** total 750000 and approved amount 500000
- **WHEN** the detail renders
- **THEN** it shows "Yêu cầu 750.000 đ", "Được duyệt 500.000 đ", "Chênh lệch 250.000 đ"

#### Scenario: claim-tracking.layout.narrow
- **WHEN** the viewport is 360 px wide
- **THEN** the summary, actions and timeline are stacked in one column

#### Scenario: claim-tracking.layout.wide
- **WHEN** the viewport is 1280 px wide
- **THEN** the claim list is a left pane and the selected claim's detail with its timeline is the right pane

### Requirement: Overdue reply hint
A claim in `submitted` SHALL be marked overdue in the list and detail when more working days (Monday–Friday) have passed than the insurer's reply time for its total (7 below 20,000,000, 15 up to 100,000,000, 20 above), counted from the latest submission, or from the day the originals were handed in for claims that need them.

#### Scenario: claim-tracking.overdue.mark
- **GIVEN** a claim of 750000 submitted on Monday 2026-11-02
- **WHEN** today is Thursday 2026-11-12 (8 working days later)
- **THEN** the claim is marked "Quá thời hạn phản hồi 7 ngày làm việc"

#### Scenario: claim-tracking.overdue.not-yet
- **GIVEN** a claim of 750000 submitted on Monday 2026-11-02
- **WHEN** today is Wednesday 2026-11-11 (7 working days later)
- **THEN** the claim is not marked overdue

#### Scenario: claim-tracking.overdue.large
- **GIVEN** a claim of 25000000 submitted on Monday 2026-11-02
- **WHEN** today is 2026-11-23 (15 working days later)
- **THEN** it is not overdue, and on 2026-11-24 it is

#### Scenario: claim-tracking.overdue.originals-pending
- **GIVEN** a submitted inpatient claim without `originalsSubmittedAt`
- **WHEN** 30 working days have passed
- **THEN** it is not marked overdue and shows "Chưa nộp bản gốc"
