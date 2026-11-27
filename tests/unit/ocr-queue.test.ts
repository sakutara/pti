import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import Dexie from 'dexie'
import { Blob as NodeBlob } from 'node:buffer'
import { AppDB } from '../../src/db/db'
import type { OcrEngine } from '../../src/lib/ocr-engine'
import type { PdfReading } from '../../src/lib/pdf-read'
import {
  addFiles,
  addPages,
  requestOcr,
  updateDocument,
  type DocumentDeps,
  type PickedFile,
} from '../../src/data/documents-repo'
import { startOcrQueue, type OcrQueueDeps } from '../../src/data/ocr-queue'

// fake-indexeddb keeps Node's native Blob intact but drops jsdom Blob bytes (same as documents-repo.test.ts).
vi.stubGlobal('Blob', NodeBlob)
afterAll(() => vi.unstubAllGlobals())

const opened: AppDB[] = []
const names: string[] = []
function freshDb(): AppDB {
  const name = 'q-' + crypto.randomUUID()
  names.push(name)
  const db = new AppDB(name)
  opened.push(db)
  return db
}

afterEach(async () => {
  for (const db of opened.splice(0)) db.close()
  for (const name of names.splice(0)) await Dexie.delete(name)
})

const PERSON = 'person-1'
const TODAY = '2026-11-27'
const NO_TEXT: PdfReading = { pages: 1, encrypted: false, textLines: [] }

function picked(name: string, text: string, type = 'image/jpeg'): PickedFile {
  return Object.assign(new NodeBlob([text], { type }) as unknown as Blob, { name })
}

/** Stored images keep their bytes, so the text of a page is its key in `lines`. */
const echo: DocumentDeps['downscale'] = async (file) => ({
  blob: new Blob([await file.text()], { type: 'image/jpeg' }),
  width: 2000,
  height: 1500,
})

/** Fake engine: returns the lines of a page by its text; records calls and the peak number of reads in flight. */
function fakeEngine(lines: Record<string, string[]>, failOn: string[] = []) {
  let active = 0
  let peak = 0
  const calls: string[] = []
  const engine: OcrEngine & { terminate: ReturnType<typeof vi.fn> } = {
    recognize: vi.fn(async (blob: Blob) => {
      active++
      peak = Math.max(peak, active)
      try {
        await Promise.resolve()
        const key = await blob.text()
        calls.push(key)
        if (failOn.includes(key)) throw new Error('ocr failed')
        return lines[key] ?? []
      } finally {
        active--
      }
    }),
    terminate: vi.fn(),
  }
  return { engine, calls, peak: () => peak }
}

function queueDeps(db: AppDB, extra: Partial<OcrQueueDeps> = {}): OcrQueueDeps {
  return {
    db,
    modelReady: async () => true,
    readPdf: async () => NO_TEXT,
    renderPage: async (_file, page, longEdge) => new Blob([`pdf-page-${page}-${longEdge}`], { type: 'image/jpeg' }),
    scan: async () => null,
    prepare: async (blob) => blob,
    today: () => TODAY,
    ...extra,
  }
}

async function addInvoice(db: AppDB, name: string, text: string) {
  const result = await addFiles(db, [picked(name, text)], { personId: PERSON, category: 'invoice' }, { downscale: echo })
  if (!result.ok) throw new Error('add failed')
  return result.added[0]
}

describe('document-ocr.queue.offline: nothing is read without the model', () => {
  let db: AppDB
  beforeEach(() => {
    db = freshDb()
  })

  it('document-ocr.queue.offline: with the model not ready the pending invoice stays pending and no engine is created', async () => {
    const doc = await addInvoice(db, 'receipt.jpg', 'receipt-a')
    const { engine } = fakeEngine({})
    const createEngine = vi.fn(() => engine)

    await startOcrQueue(queueDeps(db, { modelReady: async () => false, createEngine }))

    expect((await db.documents.get(doc.id))!.ocrStatus).toBe('pending')
    expect(createEngine).not.toHaveBeenCalled()
  })

  it('document-ocr.pdf.text: with the model not ready a PDF invoice with a text layer is still read from its text', async () => {
    const pdf = await addFiles(db, [picked('hoadon.pdf', 'pdf-bytes', 'application/pdf')], { personId: PERSON, category: 'other' }, {
      readPdf: async () => NO_TEXT,
    })
    if (!pdf.ok) throw new Error('add failed')
    const id = pdf.added[0].id
    await updateDocument(db, id, { category: 'invoice' })
    const { engine } = fakeEngine({})
    const createEngine = vi.fn(() => engine)

    await startOcrQueue(
      queueDeps(db, {
        modelReady: async () => false,
        createEngine,
        readPdf: async () => ({ pages: 1, encrypted: false, textLines: ['Tong tien thanh toan 2.718.900'] }),
      }),
    )

    const doc = (await db.documents.get(id))!
    expect(doc).toMatchObject({ ocrStatus: 'done', amount: 2718900, amountConfirmed: false })
    expect(createEngine).not.toHaveBeenCalled()
  })
})

