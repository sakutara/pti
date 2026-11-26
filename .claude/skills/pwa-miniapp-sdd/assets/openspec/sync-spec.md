# sync

## Purpose
Keep local writes durable while offline and resync them when the device reconnects.

## Requirements

### Requirement: Outbox for local writes
Every local write to a synced table SHALL append an outbox operation in the same IndexedDB transaction.

#### Scenario: sync.outbox.atomic
- **WHEN** a repository writes a record and the transaction aborts
- **THEN** neither the record nor the outbox op is stored

#### Scenario: sync.outbox.order
- **WHEN** several ops are queued within the same millisecond
- **THEN** they are flushed in the order they were queued

### Requirement: Resync on reconnect
The app SHALL flush the outbox through the active sync adapter when connectivity returns, on app start, and when the app becomes visible.

#### Scenario: sync.resync.online-event
- **GIVEN** the outbox holds 3 ops and the device is offline
- **WHEN** the `online` event fires
- **THEN** the 3 ops are pushed in creation order and removed from the outbox

#### Scenario: sync.resync.failure-retry
- **GIVEN** the adapter rejects an op
- **WHEN** a flush runs
- **THEN** the op stays in the outbox with `attempts` incremented and `lastError` set

#### Scenario: sync.resync.single-flight
- **WHEN** two flushes are triggered at the same time
- **THEN** the adapter receives each op only once

### Requirement: Sync status
The app SHALL expose online state, pending op count and last sync time to the UI, and SHALL NOT present offline as an error.

#### Scenario: sync.status.offline
- **WHEN** the device goes offline
- **THEN** the status shows offline with the pending count and no error styling
