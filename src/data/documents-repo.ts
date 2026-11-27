import type { AppDB } from '../db/db'
import { newId, now } from '../db/db'
import { enqueue } from '../sync/outbox'
import type { StoredFile } from '../domain/types'
import type { DocCategory, DocumentRecord, OcrCandidate } from '../domain/document-types'
import { downscaleImage, sha256 } from '../lib/image'
import { hasTextLayer, readPdf, type PdfReading } from '../lib/pdf-read'
import { todayIso } from '../lib/dates'
import { extractTotal } from '../domain/receipt-amount'
import { extractDate } from '../domain/receipt-date'
import type { Downscale } from './files-repo'
import { recomputeClaimTotal } from './claim-totals'

/** Stored page images: longest edge at most 2400 px, JPEG quality 0.85 (colour kept). */
export const PAGE_MAX_EDGE = 2400
export const PAGE_QUALITY = 0.85
/** Images whose longest edge is below this are stored but reported as possibly unreadable. */
export const LOW_RESOLUTION_EDGE = 1200

/** What the PDF reader reports: page count, protection and the text lines of the text layer. */
export type PdfProbe = PdfReading

export type ReadPdf = (file: Blob) => Promise<PdfProbe>

export interface DocumentDeps {
  downscale?: Downscale
  readPdf?: ReadPdf
  /** Local calendar date (YYYY-MM-DD) used to drop future dates from a text layer. */
  today?: () => string
}

/** A picked file; `File` objects carry `name`, plain Blobs fall back to a position label. */
export type PickedFile = Blob & { name?: string }

export type FileErrorCode = 'file.unreadable' | 'pdf.protected' | 'pdf.not-a-page'
export interface FileFailure { name: string; code: FileErrorCode }

export interface AddFilesResult {
  ok: true
  added: DocumentRecord[]
  /** Names of picked files whose bytes already belong to a live document. */
  duplicates: string[]
  failed: FileFailure[]
  /** Names of added images whose longest edge is under LOW_RESOLUTION_EDGE. */
  lowResolution: string[]
}

export type AddPagesResult =
  | {
      ok: true
      document: DocumentRecord
      duplicates: string[]
      failed: FileFailure[]
      lowResolution: string[]
    }
  | { ok: false; errors: Record<string, string> }

export type DocResult = { ok: true; document: DocumentRecord } | { ok: false; errors: Record<string, string> }

export interface DocumentPatch {
  category?: DocCategory
  personId?: string | null
  docDate?: string | null
  /** null clears the amount; a number is a manual, confirmed amount. */
  amount?: number | null
}

export interface OcrResult {
  text: string
  /** Best first; candidates[0] is the proposed amount. */
  candidates: OcrCandidate[]
  /** Proposed YYYY-MM-DD, applied only when the document has no date. */
  date: string | null
}

export interface DocumentFilter {
  category?: DocCategory
  personId?: string
  notInClaim?: boolean
}

const defaultDownscale: Downscale = (file) => downscaleImage(file, PAGE_MAX_EDGE, PAGE_QUALITY)

/** File metadata for outbox payloads: never carries the Blob. */
function toMeta(file: StoredFile): Omit<StoredFile, 'blob'> {
  const { blob: _blob, ...meta } = file
  return meta
}

type Prepared =
  | { ok: true; blob: Blob; mime: string; lowResolution: boolean; textLines: string[] }
  | { ok: false; code: FileErrorCode }

/** Decide how a picked file is stored. Images are downscaled; PDFs are kept byte for byte. */
async function prepare(file: PickedFile, deps: DocumentDeps): Promise<Prepared> {
  if (file.type === 'application/pdf') {
    let probe: PdfProbe
    try {
      probe = await (deps.readPdf ?? readPdf)(file)
    } catch {
      return { ok: false, code: 'file.unreadable' }
    }
    if (probe.encrypted) return { ok: false, code: 'pdf.protected' }
    return { ok: true, blob: file, mime: 'application/pdf', lowResolution: false, textLines: probe.textLines }
  }

  try {
    const out = await (deps.downscale ?? defaultDownscale)(file)
    return {
      ok: true,
      blob: out.blob,
      mime: out.blob.type || 'image/jpeg',
      lowResolution: Math.max(out.width, out.height) < LOW_RESOLUTION_EDGE,
      textLines: [],
    }
  } catch {
    return { ok: false, code: 'file.unreadable' }
  }
}

