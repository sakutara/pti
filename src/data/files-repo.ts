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
