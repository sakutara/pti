import { describe, it, expect, afterEach, afterAll, vi } from 'vitest'
import Dexie from 'dexie'
import { Blob as NodeBlob } from 'node:buffer'
import { strToU8, strFromU8, unzipSync, zipSync } from 'fflate'
import { AppDB } from '../../src/db/db'
import type { Account, Person, StoredFile } from '../../src/domain/types'
import {
  BackupError,
  exportBackup,
  importBackup,
  markBackupDone,
  getLastBackupAt,
} from '../../src/data/backup'

// fake-indexeddb's structured clone stores jsdom Blobs as empty objects (bytes are lost), but it
// stores Node's native Blob intact. Swap the global for this file only so file bytes survive the
// IndexedDB round trip. Production browsers store real Blobs natively, so the app code is unchanged.
vi.stubGlobal('Blob', NodeBlob)
afterAll(() => vi.unstubAllGlobals())

const opened: AppDB[] = []
const names: string[] = []

function freshDb() {
  const name = 't-' + crypto.randomUUID()
  names.push(name)
  const db = new AppDB(name)
  opened.push(db)
  return db
}

afterEach(async () => {
  for (const db of opened.splice(0)) db.close()
  for (const name of names.splice(0)) await Dexie.delete(name)
})

function account(updatedAt = 1): Account {
  return {
    id: crypto.randomUUID(),
    displayName: 'Home',
    administrator: 'marsh',
    claimEmail: null,
    claimCc: [],
    defaultBank: null,
    onboardedAt: null,
    updatedAt,
    deleted: 0,
  }
}

function person(accountId: string, updatedAt: number, id = crypto.randomUUID()): Person {
  return {
    id,
    accountId,
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
    updatedAt,
    deleted: 0,
  }
}

function cardFile(ownerId: string, bytes: Uint8Array): StoredFile {
  return {
    id: crypto.randomUUID(),
    ownerType: 'person',
    ownerId,
    kind: 'card-front',
    mime: 'image/jpeg',
    blob: new Blob([bytes], { type: 'image/jpeg' }),
    bytes: bytes.byteLength,
    sha256: 'deadbeef',
    createdAt: 1,
    updatedAt: 1,
    deleted: 0,
  }
}

async function readZip(blob: Blob): Promise<Record<string, Uint8Array>> {
  return unzipSync(new Uint8Array(await blob.arrayBuffer()))
}

function json(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value))
}

/** Build a zip the way a foreign or older/newer app would, for reject and merge cases. */
function buildZip(entries: Record<string, Uint8Array>): Blob {
  return new Blob([zipSync(entries)], { type: 'application/zip' })
}

function manifest(overrides: Record<string, unknown> = {}) {
  return json({ app: 'pti', schemaVersion: 2, exportedAt: '2026-01-01T00:00:00.000Z', counts: {}, ...overrides })
}

describe('backup.export.content', () => {
  it('backup.export.content: zip has manifest, tables and file bytes', async () => {
    const db = freshDb()
    const acc = account()
    const p1 = person(acc.id, 1)
    const p2 = person(acc.id, 1)
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 250])
    const file = cardFile(p1.id, bytes)
    await db.account.add(acc)
    await db.persons.bulkAdd([p1, p2])
    await db.files.add(file)

    const { blob, fileName } = await exportBackup(db, new Date(2026, 10, 26, 9, 5))
    const zip = await readZip(blob)

    expect(blob.type).toBe('application/zip')
    expect(fileName).toBe('pti-backup-20261126-0905.ptibackup')
    const manifestDoc = JSON.parse(strFromU8(zip['manifest.json']))
    expect(manifestDoc.app).toBe('pti')
    expect(manifestDoc.schemaVersion).toBe(db.verno)
    expect(JSON.parse(strFromU8(zip['tables/account.json']))).toHaveLength(1)
    expect(JSON.parse(strFromU8(zip['tables/persons.json']))).toHaveLength(2)
    expect(zip[`files/${file.id}`]).toEqual(bytes)
  })

  it('backup.export.content: exported files table omits the blob field', async () => {
    const db = freshDb()
    const acc = account()
    const p1 = person(acc.id, 1)
    const file = cardFile(p1.id, new Uint8Array([1, 2]))
    await db.account.add(acc)
    await db.persons.add(p1)
    await db.files.add(file)

    const zip = await readZip((await exportBackup(db)).blob)
    const rows = JSON.parse(strFromU8(zip['tables/files.json'])) as Record<string, unknown>[]

    expect(rows).toHaveLength(1)
    expect(rows[0]).not.toHaveProperty('blob')
    expect(rows[0].id).toBe(file.id)
  })
})

describe('backup.import.merge', () => {
  it('backup.import.merge: newer backup copy replaces device person and counts it', async () => {
    const source = freshDb()
    const target = freshDb()
    const acc = account()
    const id = crypto.randomUUID()
    await source.account.add(acc)
    await source.persons.add({ ...person(acc.id, 200, id), fullName: 'From backup' })
    const backup = (await exportBackup(source)).blob

    await target.account.add(acc)
    await target.persons.add({ ...person(acc.id, 100, id), fullName: 'On device' })

    const result = await importBackup(target, backup)

    const p = await target.persons.get(id)
    expect(p?.updatedAt).toBe(200)
    expect(p?.fullName).toBe('From backup')
    expect(result.imported).toBe(1)
  })

  it('backup.import.merge: file bytes survive a round trip into a fresh device', async () => {
    const source = freshDb()
    const target = freshDb()
    const acc = account()
    const p1 = person(acc.id, 1)
    const bytes = new Uint8Array([9, 8, 7, 0, 255])
    const file = cardFile(p1.id, bytes)
    await source.account.add(acc)
    await source.persons.add(p1)
    await source.files.add(file)

    await importBackup(target, (await exportBackup(source)).blob)

    const restored = await target.files.get(file.id)
    expect(restored).toBeDefined()
    expect(restored!.mime).toBe('image/jpeg')
    expect(restored!.blob).toBeInstanceOf(Blob)
    const restoredBytes = new Uint8Array(await restored!.blob.arrayBuffer())
    expect(restoredBytes).toEqual(bytes)
  })
})

