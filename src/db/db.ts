import Dexie, { type EntityTable } from 'dexie'
import type { OutboxOp } from '../sync/outbox'
import type { Account, Person, StoredFile } from '../domain/types'
import type { DocumentRecord } from '../domain/document-types'
import type { Claim, ClaimEvent } from '../domain/claim-types'

export interface Setting { key: string; value: unknown; updatedAt: number }

/** Fields every synced record carries. */
export interface SyncedRecord { id: string; updatedAt: number; deleted: 0 | 1 }

export class AppDB extends Dexie {
  settings!: EntityTable<Setting, 'key'>
  outbox!: EntityTable<OutboxOp, 'id'>
  account!: EntityTable<Account, 'id'>
  persons!: EntityTable<Person, 'id'>
  files!: EntityTable<StoredFile, 'id'>
  documents!: EntityTable<DocumentRecord, 'id'>
  claims!: EntityTable<Claim, 'id'>
  claimEvents!: EntityTable<ClaimEvent, 'id'>

  constructor(name = 'pti') {
    super(name)
    // Never edit an old version block: add db.version(n+1) with .upgrade() and
    // record it in knowledge/data/<table>.md.
    this.version(1).stores({
      settings: 'key',
      outbox: 'id, createdAt',
    })
    this.version(2).stores({
      settings: 'key',
      outbox: 'id, createdAt',
      account: 'id, updatedAt',
      persons: 'id, accountId, updatedAt',
      files: 'id, [ownerType+ownerId], sha256, updatedAt',
    })
    // v3 adds documents; tables not listed keep their v2 schema. No upgrade step needed.
    this.version(3).stores({
      documents: 'id, personId, claimId, category, updatedAt',
    })
    // v4 adds claims and claimEvents; no upgrade step needed.
    this.version(4).stores({
      claims: 'id, personId, status, treatmentDate, updatedAt',
      claimEvents: 'id, claimId, at, updatedAt',
    })
  }
}

export const db = new AppDB()

export const newId = () => crypto.randomUUID()
let lastNow = 0
/**
 * Epoch ms for stamps and createdAt. Strictly increasing within this page session: two writes in the same millisecond
 * get different values, so records written in a burst sort in write order.
 */
export const now = (): number => {
  const t = Date.now()
  lastNow = t > lastNow ? t : lastNow + 1
  return lastNow
}
