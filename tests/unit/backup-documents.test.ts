import { describe, it, expect, afterEach, afterAll, vi } from 'vitest'
import Dexie from 'dexie'
import { Blob as NodeBlob } from 'node:buffer'
import { strFromU8, unzipSync } from 'fflate'
import { AppDB } from '../../src/db/db'
import type { DocumentRecord } from '../../src/domain/document-types'
import type { StoredFile } from '../../src/domain/types'
import { exportBackup, importBackup } from '../../src/data/backup'

// Same Blob swap as backup.test.ts: fake-indexeddb keeps Node Blobs intact, jsdom Blobs lose bytes.
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

function document(id: string, fileIds: string[], updatedAt = 100): DocumentRecord {
  return {
    id,
    personId: null,
    claimId: null,
    category: 'invoice',
    fileIds,
    docDate: '2026-11-20',
    amount: 750000,
    amountSource: 'manual',
    amountConfirmed: true,
    ocrStatus: 'none',
    ocrText: null,
    ocrCandidates: [],
    createdAt: 1,
    updatedAt,
    deleted: 0,
  }
}

function documentFile(docId: string, bytes: Uint8Array<ArrayBuffer>): StoredFile {
  return {
    id: crypto.randomUUID(),
    ownerType: 'document',
    ownerId: docId,
    kind: 'document',
    mime: 'image/jpeg',
    blob: new Blob([bytes], { type: 'image/jpeg' }),
    bytes: bytes.byteLength,
    sha256: 'cafebabe',
    createdAt: 1,
    updatedAt: 1,
    deleted: 0,
  }
}

async function readZip(blob: Blob): Promise<Record<string, Uint8Array>> {
  return unzipSync(new Uint8Array(await blob.arrayBuffer()))
}

describe('backup.export.content: documents', () => {
  it('backup.export.content: zip has the documents table and the bytes of their files', async () => {
    const db = freshDb()
    const file = documentFile('doc-1', new Uint8Array([1, 2, 3, 250]))
    await db.files.add(file)
    await db.documents.add(document('doc-1', [file.id]))

    const zip = await readZip((await exportBackup(db)).blob)

    const rows = JSON.parse(strFromU8(zip['tables/documents.json'])) as DocumentRecord[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'doc-1', fileIds: [file.id], amount: 750000 })
    expect(zip[`files/${file.id}`]).toEqual(new Uint8Array([1, 2, 3, 250]))
  })

  it('backup.export.content: ocrModelVersion is never exported and other settings still are', async () => {
    const db = freshDb()
    await db.settings.bulkPut([
      { key: 'ocrModelVersion', value: '2026-11', updatedAt: 1 },
      { key: 'persisted', value: true, updatedAt: 1 },
    ])

    const zip = await readZip((await exportBackup(db)).blob)

    const settings = JSON.parse(strFromU8(zip['tables/settings.json'])) as { key: string }[]
    expect(settings.map((s) => s.key)).toEqual(['persisted'])
  })
})

describe('backup.import.merge: documents', () => {
  it('backup.import.merge: documents and their files are restored and queue outbox ops', async () => {
    const source = freshDb()
    const target = freshDb()
    const file = documentFile('doc-1', new Uint8Array([9, 8, 7]))
    await source.files.add(file)
    await source.documents.add(document('doc-1', [file.id]))
    const backup = (await exportBackup(source)).blob

    const result = await importBackup(target, backup)

    expect(result.imported).toBe(2)
    expect(await target.documents.get('doc-1')).toMatchObject({ fileIds: [file.id], amount: 750000 })
    const restored = await target.files.get(file.id)
    expect(new Uint8Array(await restored!.blob.arrayBuffer())).toEqual(new Uint8Array([9, 8, 7]))
    const types = (await target.outbox.toArray()).map((op) => op.type)
    expect(types).toContain('document.upsert')
    expect(types).toContain('file.upsert')
  })

  it('backup.import.resync: a deleted document queues a document.delete op', async () => {
    const source = freshDb()
    const target = freshDb()
    await source.documents.add({ ...document('doc-2', []), deleted: 1, updatedAt: 200 })
    const backup = (await exportBackup(source)).blob
    await target.documents.add(document('doc-2', [], 100))

    await importBackup(target, backup)

    const ops = await target.outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ type: 'document.delete', entity: 'document', entityId: 'doc-2' })
  })

  it('backup.import.merge: an ocrModelVersion setting in a backup is not written to the device', async () => {
    const source = freshDb()
    const target = freshDb()
    await source.settings.put({ key: 'ocrModelVersion', value: '2026-11', updatedAt: 1 })
    const backup = (await exportBackup(source)).blob

    await importBackup(target, backup)

    expect(await target.settings.get('ocrModelVersion')).toBeUndefined()
  })
})
