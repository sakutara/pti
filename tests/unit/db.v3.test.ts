import { describe, it, expect, afterEach } from 'vitest'
import Dexie from 'dexie'
import { AppDB } from '../../src/db/db'
import type { Person } from '../../src/domain/types'

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

function person(id: string): Person {
  return {
    id,
    accountId: 'account-1',
    role: 'holder',
    relation: 'self',
    memberType: 'employee',
    fullName: 'Nguyen Van A',
    dateOfBirth: '1990-01-01',
    idNumber: null,
    phone: null,
    email: null,
    address: null,
    employeeCode: null,
    jobTitle: null,
    tier: 1,
    policyholderName: null,
    contractCode: null,
    cardNumber: null,
    cardValidFrom: null,
    cardValidTo: null,
    cardFrontFileId: null,
    cardBackFileId: null,
    bank: null,
    updatedAt: 1,
    deleted: 0,
  }
}

describe('document-library.add.capture: Dexie v3 schema', () => {
  it('document-library.add.capture: db.verno is 4 and the documents table has the indexes', async () => {
    const db = freshDb()
    await db.open()

    expect(db.verno).toBe(4)
    expect(db.tables.map((t) => t.name)).toContain('documents')
    expect(db.documents.schema.primKey.name).toBe('id')
    const indexes = db.documents.schema.indexes.map((i) => i.name)
    expect(indexes).toEqual(expect.arrayContaining(['personId', 'claimId', 'category', 'updatedAt']))
  })

  it('document-library.add.capture: a v2 database opens as v4 and keeps its persons', async () => {
    const name = freshName()

    const v2 = new Dexie(name)
    v2.version(1).stores({
      settings: 'key',
      outbox: 'id, createdAt',
    })
    v2.version(2).stores({
      settings: 'key',
      outbox: 'id, createdAt',
      account: 'id, updatedAt',
      persons: 'id, accountId, updatedAt',
      files: 'id, [ownerType+ownerId], sha256, updatedAt',
    })
    await v2.open()
    expect(v2.verno).toBe(2)
    await v2.table('persons').put(person('p-1'))
    v2.close()

    const upgraded = freshDb(name)
    await upgraded.open()

    expect(upgraded.verno).toBe(4)
    expect(await upgraded.persons.get('p-1')).toEqual(person('p-1'))
    expect(await upgraded.documents.count()).toBe(0)
  })
})
