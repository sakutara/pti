# backup Specification

## Purpose
Xuất và khôi phục dữ liệu trên thiết bị bằng một file sao lưu.

## Requirements

### Requirement: Export backup file
The app SHALL export all tables except the outbox, including soft-deleted records, together with every stored file's binary content, as one zip file named `pti-backup-YYYYMMDD-HHmm.ptibackup` containing `manifest.json`, `tables/<table>.json` and `files/<id>`.

#### Scenario: backup.export.content
- **GIVEN** an account, 2 persons and 1 card image
- **WHEN** the user exports a backup
- **THEN** the zip contains `manifest.json` with `schemaVersion` equal to the current Dexie version, `tables/account.json` with 1 row, `tables/persons.json` with 2 rows, and `files/<id>` for the card image with identical bytes

#### Scenario: backup.export.offline
- **GIVEN** the device is offline
- **WHEN** the user exports a backup
- **THEN** the file is produced and downloaded without any network request

#### Scenario: backup.export.warning
- **WHEN** the export finishes
- **THEN** the app tells the user the file contains health and personal data and should be kept somewhere safe

### Requirement: Restore backup file
The app SHALL import a `.ptibackup` file, reject files from another app or a newer schema version, and merge records by `updatedAt` so that the newer copy of each record wins, restoring file blobs for records it imports.

#### Scenario: backup.import.merge
- **GIVEN** a device where person P has `updatedAt` 100 and a backup where P has `updatedAt` 200
- **WHEN** the user imports the backup
- **THEN** P is replaced by the backup copy and the import summary shows the number of records imported

#### Scenario: backup.import.keep-newer
- **GIVEN** a device where person P has `updatedAt` 300 and a backup where P has `updatedAt` 200
- **WHEN** the user imports the backup
- **THEN** the device copy of P is kept

#### Scenario: backup.import.reject-newer-schema
- **WHEN** the user imports a backup whose `schemaVersion` is greater than the app's
- **THEN** nothing is changed and the app says the backup comes from a newer version of the app

#### Scenario: backup.import.reject-foreign
- **WHEN** the user imports a zip without a valid `manifest.json` of this app
- **THEN** nothing is changed and an error message is shown

#### Scenario: backup.import.resync
- **GIVEN** an import changed 5 records
- **WHEN** the import finishes
- **THEN** one outbox op per changed record is queued so a future sync adapter receives them

### Requirement: Storage safety
The app SHALL request persistent storage after the first account is created, and the Tài khoản page SHALL show whether storage is persistent, the storage used, and the date of the last backup export.

#### Scenario: backup.storage.persist
- **WHEN** onboarding creates the account
- **THEN** `navigator.storage.persist()` is called once and its result is shown in the backup section

#### Scenario: backup.storage.last-export
- **GIVEN** the last export happened on 2026-11-20
- **WHEN** the user opens the backup section
- **THEN** it shows "Sao lưu gần nhất: 20/11/2026"
