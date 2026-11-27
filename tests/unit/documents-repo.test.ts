import { describe, it, expect, afterEach, beforeEach, afterAll, vi } from 'vitest'
import Dexie from 'dexie'
import { Blob as NodeBlob } from 'node:buffer'
import { AppDB } from '../../src/db/db'
import type { DocumentRecord } from '../../src/domain/document-types'
import type { Downscale } from '../../src/data/files-repo'
import {
  addFiles,
  addPages,
  mergeDocuments,
  updateDocument,
  confirmAmount,
  applyOcrResult,
  softDelete,
  listDocuments,
  markOcrFailed,
  requestOcr,
  listPendingOcr,
  type DocumentDeps,
  type PickedFile,
} from '../../src/data/documents-repo'
import { sha256 } from '../../src/lib/image'
// Lets pdf.js run its worker in-process under Node (same as pdf-read.test.ts).
import 'pdfjs-dist/legacy/build/pdf.worker.min.mjs'

// fake-indexeddb keeps Node's native Blob intact but drops jsdom Blob bytes (same as backup.test.ts).
vi.stubGlobal('Blob', NodeBlob)
afterAll(() => vi.unstubAllGlobals())

// Only the default-path test reaches the real downscaleImage; every other test injects a fake.
const { downscaleImage } = vi.hoisted(() => ({ downscaleImage: vi.fn() }))
vi.mock('../../src/lib/image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/image')>()),
  downscaleImage,
}))

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
  downscaleImage.mockReset()
})

const PERSON = 'person-1'

function picked(name: string, text: string, type = 'image/jpeg'): PickedFile {
  return Object.assign(new NodeBlob([text], { type }) as unknown as Blob, { name })
}

/** Fake downscale: output bytes equal the input bytes, so equal inputs have equal hashes. */
function echoDownscale(opts: { width?: number; height?: number; failOn?: string } = {}): Downscale {
  return async (file: Blob) => {
    const text = await file.text()
    if (opts.failOn !== undefined && text === opts.failOn) throw new Error('decode failed')
    return {
      blob: new Blob([text], { type: 'image/jpeg' }),
      width: opts.width ?? 2000,
      height: opts.height ?? 1500,
    }
  }
}

function deps(extra: DocumentDeps = {}): DocumentDeps {
  return { downscale: echoDownscale(), ...extra }
}

