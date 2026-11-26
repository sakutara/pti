import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import Dexie from 'dexie'
import { AppDB } from '../../src/db/db'
import type { Person } from '../../src/domain/types'
import { sha256 } from '../../src/lib/image'
import { saveImage, getBlob, softDeleteFile, type Downscale } from '../../src/data/files-repo'

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

const PERSON_ID = 'person-1'

function seedPerson(): Person {
  return {
    id: PERSON_ID,
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

/**
 * Fake downscale: returns a small JPEG-typed blob with fixed dimensions.
 * fake-indexeddb does not round-trip jsdom Blobs (they come back as plain objects), so tests
 * compare against `outputs` (the blob the fake produced) rather than the stored copy.
 */
function fakeDownscale(tag: string): Downscale & { calls: Blob[]; outputs: Blob[] } {
  const calls: Blob[] = []
  const outputs: Blob[] = []
  const fn = async (file: Blob) => {
    calls.push(file)
    const blob = new Blob([tag], { type: 'image/jpeg' })
    outputs.push(blob)
    return { blob, width: 2000, height: 1500 }
  }
  return Object.assign(fn, { calls, outputs })
}

const bigJpeg = () => new Blob(['original 4000x3000'], { type: 'image/jpeg' })

describe('account.card.capture / account.card.replace: files-repo', () => {
  let db: AppDB
  beforeEach(async () => {
    db = freshDb()
    await db.open()
    await db.persons.put(seedPerson())
  })

  it('account.card.capture: stores a card-front file whose longest edge is capped by downscale', async () => {
    const downscale = fakeDownscale('front-1')
    const original = bigJpeg()

    const stored = await saveImage(db, { type: 'person', id: PERSON_ID }, 'card-front', original, { downscale })

    expect(downscale.calls).toHaveLength(1)
    expect(downscale.calls[0]).toBe(original)

    const record = await db.files.get(stored.id)
    expect(record).toBeDefined()
    expect(record!.kind).toBe('card-front')
    expect(record!.ownerType).toBe('person')
    expect(record!.ownerId).toBe(PERSON_ID)
    expect(record!.mime).toBe('image/jpeg')
    expect(record!.bytes).toBe(downscale.outputs[0].size)
    expect(record!.deleted).toBe(0)
    expect(record!.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('account.card.capture: links the holder cardFrontFileId to the new file', async () => {
    const stored = await saveImage(db, { type: 'person', id: PERSON_ID }, 'card-front', bigJpeg(), {
      downscale: fakeDownscale('front-1'),
    })

    const person = await db.persons.get(PERSON_ID)
    expect(person!.cardFrontFileId).toBe(stored.id)
    expect(person!.updatedAt).toBeGreaterThan(1)
  })

  it('account.card.capture: enqueues file.upsert without a blob key and person.upsert', async () => {
    const stored = await saveImage(db, { type: 'person', id: PERSON_ID }, 'card-front', bigJpeg(), {
      downscale: fakeDownscale('front-1'),
    })

    const ops = await db.outbox.toArray()
    const fileOp = ops.find((o) => o.type === 'file.upsert')
    const personOp = ops.find((o) => o.type === 'person.upsert')
    expect(fileOp).toBeDefined()
    expect(fileOp!.entity).toBe('file')
    expect(fileOp!.entityId).toBe(stored.id)
    expect(fileOp!.payload).not.toHaveProperty('blob')
    expect(fileOp!.payload).toMatchObject({ id: stored.id, kind: 'card-front', ownerId: PERSON_ID })

    expect(personOp).toBeDefined()
    expect(personOp!.entity).toBe('person')
    expect(personOp!.entityId).toBe(PERSON_ID)
    expect(personOp!.payload).toMatchObject({ id: PERSON_ID, cardFrontFileId: stored.id })
  })

  it('account.card.replace: soft-deletes the old file and links the new one', async () => {
    const first = await saveImage(db, { type: 'person', id: PERSON_ID }, 'card-front', bigJpeg(), {
      downscale: fakeDownscale('front-1'),
    })
    const second = await saveImage(db, { type: 'person', id: PERSON_ID }, 'card-front', bigJpeg(), {
      downscale: fakeDownscale('front-2'),
    })

    const oldRecord = await db.files.get(first.id)
    expect(oldRecord!.deleted).toBe(1)
    expect(oldRecord!.updatedAt).toBeGreaterThan(0)

    const newRecord = await db.files.get(second.id)
    expect(newRecord!.deleted).toBe(0)

    const person = await db.persons.get(PERSON_ID)
    expect(person!.cardFrontFileId).toBe(second.id)
  })

  it('account.card.replace: enqueues file.delete for the old file and person.upsert', async () => {
    const first = await saveImage(db, { type: 'person', id: PERSON_ID }, 'card-front', bigJpeg(), {
      downscale: fakeDownscale('front-1'),
    })
    await db.outbox.clear()

    const second = await saveImage(db, { type: 'person', id: PERSON_ID }, 'card-front', bigJpeg(), {
      downscale: fakeDownscale('front-2'),
    })

    const ops = await db.outbox.orderBy('createdAt').toArray()
    const types = ops.map((o) => o.type)
    expect(types).toEqual(expect.arrayContaining(['file.upsert', 'file.delete', 'person.upsert']))

    const deleteOp = ops.find((o) => o.type === 'file.delete')
    expect(deleteOp!.entity).toBe('file')
    expect(deleteOp!.entityId).toBe(first.id)
    expect(deleteOp!.payload).toEqual({ id: first.id })

    const upsertOp = ops.find((o) => o.type === 'file.upsert')
    expect(upsertOp!.entityId).toBe(second.id)
    expect(upsertOp!.payload).not.toHaveProperty('blob')

    const personOp = ops.find((o) => o.type === 'person.upsert')
    expect(personOp!.payload).toMatchObject({ cardFrontFileId: second.id })
  })

  it('account.card.capture: card-back links cardBackFileId and leaves cardFrontFileId alone', async () => {
    const back = await saveImage(db, { type: 'person', id: PERSON_ID }, 'card-back', bigJpeg(), {
      downscale: fakeDownscale('back-1'),
    })

    const person = await db.persons.get(PERSON_ID)
    expect(person!.cardBackFileId).toBe(back.id)
    expect(person!.cardFrontFileId).toBeNull()
  })

  it('account.card.capture: getBlob returns the stored blob for a live file', async () => {
    // Blob identity/size cannot be asserted here: fake-indexeddb does not round-trip jsdom Blobs.
    const stored = await saveImage(db, { type: 'person', id: PERSON_ID }, 'card-front', bigJpeg(), {
      downscale: fakeDownscale('front-1'),
    })
    expect(await getBlob(db, stored.id)).toBeDefined()
  })

  it('account.card.replace: getBlob returns undefined for a soft-deleted file', async () => {
    const first = await saveImage(db, { type: 'person', id: PERSON_ID }, 'card-front', bigJpeg(), {
      downscale: fakeDownscale('front-1'),
    })
    await saveImage(db, { type: 'person', id: PERSON_ID }, 'card-front', bigJpeg(), {
      downscale: fakeDownscale('front-2'),
    })
    expect(await getBlob(db, first.id)).toBeUndefined()
    expect(await getBlob(db, 'missing-id')).toBeUndefined()
  })

  it('account.card.replace: softDeleteFile marks the file deleted and enqueues file.delete', async () => {
    const stored = await saveImage(db, { type: 'person', id: PERSON_ID }, 'document', bigJpeg(), {
      downscale: fakeDownscale('doc-1'),
    })
    await db.outbox.clear()

    await softDeleteFile(db, stored.id)

    const record = await db.files.get(stored.id)
    expect(record!.deleted).toBe(1)
    const ops = await db.outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0].type).toBe('file.delete')
    expect(ops[0].payload).toEqual({ id: stored.id })
    expect(await getBlob(db, stored.id)).toBeUndefined()
  })
})

describe('account.card.capture: sha256', () => {
  it('account.card.capture: sha256 of "abc" is the known digest', async () => {
    const digest = await sha256(new Blob(['abc']))
    expect(digest).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