describe('document-ocr.queue.resync: pending invoices are read one after another', () => {
  let db: AppDB
  beforeEach(() => {
    db = freshDb()
  })

  it('document-ocr.queue.resync: three pending invoices are read one at a time and become done', async () => {
    const a = await addInvoice(db, 'a.jpg', 'page-a')
    const b = await addInvoice(db, 'b.jpg', 'page-b')
    const c = await addInvoice(db, 'c.jpg', 'page-c')
    const { engine, calls, peak } = fakeEngine({
      'page-a': ['Tổng tiền thanh toán 100.000'],
      'page-b': ['Tổng tiền thanh toán 200.000'],
      'page-c': ['Tổng tiền thanh toán 300.000'],
    })

    await startOcrQueue(queueDeps(db, { createEngine: () => engine }))

    expect(calls).toEqual(['page-a', 'page-b', 'page-c'])
    expect(peak()).toBe(1)
    for (const [doc, amount] of [
      [a, 100000],
      [b, 200000],
      [c, 300000],
    ] as const) {
      expect(await db.documents.get(doc.id)).toMatchObject({ ocrStatus: 'done', amount })
    }
  })

  it('document-ocr.queue.resync: invoices stored in the same millisecond are read in the order they were added', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    try {
      await addInvoice(db, 'a.jpg', 'page-a')
      await addInvoice(db, 'b.jpg', 'page-b')
      await addInvoice(db, 'c.jpg', 'page-c')
    } finally {
      clock.mockRestore()
    }
    const { engine, calls } = fakeEngine({
      'page-a': ['Tổng tiền thanh toán 100.000'],
      'page-b': ['Tổng tiền thanh toán 200.000'],
      'page-c': ['Tổng tiền thanh toán 300.000'],
    })

    await startOcrQueue(queueDeps(db, { createEngine: () => engine }))

    expect(calls).toEqual(['page-a', 'page-b', 'page-c'])
  })

  it('document-ocr.queue.resync: two starts at the same time read each invoice once', async () => {
    const a = await addInvoice(db, 'a.jpg', 'page-a')
    const { engine, calls } = fakeEngine({ 'page-a': ['Tổng tiền thanh toán 100.000'] })
    const deps = queueDeps(db, { createEngine: () => engine })

    await Promise.all([startOcrQueue(deps), startOcrQueue(deps)])

    expect(calls).toEqual(['page-a'])
    expect((await db.documents.get(a.id))!.ocrStatus).toBe('done')
  })

  it('document-ocr.queue.resync: a multi-page invoice is read page by page and its lines are joined in page order', async () => {
    const doc = await addInvoice(db, 'p1.jpg', 'page-1')
    await addPages(db, doc.id, [picked('p2.jpg', 'page-2')], { downscale: echo })
    const { engine, calls } = fakeEngine({
      'page-1': ['Thuoc A 10.000', 'Ghi chu'],
      'page-2': ['Tổng tiền thanh toán 450.000'],
    })

    await startOcrQueue(queueDeps(db, { createEngine: () => engine }))

    expect(calls).toEqual(['page-1', 'page-2'])
    const done = (await db.documents.get(doc.id))!
    expect(done.ocrText).toBe('Thuoc A 10.000\nGhi chu\nTổng tiền thanh toán 450.000')
    expect(done).toMatchObject({ ocrStatus: 'done', amount: 450000, amountSource: 'ocr' })
  })

  it('document-ocr.queue.resync: an image is cropped by scanReceiptImage and prepared before it is read', async () => {
    await addInvoice(db, 'a.jpg', 'raw')
    const { engine, calls } = fakeEngine({ 'prepared:cropped': ['Tổng tiền thanh toán 100.000'] })
    const scan = vi.fn(async (file: File) => new File([`cropped`], file.name.replace(/\.jpg$/, '-scan.jpg'), { type: 'image/jpeg' }))
    const prepare = vi.fn(async (blob: Blob) => new Blob([`prepared:${await blob.text()}`], { type: 'image/jpeg' }))

    await startOcrQueue(queueDeps(db, { createEngine: () => engine, scan, prepare }))

    expect(scan).toHaveBeenCalledTimes(1)
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(['prepared:cropped'])
  })

  it('document-ocr.queue.resync: when cropping gives nothing the stored image is read as it is', async () => {
    await addInvoice(db, 'a.jpg', 'raw')
    const { engine, calls } = fakeEngine({ raw: ['Tổng tiền thanh toán 100.000'] })

    await startOcrQueue(queueDeps(db, { createEngine: () => engine, scan: async () => null }))

    expect(calls).toEqual(['raw'])
  })

  it('document-ocr.queue.resync: the engine is terminated once the queue is idle', async () => {
    await addInvoice(db, 'a.jpg', 'page-a')
    const { engine } = fakeEngine({ 'page-a': ['Tổng tiền thanh toán 100.000'] })

    await startOcrQueue(queueDeps(db, { createEngine: () => engine }))

    expect(engine.terminate).toHaveBeenCalledTimes(1)
  })

  it('document-ocr.queue.resync: an empty queue never creates an engine', async () => {
    const createEngine = vi.fn()
    await startOcrQueue(queueDeps(db, { createEngine }))
    expect(createEngine).not.toHaveBeenCalled()
  })
})

