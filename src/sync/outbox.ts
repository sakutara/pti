import type { AppDB } from '../db/db'

export interface OutboxOp {
  id: string
  type: string // e.g. 'bookmark.upsert', 'bookmark.delete'
  entity: string
  entityId: string
  payload: unknown
  createdAt: number
  attempts: number
  lastError?: string
}

// createdAt is the flush order, so it must be strictly increasing even when several ops are
// queued in the same millisecond (Date.now() alone ties, and ties would sort by random id).
let lastCreatedAt = 0
const nextCreatedAt = () => (lastCreatedAt = Math.max(Date.now(), lastCreatedAt + 1))

/** Call inside the same db.transaction('rw', table, db.outbox, ...) as the data write. */
export async function enqueue(
  db: AppDB,
  op: Omit<OutboxOp, 'id' | 'createdAt' | 'attempts'>,
): Promise<OutboxOp> {
  const full: OutboxOp = { ...op, id: crypto.randomUUID(), createdAt: nextCreatedAt(), attempts: 0 }
  await db.outbox.add(full)
  return full
}

export const pendingCount = (db: AppDB) => db.outbox.count()
