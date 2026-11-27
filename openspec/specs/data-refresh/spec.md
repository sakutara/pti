# data-refresh Specification

## Purpose
Làm mới định kỳ danh sách cơ sở y tế từ API công khai của PTI.

## Requirements

### Requirement: Fetch PTI facilities
The refresh script SHALL fetch every page of the PTI public facility search for direct-billing facilities (`isPtiGuarantee=NVCN031.1`, `blacklist=PLC040.0`) and for excluded facilities (`blacklist=PLC040.1`), sequentially with at least 500 ms between requests, and SHALL tag each facility with the province whose filtered query returned it.

#### Scenario: data-refresh.fetch.all-pages
- **GIVEN** the API reports `totalPages` 4 for direct-billing facilities with `pageSize` 100
- **WHEN** the script runs
- **THEN** it requests pages 1 to 4 and outputs every facility returned

#### Scenario: data-refresh.fetch.province
- **GIVEN** the province codebook returns "01 Thành phố Hà Nội" and the query `province=01` returns "Bệnh viện Bạch Mai"
- **WHEN** the script runs
- **THEN** "Bệnh viện Bạch Mai" has `provinceCode` "01" and `provinceName` "Thành phố Hà Nội"

#### Scenario: data-refresh.fetch.throttle
- **WHEN** the script makes consecutive requests
- **THEN** no two requests start less than 500 ms apart and no requests run in parallel

### Requirement: Normalize output
The script SHALL write `public/data/facilities/pti.json` with `fetchedAt`, `source`, `count`, `provinces` and `facilities`, where each facility has a stable `id` derived from its normalized name and address, boolean `inpatient`, `outpatient`, `dental`, `blacklisted`, `network` "pti", and trimmed text fields, sorted by province then name, so that unchanged data produces a byte-identical file apart from `fetchedAt`.

#### Scenario: data-refresh.normalize.codes
- **GIVEN** a raw record with `inpatientGuarantee.code` "NVCN028.1", `outpatientGuarantee.code` "NVCN032.2", `dentalGuarantee.code` "NVCN030.1", `blacklist.code` "PLC040.0"
- **WHEN** it is normalized
- **THEN** `inpatient` is true, `outpatient` is false, `dental` is true, `blacklisted` is false

#### Scenario: data-refresh.normalize.stable-id
- **GIVEN** the same facility returned twice with extra spaces and different letter case in its address
- **WHEN** both are normalized
- **THEN** they get the same `id` and appear once in the output

#### Scenario: data-refresh.normalize.deterministic
- **GIVEN** two runs over identical API responses returned in different orders
- **WHEN** both outputs are compared ignoring `fetchedAt`
- **THEN** they are identical

### Requirement: Safety checks
The script SHALL exit with a non-zero code and leave the existing file untouched when the API response shape is not recognized, when any facility lacks a name or address, or when the direct-billing count drops by more than 30% compared to the existing file.

#### Scenario: data-refresh.safety.drop
- **GIVEN** the existing file has 232 direct-billing facilities
- **WHEN** the API returns 150
- **THEN** the script exits non-zero and the file is unchanged

#### Scenario: data-refresh.safety.shape
- **WHEN** the API returns JSON without a `data` or `content` array
- **THEN** the script exits non-zero with a message naming the missing field

### Requirement: Change summary
The script SHALL compare the new output with the existing file and write the counts of added, removed and changed facilities into the `facilities` entry of `public/data/manifest.json` together with a new `version` and `updatedAt`, and SHALL print a Markdown summary listing the added and removed facility names; when nothing changed it SHALL leave both files untouched.

#### Scenario: data-refresh.summary.changes
- **GIVEN** the new data adds 3 facilities and removes 1
- **WHEN** the script finishes
- **THEN** the manifest `facilities.changes` is `{ "added": 3, "removed": 1, "changed": 0 }` and the summary lists the 4 names

#### Scenario: data-refresh.summary.no-change
- **GIVEN** the API data equals the existing file
- **WHEN** the script finishes
- **THEN** neither `pti.json` nor `manifest.json` is modified

### Requirement: Scheduled workflow
The repository SHALL contain a GitHub Actions workflow that runs the refresh script monthly and on manual dispatch, and, when files changed, commits only `public/data` to `main` with the summary in the commit message; it SHALL NOT build, deploy, create branches or touch `docs/`.

#### Scenario: data-refresh.workflow.triggers
- **WHEN** the workflow file is parsed
- **THEN** it has a `schedule` cron for day 1 of each month and a `workflow_dispatch` trigger

#### Scenario: data-refresh.workflow.no-deploy
- **WHEN** the workflow file is parsed
- **THEN** no step runs `npm run build` or `npm run deploy`, no branch or pull request is created, and the only path staged is `public/data`