/** True when a live document already holds a live file with this hash. Call inside a 'rw' transaction. */
async function hasLiveCopy(db: AppDB, hash: string): Promise<boolean> {
  const rows = await db.files.where('sha256').equals(hash).toArray()
  for (const row of rows) {
    if (row.deleted !== 0 || row.ownerType !== 'document') continue
    const doc = await db.documents.get(row.ownerId)
    if (doc && doc.deleted === 0) return true
  }
  return false
}

/**
 * Reads recognised lines into a reading: the candidates from the total rules and the date. Used for the text layer of
 * a PDF (no model) and for OCR output alike.
 */
export function readLines(lines: string[], today: string): OcrResult {
  return { text: lines.join('\n'), candidates: extractTotal(lines).candidates, date: extractDate(lines, today) }
}

function buildFile(docId: string, blob: Blob, mime: string, hash: string, t: number): StoredFile {
  return {
    id: newId(),
    ownerType: 'document',
    ownerId: docId,
    kind: 'document',
    mime,
    blob,
    bytes: blob.size,
    sha256: hash,
    createdAt: t,
    updatedAt: t,
    deleted: 0,
  }
}

const nameOf = (file: PickedFile, index: number) => file.name ?? `#${index + 1}`

/**
 * Store each picked image or PDF as its own document (one page). Files whose hash already
 * belongs to a live document are skipped; unreadable or protected files are reported and the
 * rest are still stored. Each document is written with its file and outbox ops in one transaction.
 */
export async function addFiles(
  db: AppDB,
  files: ReadonlyArray<PickedFile>,
  input: { personId: string | null; category: DocCategory },
  deps: DocumentDeps = {},
): Promise<AddFilesResult> {
  const result: AddFilesResult = { ok: true, added: [], duplicates: [], failed: [], lowResolution: [] }

  for (const [index, file] of files.entries()) {
    const name = nameOf(file, index)
    const prepared = await prepare(file, deps)
    if (!prepared.ok) {
      result.failed.push({ name, code: prepared.code })
      continue
    }
    const hash = await sha256(prepared.blob)
    // A PDF with a text layer is read at once (no model) when it is an invoice; anything else waits in the queue.
    const reading =
      input.category === 'invoice' && hasTextLayer(prepared.textLines) ? readLines(prepared.textLines, (deps.today ?? todayIso)()) : null
    const best = reading?.candidates[0] ?? null

    const doc = await db.transaction('rw', db.files, db.documents, db.outbox, async () => {
      if (await hasLiveCopy(db, hash)) return null
      const t = now()
      const docId = newId()
      const fileRecord = buildFile(docId, prepared.blob, prepared.mime, hash, t)
      await db.files.add(fileRecord)
      await enqueue(db, { type: 'file.upsert', entity: 'file', entityId: fileRecord.id, payload: toMeta(fileRecord) })

      const record: DocumentRecord = {
        id: docId,
        personId: input.personId,
        claimId: null,
        category: input.category,
        fileIds: [fileRecord.id],
        docDate: reading?.date ?? null,
        amount: best ? best.amount : null,
        amountSource: best ? 'ocr' : null,
        amountConfirmed: false,
        ocrStatus: reading ? 'done' : input.category === 'invoice' ? 'pending' : 'none',
        ocrText: reading ? reading.text : null,
        ocrCandidates: reading ? reading.candidates : [],
        lowResolution: prepared.lowResolution,
        createdAt: t,
        updatedAt: t,
        deleted: 0,
      }
      await db.documents.add(record)
      await enqueue(db, { type: 'document.upsert', entity: 'document', entityId: docId, payload: record })
      return record
    })

    if (!doc) {
      result.duplicates.push(name)
      continue
    }
    result.added.push(doc)
    if (prepared.lowResolution) result.lowResolution.push(name)
  }
  return result
}

