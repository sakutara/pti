import Dexie, { type EntityTable } from 'dexie'
import type { OutboxOp } from '../sync/outbox'
import type { Account, Person, StoredFile } from '../domain/types'

export interface Setting { key: string; value: unknown; updatedAt: number }

/** Fields every synced record carries. */
export interface SyncedRecord { id: string; updatedAt: number; deleted: 0 | 1 }

export class AppDB extends Dexie {
  settings!: EntityTable<Setting, 'key'>
  outbox!: EntityTable<OutboxOp, 'id'>
  account!: EntityTable<Account, 'id'>
  persons!: EntityTable<Person, 'id'>
  files!: EntityTable<StoredFile, 'id'>

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
  }
}

export const db = new AppDB()

export const newId = () => crypto.randomUUID()
export const now = () => Date.now()