describe('document-ocr.queue.failure: a failed reading does not stop the queue', () => {
  let db: AppDB
  beforeEach(() => {
    db = freshDb()
  })

  it('document-ocr.queue.failure: a failing reading becomes failed and the next document is still read', async () => {
    const a = await addInvoice(db, 'a.jpg', 'page-a')
    const b = await addInvoice(db, 'b.jpg', 'page-b')
    const c = await addInvoice(db, 'c.jpg', 'page-c')
    const { engine, calls } = fakeEngine(
      { 'page-a': ['x'], 'page-c': ['Tổng tiền thanh toán 300.000'] },
      ['page-b'],
    )

    await startOcrQueue(queueDeps(db, { createEngine: () => engine }))

    expect(calls).toEqual(['page-a', 'page-b', 'page-c'])
    expect((await db.documents.get(a.id))!.ocrStatus).toBe('done')
    expect(await db.documents.get(b.id)).toMatchObject({ ocrStatus: 'failed', amount: null })
    expect((await db.documents.get(c.id))!.ocrStatus).toBe('done')
  })

  it('document-ocr.queue.failure: the re-read action sets a failed invoice to pending and the next run reads it', async () => {
    const b = await addInvoice(db, 'b.jpg', 'page-b')
    const failing = fakeEngine({}, ['page-b'])
    await startOcrQueue(queueDeps(db, { createEngine: () => failing.engine }))
    expect((await db.documents.get(b.id))!.ocrStatus).toBe('failed')

    await requestOcr(db, b.id)
    const ok = fakeEngine({ 'page-b': ['Tổng tiền thanh toán 90.000'] })
    await startOcrQueue(queueDeps(db, { createEngine: () => ok.engine }))

    expect(await db.documents.get(b.id)).toMatchObject({ ocrStatus: 'done', amount: 90000 })
  })

  it('document-ocr.queue.failure: a PDF that cannot be read is marked failed', async () => {
    const result = await addFiles(db, [picked('broken.pdf', 'pdf', 'application/pdf')], { personId: PERSON, category: 'invoice' }, {
      readPdf: async () => NO_TEXT,
    })
    if (!result.ok) throw new Error('add failed')
    const { engine } = fakeEngine({})

    await startOcrQueue(
      queueDeps(db, {
        createEngine: () => engine,
        readPdf: async () => {
          throw new Error('broken')
        },
      }),
    )

    expect((await db.documents.get(result.added[0].id))!.ocrStatus).toBe('failed')
  })
})

describe('document-ocr.pdf.scanned: a PDF without text is read page by page at long edge 2400', () => {
  it('document-ocr.pdf.scanned: each page is rendered at long edge 2400 px and the rendered pages are read in order', async () => {
    const db = freshDb()
    const added = await addFiles(db, [picked('scan.pdf', 'scan', 'application/pdf')], { personId: PERSON, category: 'invoice' }, {
      readPdf: async () => ({ pages: 2, encrypted: false, textLines: [] }),
    })
    if (!added.ok) throw new Error('add failed')
    const { engine, calls } = fakeEngine({
      'pdf-page-1-2400': ['Thuoc 1.000'],
      'pdf-page-2-2400': ['Tổng tiền thanh toán 120.000'],
    })
    const renderPage = vi.fn(async (_file: Blob, page: number, longEdge: number) => new Blob([`pdf-page-${page}-${longEdge}`], { type: 'image/jpeg' }))

    await startOcrQueue(
      queueDeps(db, {
        createEngine: () => engine,
        readPdf: async () => ({ pages: 2, encrypted: false, textLines: [] }),
        renderPage,
      }),
    )

    expect(renderPage.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      [1, 2400],
      [2, 2400],
    ])
    expect(calls).toEqual(['pdf-page-1-2400', 'pdf-page-2-2400'])
    expect(await db.documents.get(added.added[0].id)).toMatchObject({ ocrStatus: 'done', amount: 120000 })
  })
})

describe('document-ocr.review.keep-manual: the queue never overwrites a typed amount', () => {
  it('document-ocr.review.keep-manual: a reading that finishes after a typed amount only lists the proposal', async () => {
    const db = freshDb()
    const doc = await addInvoice(db, 'a.jpg', 'page-a')
    await updateDocument(db, doc.id, { amount: 700000 })
    const { engine } = fakeEngine({ 'page-a': ['Tổng tiền thanh toán 750.000'] })

    await startOcrQueue(queueDeps(db, { createEngine: () => engine }))

    const after = (await db.documents.get(doc.id))!
    expect(after).toMatchObject({ ocrStatus: 'done', amount: 700000, amountSource: 'manual', amountConfirmed: true })
    expect(after.ocrCandidates[0]).toMatchObject({ amount: 750000 })
  })
})