/** Append picked images as pages of an existing document. PDFs cannot be pages. */
export async function addPages(
  db: AppDB,
  docId: string,
  files: ReadonlyArray<PickedFile>,
  deps: DocumentDeps = {},
): Promise<AddPagesResult> {
  const first = await db.documents.get(docId)
  if (!first || first.deleted === 1) return { ok: false, errors: { id: 'error.documentNotFound' } }

  const result = { duplicates: [] as string[], failed: [] as FileFailure[], lowResolution: [] as string[] }

  for (const [index, file] of files.entries()) {
    const name = nameOf(file, index)
    if (file.type === 'application/pdf') {
      result.failed.push({ name, code: 'pdf.not-a-page' })
      continue
    }
    const prepared = await prepare(file, deps)
    if (!prepared.ok) {
      result.failed.push({ name, code: prepared.code })
      continue
    }
    const hash = await sha256(prepared.blob)

    const stored = await db.transaction('rw', db.files, db.documents, db.outbox, async () => {
      const doc = await db.documents.get(docId)
      if (!doc || doc.deleted === 1) return false
      if (await hasLiveCopy(db, hash)) return null
      const t = now()
      const fileRecord = buildFile(docId, prepared.blob, prepared.mime, hash, t)
      await db.files.add(fileRecord)
      await enqueue(db, { type: 'file.upsert', entity: 'file', entityId: fileRecord.id, payload: toMeta(fileRecord) })

      const next: DocumentRecord = {
        ...doc,
        fileIds: [...doc.fileIds, fileRecord.id],
        lowResolution: doc.lowResolution || prepared.lowResolution,
        updatedAt: t,
      }
      await db.documents.put(next)
      await enqueue(db, { type: 'document.upsert', entity: 'document', entityId: docId, payload: next })
      return true
    })

    if (stored === null) {
      result.duplicates.push(name)
    } else if (stored === false) {
      return { ok: false, errors: { id: 'error.documentNotFound' } }
    } else if (prepared.lowResolution) {
      result.lowResolution.push(name)
    }
  }

  const document = await db.documents.get(docId)
  if (!document) return { ok: false, errors: { id: 'error.documentNotFound' } }
  return { ok: true, document, ...result }
}

const notFound = { id: 'error.documentNotFound' }

/** Loads a live document inside the transaction, or undefined. */
async function liveDoc(db: AppDB, id: string): Promise<DocumentRecord | undefined> {
  const doc = await db.documents.get(id)
  return doc && doc.deleted === 0 ? doc : undefined
}

