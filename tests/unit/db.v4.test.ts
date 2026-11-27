import { describe, it, expect, afterEach } from 'vitest'
import Dexie from 'dexie'
import { AppDB } from '../../src/db/db'
import type { DocumentRecord } from '../../src/domain/document-types'

const opened: AppDB[] = []
const names: string[] = []

function freshName() {
  const name = 't-' + crypto.randomUUID()
  names.push(name)
  return name
}

function freshDb(name = freshName()) {
  const db = new AppDB(name)
  opened.push(db)
  return db
}

afterEach(async () => {
  for (const db of opened.splice(0)) db.close()
  for (const name of names.splice(0)) await Dexie.delete(name)
})

function document(id: string): DocumentRecord {
  return {
    id,
    personId: 'person-1',
    claimId: null,
    category: 'invoice',
    fileIds: [],
    docDate: '2026-11-20',
    amount: 300000,
    amountSource: 'manual',
    amountConfirmed: true,
    ocrStatus: 'none',
    ocrText: null,
    ocrCandidates: [],
    lowResolution: false,
    createdAt: 1,
    updatedAt: 1,
    deleted: 0,
  }
}

describe('claims.wizard.create-draft: Dexie v4 schema', () => {
  it('claims.wizard.create-draft: db.verno is 4 and the claims and claimEvents tables have the indexes', async () => {
    const db = freshDb()
    await db.open()

    expect(db.verno).toBe(4)
    expect(db.tables.map((t) => t.name)).toEqual(expect.arrayContaining(['claims', 'claimEvents']))

    expect(db.claims.schema.primKey.name).toBe('id')
    const claimIndexes = db.claims.schema.indexes.map((i) => i.name)
    expect(claimIndexes).toEqual(expect.arrayContaining(['personId', 'status', 'treatmentDate', 'updatedAt']))

    expect(db.claimEvents.schema.primKey.name).toBe('id')
    const eventIndexes = db.claimEvents.schema.indexes.map((i) => i.name)
    expect(eventIndexes).toEqual(expect.arrayContaining(['claimId', 'at', 'updatedAt']))
  })

  it('claims.wizard.create-draft: a v3 database opens as v4 and keeps its documents', async () => {
    const name = freshName()

    const v3 = new Dexie(name)
    v3.version(1).stores({
      settings: 'key',
      outbox: 'id, createdAt',
    })
    v3.version(2).stores({
      settings: 'key',
      outbox: 'id, createdAt',
      account: 'id, updatedAt',
      persons: 'id, accountId, updatedAt',
      files: 'id, [ownerType+ownerId], sha256, updatedAt',
    })
    v3.version(3).stores({
      documents: 'id, personId, claimId, category, updatedAt',
    })
    await v3.open()
    expect(v3.verno).toBe(3)
    await v3.table('documents').put(document('doc-1'))
    v3.close()

    const upgraded = freshDb(name)
    await upgraded.open()

    expect(upgraded.verno).toBe(4)
    expect(await upgraded.documents.get('doc-1')).toEqual(document('doc-1'))
    expect(await upgraded.claims.count()).toBe(0)
    expect(await upgraded.claimEvents.count()).toBe(0)
  })
})