describe('backup.import.keep-newer', () => {
  it('backup.import.keep-newer: device person with newer updatedAt is kept', async () => {
    const source = freshDb()
    const target = freshDb()
    const acc = account()
    const id = crypto.randomUUID()
    await source.account.add(acc)
    await source.persons.add({ ...person(acc.id, 200, id), fullName: 'Old backup' })
    const backup = (await exportBackup(source)).blob

    await target.account.add(acc)
    await target.persons.add({ ...person(acc.id, 300, id), fullName: 'Device newer' })

    const result = await importBackup(target, backup)

    const p = await target.persons.get(id)
    expect(p?.updatedAt).toBe(300)
    expect(p?.fullName).toBe('Device newer')
    expect(result.imported).toBe(0)
  })
})

describe('backup.import.reject-newer-schema', () => {
  it('backup.import.reject-newer-schema: rejects and changes nothing', async () => {
    const db = freshDb()
    const acc = account()
    const p = person(acc.id, 100)
    await db.account.add(acc)
    await db.persons.add(p)
    const backup = buildZip({
      'manifest.json': manifest({ schemaVersion: db.verno + 1 }),
      'tables/persons.json': json([{ ...p, updatedAt: 500, fullName: 'Changed' }]),
    })

    const err = await importBackup(db, backup).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(BackupError)
    expect((err as BackupError).code).toBe('newer-schema')
    expect((err as BackupError).message).toMatch(/newer version of the app/i)
    expect(await db.persons.count()).toBe(1)
    expect((await db.persons.get(p.id))?.updatedAt).toBe(100)
  })
})

describe('backup.import.reject-foreign', () => {
  it('backup.import.reject-foreign: zip without a pti manifest is rejected and changes nothing', async () => {
    const db = freshDb()
    const acc = account()
    const p = person(acc.id, 100)
    await db.account.add(acc)
    await db.persons.add(p)
    const backup = buildZip({ 'tables/persons.json': json([{ ...p, updatedAt: 500 }]) })

    const err = await importBackup(db, backup).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(BackupError)
    expect((err as BackupError).code).toBe('foreign')
    expect((err as BackupError).message.length).toBeGreaterThan(0)
    expect((await db.persons.get(p.id))?.updatedAt).toBe(100)
  })

  it('backup.import.reject-foreign: manifest of another app is rejected', async () => {
    const db = freshDb()
    const backup = buildZip({ 'manifest.json': manifest({ app: 'other' }) })

    const err = await importBackup(db, backup).catch((e: unknown) => e)

    expect((err as BackupError).code).toBe('foreign')
    expect(await db.persons.count()).toBe(0)
  })

  it('backup.import.reject-foreign: non-zip bytes are reported as corrupt and change nothing', async () => {
    const db = freshDb()
    const backup = new Blob([strToU8('not a zip at all')])

    const err = await importBackup(db, backup).catch((e: unknown) => e)

    expect((err as BackupError).code).toBe('corrupt')
    expect(await db.persons.count()).toBe(0)
  })
})

describe('backup.import.resync', () => {
  it('backup.import.resync: one outbox op per changed record', async () => {
    const source = freshDb()
    const target = freshDb()
    const acc = account()
    const people = [1, 2, 3, 4, 5].map(() => person(acc.id, 200))
    await source.account.add(acc)
    await source.persons.bulkAdd(people)
    const backup = (await exportBackup(source)).blob

    await target.account.add(acc)
    await target.persons.bulkAdd(people.map((p) => ({ ...p, updatedAt: 100 })))

    const result = await importBackup(target, backup)

    expect(result.imported).toBe(5)
    const ops = await target.outbox.toArray()
    expect(ops).toHaveLength(5)
    expect(ops.every((op) => op.type === 'person.upsert' && op.entity === 'person')).toBe(true)
    expect(ops.map((op) => op.entityId).sort()).toEqual(people.map((p) => p.id).sort())
  })

  it('backup.import.resync: deleted record queues a delete op', async () => {
    const source = freshDb()
    const target = freshDb()
    const acc = account()
    const p = { ...person(acc.id, 200), deleted: 1 as const }
    await source.account.add(acc)
    await source.persons.add(p)
    const backup = (await exportBackup(source)).blob

    await target.account.add(acc)
    await target.persons.add({ ...p, updatedAt: 100, deleted: 0 })

    await importBackup(target, backup)

    const ops = await target.outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0].type).toBe('person.delete')
    expect(ops[0].entityId).toBe(p.id)
  })
})

describe('backup.import.merge: last backup marker', () => {
  it('backup.import.merge: markBackupDone records and getLastBackupAt reads it back', async () => {
    const db = freshDb()
    expect(await getLastBackupAt(db)).toBeNull()

    await markBackupDone(db, 12345)

    expect(await getLastBackupAt(db)).toBe(12345)
    expect(await db.outbox.count()).toBe(0)
  })
})