function unwrap<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result)}`)
  return result as Extract<T, { ok: true }>
}

async function outboxTypes(db: AppDB): Promise<string[]> {
  return (await db.outbox.toArray()).map((op) => op.type)
}

async function addOne(db: AppDB, name: string, text: string, category: DocumentRecord['category'] = 'other') {
  const result = await addFiles(db, [picked(name, text)], { personId: PERSON, category }, deps())
  expect(result.added).toHaveLength(1)
  return result.added[0]
}

describe('document-library.add.capture: addFiles', () => {
  let db: AppDB
  beforeEach(async () => {
    db = freshDb()
    await db.open()
  })

  it('document-library.add.capture: stores one document with one page and lists it first', async () => {
    const first = await addOne(db, 'older.jpg', 'older-photo')
    const second = await addOne(db, 'receipt.jpg', 'receipt-photo')

    expect(second.fileIds).toHaveLength(1)
    expect(second.personId).toBe(PERSON)
    expect(second.category).toBe('other')
    expect(second.deleted).toBe(0)
    expect(second.claimId).toBeNull()
    expect(await db.documents.count()).toBe(2)

    const listed = await listDocuments(db)
    expect(listed[0].id).toBe(second.id)
    expect(listed[1].id).toBe(first.id)

    const file = await db.files.get(second.fileIds[0])
    expect(file).toMatchObject({ ownerType: 'document', ownerId: second.id, mime: 'image/jpeg', deleted: 0 })
  })

  it('document-library.add.capture: default path downscales images to 2400 px at quality 0.85', async () => {
    downscaleImage.mockResolvedValue({ blob: new Blob(['scaled'], { type: 'image/jpeg' }), width: 2400, height: 1800 })
    const original = picked('receipt.jpg', 'original')

    const result = unwrap(await addFiles(db, [original], { personId: PERSON, category: 'other' }))

    expect(downscaleImage).toHaveBeenCalledTimes(1)
    expect(downscaleImage.mock.calls[0][0]).toBe(original)
    expect(downscaleImage.mock.calls[0][1]).toBe(2400)
    expect(downscaleImage.mock.calls[0][2]).toBe(0.85)
    expect(result.added).toHaveLength(1)
  })

  it('document-library.add.upload-many: three picked images become three documents', async () => {
    const result = unwrap(
      await addFiles(
        db,
        [picked('a.jpg', 'aaa'), picked('b.jpg', 'bbb'), picked('c.jpg', 'ccc')],
        { personId: PERSON, category: 'other' },
        deps(),
      ),
    )

    expect(result.added).toHaveLength(3)
    expect(await db.documents.count()).toBe(3)
    expect(await db.files.count()).toBe(3)
  })

  it('document-library.add.einvoice-pdf: a PDF is stored with its bytes unchanged as one document', async () => {
    const bytes = '%PDF-1.4 fake e-invoice'
    const pdf = picked('hoadon.pdf', bytes, 'application/pdf')
    const readPdf = vi.fn(async () => ({ pages: 1, encrypted: false, textLines: [] }))

    const result = unwrap(await addFiles(db, [pdf], { personId: PERSON, category: 'invoice' }, deps({ readPdf })))

    expect(readPdf).toHaveBeenCalledTimes(1)
    expect(downscaleImage).not.toHaveBeenCalled()
    expect(result.added).toHaveLength(1)
    const file = await db.files.get(result.added[0].fileIds[0])
    expect(file!.mime).toBe('application/pdf')
    expect(file!.bytes).toBe(pdf.size)
    expect(await file!.blob.text()).toBe(bytes)
    expect(await sha256(file!.blob)).toBe(await sha256(pdf))
  })

  it('document-library.add.protected-pdf: a password-protected PDF is not stored and the code says why', async () => {
    const pdf = picked('locked.pdf', '%PDF-1.7 locked', 'application/pdf')
    const readPdf = async () => ({ pages: 2, encrypted: true, textLines: [] })

    const result = unwrap(await addFiles(db, [pdf], { personId: PERSON, category: 'invoice' }, deps({ readPdf })))

    expect(result.added).toEqual([])
    expect(result.failed).toEqual([{ name: 'locked.pdf', code: 'pdf.protected' }])
    expect(await db.documents.count()).toBe(0)
    expect(await db.files.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('document-library.add.low-resolution: an image under 1200 px is stored and reported', async () => {
    const result = unwrap(
      await addFiles(
        db,
        [picked('small.jpg', 'small')],
        { personId: PERSON, category: 'other' },
        deps({ downscale: echoDownscale({ width: 1000, height: 800 }) }),
      ),
    )

    expect(result.added).toHaveLength(1)
    expect(result.lowResolution).toEqual(['small.jpg'])
  })

  it('document-library.add.low-resolution: an image of 1200 px or more is not reported', async () => {
    const result = unwrap(
      await addFiles(
        db,
        [picked('ok.jpg', 'ok')],
        { personId: PERSON, category: 'other' },
        deps({ downscale: echoDownscale({ width: 1200, height: 900 }) }),
      ),
    )

    expect(result.lowResolution).toEqual([])
  })

  it('document-library.add.unreadable: one undecodable file is named and the other two are stored', async () => {
    const result = unwrap(
      await addFiles(
        db,
        [picked('a.jpg', 'aaa'), picked('broken.jpg', 'BAD'), picked('c.jpg', 'ccc')],
        { personId: PERSON, category: 'other' },
        deps({ downscale: echoDownscale({ failOn: 'BAD' }) }),
      ),
    )

    expect(result.added).toHaveLength(2)
    expect(result.failed).toEqual([{ name: 'broken.jpg', code: 'file.unreadable' }])
    expect(await db.documents.count()).toBe(2)
  })

  it('document-library.add.duplicate: the same image again is not stored and is reported by name', async () => {
    const first = await addOne(db, 'receipt.jpg', 'same-bytes')

    const result = unwrap(
      await addFiles(db, [picked('again.jpg', 'same-bytes')], { personId: PERSON, category: 'other' }, deps()),
    )

    expect(result.added).toEqual([])
    expect(result.duplicates).toEqual(['again.jpg'])
    expect(await db.documents.count()).toBe(1)
    expect((await listDocuments(db))[0].id).toBe(first.id)
  })

  it('document-library.add.duplicate: an image whose document was deleted is stored again', async () => {
    const first = await addOne(db, 'receipt.jpg', 'same-bytes')
    unwrap(await softDelete(db, first.id))

    const result = unwrap(
      await addFiles(db, [picked('again.jpg', 'same-bytes')], { personId: PERSON, category: 'other' }, deps()),
    )

    expect(result.duplicates).toEqual([])
    expect(result.added).toHaveLength(1)
  })

  it('document-library.add.offline: a photo is stored and its outbox ops are queued with it', async () => {
    const doc = await addOne(db, 'receipt.jpg', 'offline-photo')

    const ops = await db.outbox.toArray()
    const docOp = ops.find((op) => op.type === 'document.upsert')
    const fileOp = ops.find((op) => op.type === 'file.upsert')
    expect(docOp).toMatchObject({ entity: 'document', entityId: doc.id })
    expect(docOp!.payload).toMatchObject({ id: doc.id, fileIds: doc.fileIds })
    expect(fileOp).toMatchObject({ entity: 'file', entityId: doc.fileIds[0] })
    expect(fileOp!.payload).not.toHaveProperty('blob')
  })

  it('document-library.add.resync: three offline adds leave one outbox op per write', async () => {
    await addFiles(
      db,
      [picked('a.jpg', 'a'), picked('b.jpg', 'b'), picked('c.jpg', 'c')],
      { personId: PERSON, category: 'other' },
      deps(),
    )

    const types = await outboxTypes(db)
    expect(types.filter((t) => t === 'document.upsert')).toHaveLength(3)
    expect(types.filter((t) => t === 'file.upsert')).toHaveLength(3)
    expect(types).toHaveLength(6)
  })

  it('document-library.add.capture: an invoice photo is queued for reading', async () => {
    const doc = await addOne(db, 'invoice.jpg', 'invoice-photo', 'invoice')
    expect(doc.ocrStatus).toBe('pending')
    expect(doc.amount).toBeNull()
    expect(doc.amountConfirmed).toBe(false)
  })
})

describe('document-library.add.capture: addPages', () => {
  it('document-library.add.capture: adds a page at the end of the document', async () => {
    const db = freshDb()
    await db.open()
    const doc = await addOne(db, 'page1.jpg', 'page-one')

    const result = unwrap(await addPages(db, doc.id, [picked('page2.jpg', 'page-two')], deps()))

    expect(result.document.fileIds).toHaveLength(2)
    expect(result.document.fileIds[0]).toBe(doc.fileIds[0])
    expect(result.duplicates).toEqual([])
    const stored = await db.documents.get(doc.id)
    expect(stored!.fileIds).toEqual(result.document.fileIds)
    const types = await outboxTypes(db)
    expect(types).toContain('document.upsert')
  })

  it('document-library.add.duplicate: a page already in the library is skipped', async () => {
    const db = freshDb()
    await db.open()
    const doc = await addOne(db, 'page1.jpg', 'page-one')
    await addOne(db, 'other.jpg', 'page-two')

    const result = unwrap(await addPages(db, doc.id, [picked('copy.jpg', 'page-two')], deps()))

    expect(result.duplicates).toEqual(['copy.jpg'])
    expect(result.document.fileIds).toHaveLength(1)
  })

  it('document-library.add.protected-pdf: a PDF cannot be added as a page', async () => {
    const db = freshDb()
    await db.open()
    const doc = await addOne(db, 'page1.jpg', 'page-one')

    const result = unwrap(
      await addPages(db, doc.id, [picked('hoadon.pdf', '%PDF', 'application/pdf')], deps()),
    )

    expect(result.failed).toEqual([{ name: 'hoadon.pdf', code: 'pdf.not-a-page' }])
    expect(result.document.fileIds).toHaveLength(1)
  })

  it('document-library.add.capture: an unknown document returns an error code', async () => {
    const db = freshDb()
    await db.open()

    const result = await addPages(db, 'missing', [picked('p.jpg', 'p')], deps())

    expect(result).toEqual({ ok: false, errors: { id: 'error.documentNotFound' } })
  })
})

describe('document-library.edit.invoice: updateDocument', () => {
  let db: AppDB
  let doc: DocumentRecord
  beforeEach(async () => {
    db = freshDb()
    await db.open()
    doc = await addOne(db, 'receipt.jpg', 'receipt-photo')
  })

  it('document-library.edit.invoice: category, date and amount are stored with manual amount confirmed', async () => {
    const result = unwrap(
      await updateDocument(db, doc.id, { category: 'invoice', docDate: '2026-11-20', amount: 750000 }),
    )

    expect(result.document).toMatchObject({
      category: 'invoice',
      docDate: '2026-11-20',
      amount: 750000,
      amountSource: 'manual',
      amountConfirmed: true,
    })
    const stored = await db.documents.get(doc.id)
    expect(stored).toMatchObject({ category: 'invoice', docDate: '2026-11-20', amount: 750000, amountSource: 'manual' })
    expect(await outboxTypes(db)).toContain('document.upsert')
  })

  it('document-library.edit.invoice: person can be set and cleared', async () => {
    unwrap(await updateDocument(db, doc.id, { personId: null }))
    expect((await db.documents.get(doc.id))!.personId).toBeNull()
  })

  it('document-library.edit.invalid-amount: zero, negative and fractional amounts are refused and nothing is saved', async () => {
    const before = await db.documents.get(doc.id)
    const outboxBefore = await db.outbox.count()

    for (const amount of [0, -5, 12.5]) {
      const result = await updateDocument(db, doc.id, { amount })
      expect(result).toEqual({ ok: false, errors: { amount: 'error.amountInvalid' } })
    }

    expect(await db.documents.get(doc.id)).toEqual(before)
    expect(await db.outbox.count()).toBe(outboxBefore)
  })

  it('document-library.edit.invalid-amount: an invalid date is refused', async () => {
    const result = await updateDocument(db, doc.id, { docDate: '2026-02-30' })
    expect(result).toEqual({ ok: false, errors: { docDate: 'error.dateInvalid' } })
    expect((await db.documents.get(doc.id))!.docDate).toBeNull()
  })

  it('document-library.edit.invoice: an unknown document returns an error code', async () => {
    const result = await updateDocument(db, 'missing', { amount: 1000 })
    expect(result).toEqual({ ok: false, errors: { id: 'error.documentNotFound' } })
  })
})

describe('document-ocr.review: confirm, candidates and manual amounts', () => {
  let db: AppDB
  beforeEach(async () => {
    db = freshDb()
    await db.open()
  })

  it('document-ocr.review.confirm: confirming a proposal stores it as an OCR amount, confirmed', async () => {
    const doc = await addOne(db, 'invoice.jpg', 'invoice-photo', 'invoice')
    unwrap(
      await applyOcrResult(db, doc.id, {
        text: 'Tổng tiền thanh toán: 2.718.900',
        date: null,
        candidates: [{ amount: 2718900, label: 'tong tien thanh toan', confidence: 'high' }],
      }),
    )

    const result = unwrap(await confirmAmount(db, doc.id))

    expect(result.document).toMatchObject({ amount: 2718900, amountSource: 'ocr', amountConfirmed: true })
    const stored = await db.documents.get(doc.id)
    expect(stored).toMatchObject({ amount: 2718900, amountSource: 'ocr', amountConfirmed: true, ocrStatus: 'done' })
  })

  it('document-ocr.review.other-candidate: picking the second candidate makes it the confirmed amount', async () => {
    const doc = await addOne(db, 'invoice.jpg', 'invoice-photo', 'invoice')
    unwrap(
      await applyOcrResult(db, doc.id, {
        text: 'Tong cong 1.000.000 Thanh tien 900.000',
        date: null,
        candidates: [
          { amount: 1000000, label: 'tong cong', confidence: 'high' },
          { amount: 900000, label: 'thanh tien', confidence: 'low' },
        ],
      }),
    )

    const result = unwrap(await confirmAmount(db, doc.id, 900000))

    expect(result.document).toMatchObject({ amount: 900000, amountSource: 'ocr', amountConfirmed: true })
  })

  it('document-ocr.review.other-candidate: a picked amount that is not a candidate is refused', async () => {
    const doc = await addOne(db, 'invoice.jpg', 'invoice-photo', 'invoice')
    unwrap(
      await applyOcrResult(db, doc.id, {
        text: '',
        date: null,
        candidates: [{ amount: 1000000, label: 'tong cong', confidence: 'high' }],
      }),
    )

    const result = await confirmAmount(db, doc.id, 123000)

    expect(result).toEqual({ ok: false, errors: { amount: 'error.amountNotCandidate' } })
  })

  it('document-ocr.review.keep-manual: a typed amount is not overwritten by reading, the proposal is only listed', async () => {
    const doc = await addOne(db, 'invoice.jpg', 'invoice-photo', 'invoice')
    unwrap(await updateDocument(db, doc.id, { amount: 700000 }))

    unwrap(
      await applyOcrResult(db, doc.id, {
        text: 'Tổng cộng 750.000',
        date: null,
        candidates: [{ amount: 750000, label: 'tong cong', confidence: 'high' }],
      }),
    )

    const stored = await db.documents.get(doc.id)
    expect(stored).toMatchObject({ amount: 700000, amountSource: 'manual', amountConfirmed: true, ocrStatus: 'done' })
    expect(stored!.ocrCandidates).toEqual([{ amount: 750000, label: 'tong cong', confidence: 'high' }])
  })

  it('document-ocr.review.confirm: a new reading replaces an unconfirmed proposal', async () => {
    const doc = await addOne(db, 'invoice.jpg', 'invoice-photo', 'invoice')
    unwrap(
      await applyOcrResult(db, doc.id, {
        text: 'a',
        date: null,
        candidates: [{ amount: 100000, label: 'tong cong', confidence: 'high' }],
      }),
    )
    unwrap(
      await applyOcrResult(db, doc.id, {
        text: 'b',
        date: '2026-10-04',
        candidates: [{ amount: 200000, label: 'tong cong', confidence: 'high' }],
      }),
    )

    const stored = await db.documents.get(doc.id)
    expect(stored).toMatchObject({ amount: 200000, amountSource: 'ocr', amountConfirmed: false, docDate: '2026-10-04' })
  })

  it('document-ocr.review.confirm: confirming with no amount is refused', async () => {
    const doc = await addOne(db, 'invoice.jpg', 'invoice-photo', 'invoice')
    expect(await confirmAmount(db, doc.id)).toEqual({ ok: false, errors: { amount: 'error.amountMissing' } })
  })
})

describe('document-library.edit.merge: mergeDocuments', () => {
  let db: AppDB
  beforeEach(async () => {
    db = freshDb()
    await db.open()
  })

  it('document-library.edit.merge: two documents become one with both pages in selection order', async () => {
    const a = await addOne(db, 'a1.jpg', 'a-page-1', 'prescription')
    unwrap(await addPages(db, a.id, [picked('a2.jpg', 'a-page-2')], deps()))
    const b = await addOne(db, 'b1.jpg', 'b-page-1', 'invoice')
    const aPages = (await db.documents.get(a.id))!.fileIds

    const result = unwrap(await mergeDocuments(db, [b.id, a.id]))

    expect(result.document.id).toBe(b.id)
    expect(result.document.category).toBe('invoice')
    expect(result.document.fileIds).toEqual([b.fileIds[0], ...aPages])
    expect((await db.documents.get(a.id))!.deleted).toBe(1)
    expect((await db.documents.get(b.id))!.fileIds).toHaveLength(3)

    const moved = await db.files.get(aPages[0])
    expect(moved!.ownerId).toBe(b.id)
    const types = await outboxTypes(db)
    expect(types).toContain('document.delete')
  })

  it('document-library.edit.merge: a document in a claim cannot be merged', async () => {
    const a = await addOne(db, 'a.jpg', 'a')
    const b = await addOne(db, 'b.jpg', 'b')
    await db.documents.update(a.id, { claimId: 'claim-1' })

    const result = await mergeDocuments(db, [a.id, b.id])

    expect(result).toEqual({ ok: false, errors: { ids: 'error.documentInClaim' } })
    expect((await db.documents.get(b.id))!.deleted).toBe(0)
  })

  it('document-library.edit.merge: fewer than two documents cannot be merged', async () => {
    const a = await addOne(db, 'a.jpg', 'a')
    expect(await mergeDocuments(db, [a.id])).toEqual({ ok: false, errors: { ids: 'error.mergeNeedsTwo' } })
  })
})

describe('document-library.edit.filter: listDocuments', () => {
  it('document-library.edit.filter: "not in a claim" lists only documents with no claim', async () => {
    const db = freshDb()
    await db.open()
    const free = await addOne(db, 'free.jpg', 'free')
    const claimed = await addOne(db, 'claimed.jpg', 'claimed')
    await db.documents.update(claimed.id, { claimId: 'claim-1' })

    const listed = await listDocuments(db, { notInClaim: true })

    expect(listed.map((d) => d.id)).toEqual([free.id])
  })

  it('document-library.edit.filter: category and person filters narrow the list', async () => {
    const db = freshDb()
    await db.open()
    const invoice = await addOne(db, 'i.jpg', 'i', 'invoice')
    await addOne(db, 'p.jpg', 'p', 'prescription')
    await addFiles(db, [picked('other.jpg', 'o')], { personId: 'person-2', category: 'invoice' }, deps())

    expect((await listDocuments(db, { category: 'invoice' })).length).toBe(2)
    const byPerson = await listDocuments(db, { personId: PERSON, category: 'invoice' })
    expect(byPerson.map((d) => d.id)).toEqual([invoice.id])
  })

  it('document-library.edit.filter: deleted documents are never listed', async () => {
    const db = freshDb()
    await db.open()
    const doc = await addOne(db, 'x.jpg', 'x')
    await softDelete(db, doc.id)
    expect(await listDocuments(db)).toEqual([])
  })
})

describe('document-library.delete.free: softDelete', () => {
  it('document-library.delete.free: a free document and its files are soft-deleted with outbox ops', async () => {
    const db = freshDb()
    await db.open()
    const doc = await addOne(db, 'p1.jpg', 'p1')
    unwrap(await addPages(db, doc.id, [picked('p2.jpg', 'p2')], deps()))
    const fileIds = (await db.documents.get(doc.id))!.fileIds

    unwrap(await softDelete(db, doc.id))

    expect((await db.documents.get(doc.id))!.deleted).toBe(1)
    for (const id of fileIds) expect((await db.files.get(id))!.deleted).toBe(1)
    const types = await outboxTypes(db)
    expect(types.filter((t) => t === 'document.delete')).toHaveLength(1)
    expect(types.filter((t) => t === 'file.delete')).toHaveLength(2)
  })

  it('document-library.delete.in-claim: a document in a claim is not deleted and names the refusal', async () => {
    const db = freshDb()
    await db.open()
    const doc = await addOne(db, 'c.jpg', 'c')
    await db.documents.update(doc.id, { claimId: 'claim-1' })
    const outboxBefore = await db.outbox.count()

    const result = await softDelete(db, doc.id)

    expect(result).toEqual({ ok: false, errors: { claimId: 'error.documentInClaim' } })
    expect((await db.documents.get(doc.id))!.deleted).toBe(0)
    expect(await db.outbox.count()).toBe(outboxBefore)
  })
})

// Smallest PDFs pdf.js opens: a valid one with no text, and one whose Encrypt dictionary needs a password.
const VALID_PDF = '%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >> endobj\ntrailer << /Root 1 0 R /Size 4 >>\n%%EOF\n'
const ENCRYPTED_PDF = `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >> endobj\n4 0 obj << /Filter /Standard /V 1 /R 2 /O <${'11'.repeat(32)}> /U <${'22'.repeat(32)}> /P -4 >> endobj\ntrailer << /Root 1 0 R /Encrypt 4 0 R /ID [<00112233445566778899aabbccddeeff> <00112233445566778899aabbccddeeff>] >>\n%%EOF\n`

describe('document-ocr.pdf.text: e-invoice text read at add time', () => {
  let db: AppDB
  beforeEach(async () => {
    db = freshDb()
    await db.open()
  })

  const textPdf = (lines: string[]) => async () => ({ pages: 1, encrypted: false, textLines: lines })

  it('document-ocr.pdf.text: an invoice PDF with a text layer is stored already read, without any model', async () => {
    const readPdf = textPdf(['Tong tien thanh toan 2.718.900', 'Ngay 04 thang 10 nam 2026'])
    const downscale = vi.fn()
    const result = unwrap(
      await addFiles(
        db,
        [picked('hoadon.pdf', '%PDF-1.4 text', 'application/pdf')],
        { personId: PERSON, category: 'invoice' },
        { downscale, readPdf, today: () => '2026-11-27' },
      ),
    )

    const doc = result.added[0]
    expect(doc.ocrStatus).toBe('done')
    expect(doc.amount).toBe(2718900)
    expect(doc.amountSource).toBe('ocr')
    expect(doc.amountConfirmed).toBe(false)
    expect(doc.docDate).toBe('2026-10-04')
    expect(doc.ocrCandidates[0]).toMatchObject({ amount: 2718900, confidence: 'high' })
    expect(doc.ocrText).toBe('Tong tien thanh toan 2.718.900\nNgay 04 thang 10 nam 2026')
    expect(downscale).not.toHaveBeenCalled()
    expect(await db.documents.get(doc.id)).toMatchObject({ ocrStatus: 'done', amount: 2718900 })
  })

  it('document-ocr.pdf.text: a non-invoice PDF with a text layer is stored untouched', async () => {
    const result = unwrap(
      await addFiles(
        db,
        [picked('hoadon.pdf', '%PDF-1.4 text', 'application/pdf')],
        { personId: PERSON, category: 'other' },
        { readPdf: textPdf(['Tong tien thanh toan 2.718.900']) },
      ),
    )
    expect(result.added[0]).toMatchObject({ ocrStatus: 'none', amount: null, ocrCandidates: [], docDate: null })
  })

  it('document-ocr.pdf.scanned: an invoice PDF without text is queued for reading', async () => {
    const result = unwrap(
      await addFiles(
        db,
        [picked('scan.pdf', '%PDF-1.4 scan', 'application/pdf')],
        { personId: PERSON, category: 'invoice' },
        { readPdf: textPdf([]) },
      ),
    )
    expect(result.added[0]).toMatchObject({ ocrStatus: 'pending', amount: null })
  })

  it('document-ocr.pdf.text: fewer than 20 text characters do not count as a text layer', async () => {
    const result = unwrap(
      await addFiles(
        db,
        [picked('short.pdf', '%PDF-1.4 short', 'application/pdf')],
        { personId: PERSON, category: 'invoice' },
        { readPdf: textPdf(['Tong 1.000']) },
      ),
    )
    expect(result.added[0].ocrStatus).toBe('pending')
  })

  it('document-ocr.pdf.text: moving a document to invoice later queues it, so the queue reads its text', async () => {
    const other = await addOne(db, 'hoadon.pdf', 'pdf-bytes', 'other')
    const result = unwrap(await updateDocument(db, other.id, { category: 'invoice' }))
    expect(result.document.ocrStatus).toBe('pending')
    expect(await outboxTypes(db)).toContain('document.upsert')
  })
})

describe('document-library.add.einvoice-pdf: default PDF reader', () => {
  let db: AppDB
  beforeEach(async () => {
    db = freshDb()
    await db.open()
  })

  it('document-library.add.einvoice-pdf: with no reader injected a valid PDF is stored with its bytes unchanged', async () => {
    const pdf = picked('hoadon.pdf', VALID_PDF, 'application/pdf')
    const result = unwrap(await addFiles(db, [pdf], { personId: PERSON, category: 'other' }, deps()))

    expect(result.added).toHaveLength(1)
    const file = await db.files.get(result.added[0].fileIds[0])
    expect(file!.mime).toBe('application/pdf')
    expect(await sha256(file!.blob)).toBe(await sha256(pdf))
  })

  it('document-library.add.protected-pdf: with no reader injected an encrypted PDF is refused with pdf.protected', async () => {
    const result = unwrap(
      await addFiles(db, [picked('locked.pdf', ENCRYPTED_PDF, 'application/pdf')], { personId: PERSON, category: 'invoice' }, deps()),
    )
    expect(result.added).toEqual([])
    expect(result.failed).toEqual([{ name: 'locked.pdf', code: 'pdf.protected' }])
    expect(await db.documents.count()).toBe(0)
  })

  it('document-library.add.einvoice-pdf: a file that is not a PDF is reported as file.unreadable and the rest are stored', async () => {
    const result = unwrap(
      await addFiles(
        db,
        [picked('broken.pdf', 'not a pdf', 'application/pdf'), picked('photo.jpg', 'photo')],
        { personId: PERSON, category: 'other' },
        deps(),
      ),
    )
    expect(result.failed).toEqual([{ name: 'broken.pdf', code: 'file.unreadable' }])
    expect(result.added).toHaveLength(1)
  })
})

describe('document-library.add.low-resolution: stored flag', () => {
  let db: AppDB
  beforeEach(async () => {
    db = freshDb()
    await db.open()
  })

  it('document-library.add.low-resolution: an added small image is stored with lowResolution true', async () => {
    const result = unwrap(
      await addFiles(
        db,
        [picked('small.jpg', 'small'), picked('ok.jpg', 'ok')],
        { personId: PERSON, category: 'other' },
        { downscale: echoDownscale({ width: 1000, height: 800 }) },
      ),
    )
    expect(result.added[0].lowResolution).toBe(true)
    expect((await db.documents.get(result.added[0].id))!.lowResolution).toBe(true)
  })

  it('document-library.add.low-resolution: a normal image and a PDF are stored with lowResolution false', async () => {
    const result = unwrap(
      await addFiles(
        db,
        [picked('ok.jpg', 'ok'), picked('hoadon.pdf', VALID_PDF, 'application/pdf')],
        { personId: PERSON, category: 'other' },
        deps({ downscale: echoDownscale({ width: 2000, height: 1500 }) }),
      ),
    )
    expect(result.added.map((d) => d.lowResolution)).toEqual([false, false])
  })

  it('document-library.add.low-resolution: a small page added later marks the whole document', async () => {
    const doc = await addOne(db, 'first.jpg', 'first')
    expect(doc.lowResolution).toBe(false)
    const result = unwrap(
      await addPages(db, doc.id, [picked('small.jpg', 'small')], deps({ downscale: echoDownscale({ width: 800, height: 600 }) })),
    )
    expect(result.lowResolution).toEqual(['small.jpg'])
    expect(result.document.lowResolution).toBe(true)
  })

  it('document-library.edit.merge: a merged document is low resolution when any merged part is', async () => {
    const a = await addOne(db, 'a.jpg', 'a')
    const low = unwrap(await addFiles(db, [picked('b.jpg', 'b')], { personId: PERSON, category: 'other' }, deps({ downscale: echoDownscale({ width: 500, height: 400 }) })))
    const merged = unwrap(await mergeDocuments(db, [a.id, low.added[0].id]))
    expect(merged.document.lowResolution).toBe(true)
  })
})

describe('document-ocr.queue.failure: status helpers for the reading queue', () => {
  let db: AppDB
  beforeEach(async () => {
    db = freshDb()
    await db.open()
  })

  it('document-ocr.queue.failure: a failed reading marks the document failed and queues the write', async () => {
    const doc = await addOne(db, 'receipt.jpg', 'receipt', 'invoice')
    const before = await db.outbox.count()
    const result = unwrap(await markOcrFailed(db, doc.id))
    expect(result.document.ocrStatus).toBe('failed')
    expect((await db.documents.get(doc.id))!.ocrStatus).toBe('failed')
    expect(await db.outbox.count()).toBe(before + 1)
  })

  it('document-ocr.queue.failure: the re-read action sets a failed invoice back to pending', async () => {
    const doc = await addOne(db, 'receipt.jpg', 'receipt', 'invoice')
    await markOcrFailed(db, doc.id)
    const result = unwrap(await requestOcr(db, doc.id))
    expect(result.document.ocrStatus).toBe('pending')
  })

  it('document-ocr.queue.failure: re-reading a non-invoice document is refused', async () => {
    const doc = await addOne(db, 'photo.jpg', 'photo', 'other')
    expect(await requestOcr(db, doc.id)).toEqual({ ok: false, errors: { category: 'error.notInvoice' } })
  })

  it('document-ocr.queue.resync: pending invoices are listed oldest first and other documents are not', async () => {
    const first = await addOne(db, 'one.jpg', 'one', 'invoice')
    await addOne(db, 'two.jpg', 'two', 'other')
    const third = await addOne(db, 'three.jpg', 'three', 'invoice')
    await db.documents.update(third.id, { createdAt: first.createdAt + 10 })
    await db.documents.update(first.id, { createdAt: first.createdAt })
    expect((await listPendingOcr(db)).map((d) => d.id)).toEqual([first.id, third.id])
  })
})
