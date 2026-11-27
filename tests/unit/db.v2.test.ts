import { describe, it, expect, afterEach } from 'vitest'
import Dexie from 'dexie'
import { AppDB } from '../../src/db/db'

const opened: AppDB[] = []
const names: string[] = []

function freshName() {
  const name = 't-' + crypto.randomUUID()
  names.push(name)
  return name
}

function freshDb() {
  const db = new AppDB(freshName())
  opened.push(db)
  return db
}

afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close()
  }
  for (const name of names.splice(0)) {
    await Dexie.delete(name)
  }
})

describe('account.onboarding.create: Dexie v2 schema', () => {
  it('account.onboarding.create: db.verno is the latest after open', async () => {
    const db = freshDb()
    await db.open()
    expect(db.verno).toBe(4)
  })

  it('account.onboarding.create: tables account, persons, files exist with the indexes', async () => {
    const db = freshDb()
    await db.open()

    expect(db.tables.map((t) => t.name)).toEqual(expect.arrayContaining(['account', 'persons', 'files']))

    expect(db.account.schema.primKey.name).toBe('id')
    expect(db.account.schema.indexes.map((i) => i.name)).toContain('updatedAt')

    expect(db.persons.schema.primKey.name).toBe('id')
    const personIndexes = db.persons.schema.indexes.map((i) => i.name)
    expect(personIndexes).toContain('accountId')
    expect(personIndexes).toContain('updatedAt')

    expect(db.files.schema.primKey.name).toBe('id')
    const fileIndexes = db.files.schema.indexes.map((i) => i.name)
    expect(fileIndexes).toContain('[ownerType+ownerId]')
    expect(fileIndexes).toContain('sha256')
    expect(fileIndexes).toContain('updatedAt')
  })

  it('account.onboarding.create: upgrading a v1 database keeps existing settings', async () => {
    const name = freshName()

    const v1 = new Dexie(name)
    v1.version(1).stores({
      settings: 'key',
      outbox: 'id, createdAt',
    })
    await v1.open()
    await v1.table('settings').put({ key: 'k', value: 1, updatedAt: 1 })
    expect(v1.verno).toBe(1)
    v1.close()

    const upgraded = new AppDB(name)
    opened.push(upgraded)
    await upgraded.open()

    expect(upgraded.verno).toBe(4)
    const setting = await upgraded.settings.get('k')
    expect(setting).toEqual({ key: 'k', value: 1, updatedAt: 1 })
  })
})
