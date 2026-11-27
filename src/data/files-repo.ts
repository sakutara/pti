import type { AppDB } from '../db/db'
import { newId, now } from '../db/db'
import { enqueue } from '../sync/outbox'
import type { FileKind, FileOwnerType, Person, StoredFile } from '../domain/types'
import { downscaleImage, sha256 } from '../lib/image'

export type Downscale = (file: Blob) => Promise<{ blob: Blob; width: number; height: number }>

type Owner = { type: FileOwnerType; id: string }

/** File metadata for outbox payloads: never carries the Blob. */
function toMeta(file: StoredFile): Omit<StoredFile, 'blob'> {
  const { blob: _blob, ...meta } = file
  return meta
}

/**
 * Downscale, hash and store an image. For a person's card-front/card-back the file is
 * linked on the person and the previous file (if any) is soft-deleted, all in one transaction.
 */
export async function saveImage(
  db: AppDB,
  owner: Owner,
  kind: FileKind,
  file: Blob,
  opts?: { downscale?: Downscale; maxEdge?: number },
): Promise<StoredFile> {
  const downscale: Downscale =
    opts?.downscale ?? ((f) => downscaleImage(f, opts?.maxEdge ?? 2000, 0.8))
  const out = await downscale(file)
  const hash = await sha256(out.blob)

  const t = now()
  const record: StoredFile = {
    id: newId(),
    ownerType: owner.type,
    ownerId: owner.id,
    kind,
    mime: out.blob.type || 'image/jpeg',
    blob: out.blob,
    bytes: out.blob.size,
    sha256: hash,
    createdAt: t,
    updatedAt: t,
    deleted: 0,
  }

  const isCard = owner.type === 'person' && (kind === 'card-front' || kind === 'card-back')
  if (!isCard) {
    await db.transaction('rw', db.files, db.outbox, async () => {
      await db.files.add(record)
      await enqueue(db, { type: 'file.upsert', entity: 'file', entityId: record.id, payload: toMeta(record) })
    })
    return record
  }

  const field = kind === 'card-front' ? 'cardFrontFileId' : 'cardBackFileId'
  await db.transaction('rw', db.files, db.persons, db.outbox, async () => {
    const person = await db.persons.get(owner.id)
    if (!person || person.deleted === 1) throw new Error(`person not found: ${owner.id}`)

    const previousId = person[field]
    await db.files.add(record)
    await enqueue(db, { type: 'file.upsert', entity: 'file', entityId: record.id, payload: toMeta(record) })

    if (previousId) {
      const previous = await db.files.get(previousId)
      if (previous) {
        await db.files.update(previousId, { deleted: 1, updatedAt: t })
        await enqueue(db, { type: 'file.delete', entity: 'file', entityId: previousId, payload: { id: previousId } })
      }
    }

    const updated: Person = { ...person, updatedAt: t }
    updated[field] = record.id
    await db.persons.put(updated)
    await enqueue(db, { type: 'person.upsert', entity: 'person', entityId: updated.id, payload: updated })
  })
  return record
}

/** Blob of a live (not soft-deleted) file, or undefined. */
export async function getBlob(db: AppDB, id: string): Promise<Blob | undefined> {
  const record = await db.files.get(id)
  return record && record.deleted === 0 ? record.blob : undefined
}

/** Soft-delete a file and enqueue file.delete in the same transaction. */
export async function softDeleteFile(db: AppDB, id: string): Promise<void> {
  await db.transaction('rw', db.files, db.outbox, async () => {
    const record = await db.files.get(id)
    if (!record) throw new Error(`file not found: ${id}`)
    await db.files.update(id, { deleted: 1, updatedAt: now() })
    await enqueue(db, { type: 'file.delete', entity: 'file', entityId: id, payload: { id } })
  })
}

/** Stored file (with its Blob) that is not soft-deleted, or undefined. */
export async function getStoredFile(db: AppDB, id: string): Promise<StoredFile | undefined> {
  const record = await db.files.get(id)
  return record && record.deleted === 0 ? record : undefined
}

/** Statuses in which the claim's files may be built or rebuilt. */
const BUNDLE_STATUSES: readonly string[] = ['draft', 'ready', 'need_info']

export type BundleResult = { ok: true; fileIds: string[] } | { ok: false; errors: Record<string, string> }

/**
 * Replaces the claim's bundle with the given PDFs (the claim form first, then the attachments). The previous bundle
 * files are soft-deleted, the new ones stored as kind 'bundle' with owner 'claim', and claim.bundleFileIds points to
 * them. All writes and their outbox ops happen in one transaction.
 */
export async function storeClaimBundle(
  db: AppDB,
  claimId: string,
  parts: ReadonlyArray<{ bytes: Uint8Array }>,
): Promise<BundleResult> {
  // Hashing is awaited before the transaction: Dexie would commit a transaction that waits on other promises.
  const t = now()
  const records: StoredFile[] = []
  for (const part of parts) {
    const blob = new Blob([new Uint8Array(part.bytes)], { type: 'application/pdf' })
    records.push({
      id: newId(),
      ownerType: 'claim',
      ownerId: claimId,
      kind: 'bundle',
      mime: 'application/pdf',
      blob,
      bytes: blob.size,
      sha256: await sha256(blob),
      createdAt: t,
      updatedAt: t,
      deleted: 0,
    })
  }

  return db.transaction('rw', db.files, db.claims, db.outbox, async (): Promise<BundleResult> => {
    const claim = await db.claims.get(claimId)
    if (!claim || claim.deleted === 1) return { ok: false, errors: { id: 'error.claimNotFound' } }
    if (!BUNDLE_STATUSES.includes(claim.status)) return { ok: false, errors: { status: 'error.claimLocked' } }

    for (const oldId of claim.bundleFileIds) {
      const old = await db.files.get(oldId)
      if (!old || old.deleted === 1) continue
      await db.files.update(oldId, { deleted: 1, updatedAt: t })
      await enqueue(db, { type: 'file.delete', entity: 'file', entityId: oldId, payload: { id: oldId } })
    }

    for (const record of records) {
      await db.files.add(record)
      await enqueue(db, { type: 'file.upsert', entity: 'file', entityId: record.id, payload: toMeta(record) })
    }
    const fileIds = records.map((r) => r.id)

    const next = { ...claim, bundleFileIds: fileIds, updatedAt: t }
    await db.claims.put(next)
    await enqueue(db, { type: 'claim.upsert', entity: 'claim', entityId: claimId, payload: next })
    return { ok: true, fileIds }
  })
}