/** Applies the user's edits. Amounts entered here are manual and confirmed at once. */
export async function updateDocument(db: AppDB, id: string, patch: DocumentPatch): Promise<DocResult> {
  const errors: Record<string, string> = {}
  if (patch.amount !== undefined && patch.amount !== null) {
    if (!Number.isInteger(patch.amount) || patch.amount < 1) errors.amount = 'error.amountInvalid'
  }
  if (patch.docDate !== undefined && patch.docDate !== null && !isIsoDate(patch.docDate)) {
    errors.docDate = 'error.dateInvalid'
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return db.transaction('rw', db.documents, db.outbox, db.claims, async () => {
    const doc = await liveDoc(db, id)
    if (!doc) return { ok: false, errors: notFound }

    const t = now()
    const next: DocumentRecord = { ...doc, updatedAt: t }
    if (patch.category !== undefined) {
      next.category = patch.category
      // An invoice that was never read joins the reading queue; a PDF's text is read from the queue without a model.
      if (patch.category === 'invoice' && doc.ocrStatus === 'none') next.ocrStatus = 'pending'
    }
    if (patch.personId !== undefined) next.personId = patch.personId
    if (patch.docDate !== undefined) next.docDate = patch.docDate
    if (patch.amount === null) {
      next.amount = null
      next.amountSource = null
      next.amountConfirmed = false
    } else if (patch.amount !== undefined) {
      next.amount = patch.amount
      next.amountSource = 'manual'
      next.amountConfirmed = true
    }

    await db.documents.put(next)
    await enqueue(db, { type: 'document.upsert', entity: 'document', entityId: id, payload: next })
    if (next.claimId !== null) await recomputeClaimTotal(db, next.claimId)
    return { ok: true, document: next }
  })
}

/**
 * Confirms the proposed amount, or picks one of the OCR candidates when `amount` is given.
 * A picked candidate is stored with amountSource "ocr".
 */
export async function confirmAmount(db: AppDB, id: string, amount?: number): Promise<DocResult> {
  return db.transaction('rw', db.documents, db.outbox, db.claims, async () => {
    const doc = await liveDoc(db, id)
    if (!doc) return { ok: false, errors: notFound }

    const t = now()
    const next: DocumentRecord = { ...doc, updatedAt: t }
    if (amount !== undefined) {
      if (!doc.ocrCandidates.some((c) => c.amount === amount)) {
        return { ok: false, errors: { amount: 'error.amountNotCandidate' } }
      }
      next.amount = amount
      next.amountSource = 'ocr'
    } else if (doc.amount === null) {
      return { ok: false, errors: { amount: 'error.amountMissing' } }
    }
    next.amountConfirmed = true

    await db.documents.put(next)
    await enqueue(db, { type: 'document.upsert', entity: 'document', entityId: id, payload: next })
    if (next.claimId !== null) await recomputeClaimTotal(db, next.claimId)
    return { ok: true, document: next }
  })
}

/**
 * Stores a reading. The proposal replaces the amount only while the amount is neither typed by
 * the user nor confirmed; otherwise it is kept and the candidates are only listed.
 */
export async function applyOcrResult(db: AppDB, id: string, result: OcrResult): Promise<DocResult> {
  return db.transaction('rw', db.documents, db.outbox, db.claims, async () => {
    const doc = await liveDoc(db, id)
    if (!doc) return { ok: false, errors: notFound }

    const t = now()
    const next: DocumentRecord = {
      ...doc,
      ocrStatus: 'done',
      ocrText: result.text,
      ocrCandidates: result.candidates,
      updatedAt: t,
    }
    if (doc.amountSource !== 'manual' && !doc.amountConfirmed) {
      const best = result.candidates[0]
      next.amount = best ? best.amount : null
      next.amountSource = best ? 'ocr' : null
      next.amountConfirmed = false
    }
    if (doc.docDate === null && result.date !== null) next.docDate = result.date

    await db.documents.put(next)
    await enqueue(db, { type: 'document.upsert', entity: 'document', entityId: id, payload: next })
    if (next.claimId !== null) await recomputeClaimTotal(db, next.claimId)
    return { ok: true, document: next }
  })
}

/**
 * Merges documents into the first one, in the given order: their files move to it and the others
 * are soft-deleted. Documents in a claim cannot be merged.
 */
export async function mergeDocuments(db: AppDB, ids: ReadonlyArray<string>): Promise<DocResult> {
  const unique = [...new Set(ids)]
  if (unique.length < 2) return { ok: false, errors: { ids: 'error.mergeNeedsTwo' } }

  return db.transaction('rw', db.files, db.documents, db.outbox, async () => {
    const docs: DocumentRecord[] = []
    for (const id of unique) {
      const doc = await liveDoc(db, id)
      if (!doc) return { ok: false, errors: { ids: 'error.documentNotFound' } }
      if (doc.claimId !== null) return { ok: false, errors: { ids: 'error.documentInClaim' } }
      docs.push(doc)
    }

    const t = now()
    const [head, ...rest] = docs
    for (const other of rest) {
      for (const fileId of other.fileIds) {
        const file = await db.files.get(fileId)
        if (!file || file.deleted === 1) continue
        const moved: StoredFile = { ...file, ownerId: head.id, updatedAt: t }
        await db.files.put(moved)
        await enqueue(db, { type: 'file.upsert', entity: 'file', entityId: fileId, payload: toMeta(moved) })
      }
      const tombstone: DocumentRecord = { ...other, fileIds: [], deleted: 1, updatedAt: t }
      await db.documents.put(tombstone)
      await enqueue(db, { type: 'document.delete', entity: 'document', entityId: other.id, payload: { id: other.id } })
    }

    const merged: DocumentRecord = {
      ...head,
      fileIds: docs.flatMap((d) => d.fileIds),
      lowResolution: docs.some((d) => d.lowResolution),
      updatedAt: t,
    }
    await db.documents.put(merged)
    await enqueue(db, { type: 'document.upsert', entity: 'document', entityId: merged.id, payload: merged })
    return { ok: true, document: merged }
  })
}

/**
 * Soft-deletes a document and its files. A document that belongs to a claim is refused; it must
 * be removed from the claim first.
 */
export async function softDelete(
  db: AppDB,
  id: string,
): Promise<{ ok: true } | { ok: false; errors: Record<string, string> }> {
  return db.transaction('rw', db.files, db.documents, db.outbox, async () => {
    const doc = await db.documents.get(id)
    if (!doc) return { ok: false, errors: notFound }
    if (doc.deleted === 1) return { ok: true }
    if (doc.claimId !== null) return { ok: false, errors: { claimId: 'error.documentInClaim' } }

    const t = now()
    for (const fileId of doc.fileIds) {
      const file = await db.files.get(fileId)
      if (!file || file.deleted === 1) continue
      await db.files.update(fileId, { deleted: 1, updatedAt: t })
      await enqueue(db, { type: 'file.delete', entity: 'file', entityId: fileId, payload: { id: fileId } })
    }
    await db.documents.put({ ...doc, deleted: 1, updatedAt: t })
    await enqueue(db, { type: 'document.delete', entity: 'document', entityId: id, payload: { id } })
    return { ok: true }
  })
}

/** Live documents, newest first, optionally filtered. */
export async function listDocuments(db: AppDB, filter: DocumentFilter = {}): Promise<DocumentRecord[]> {
  const rows = await db.documents.filter((d) => d.deleted === 0).toArray()
  return rows
    .filter((d) => filter.category === undefined || d.category === filter.category)
    .filter((d) => filter.personId === undefined || d.personId === filter.personId)
    .filter((d) => !filter.notInClaim || d.claimId === null)
    .sort((a, b) => b.createdAt - a.createdAt)
}

async function writeDoc(db: AppDB, next: DocumentRecord): Promise<void> {
  await db.documents.put(next)
  await enqueue(db, { type: 'document.upsert', entity: 'document', entityId: next.id, payload: next })
}

/** Marks a reading as failed; the document stays editable by hand. */
export async function markOcrFailed(db: AppDB, id: string): Promise<DocResult> {
  return db.transaction('rw', db.documents, db.outbox, async () => {
    const doc = await liveDoc(db, id)
    if (!doc) return { ok: false, errors: notFound }
    const next: DocumentRecord = { ...doc, ocrStatus: 'failed', updatedAt: now() }
    await writeDoc(db, next)
    return { ok: true, document: next }
  })
}

/** The re-read action: an invoice goes back to pending. Other categories are refused. */
export async function requestOcr(db: AppDB, id: string): Promise<DocResult> {
  return db.transaction('rw', db.documents, db.outbox, async () => {
    const doc = await liveDoc(db, id)
    if (!doc) return { ok: false, errors: notFound }
    if (doc.category !== 'invoice') return { ok: false, errors: { category: 'error.notInvoice' } }
    const next: DocumentRecord = { ...doc, ocrStatus: 'pending', updatedAt: now() }
    await writeDoc(db, next)
    return { ok: true, document: next }
  })
}

/** Invoices waiting to be read, oldest first: the queue's work list. */
export async function listPendingOcr(db: AppDB): Promise<DocumentRecord[]> {
  const rows = await db.documents
    .filter((d) => d.deleted === 0 && d.category === 'invoice' && d.ocrStatus === 'pending')
    .toArray()
  return rows.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}
