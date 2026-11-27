import type { AppDB } from '../db/db'
import { now } from '../db/db'
import { enqueue } from '../sync/outbox'

/**
 * Sum of the claim's live invoices with a confirmed amount: the claim's `totalClaimed`.
 * Used by claims-repo and by documents-repo whenever a claimed document changes.
 */
export function claimTotal(documents: ReadonlyArray<{ deleted: 0 | 1; category: string; amountConfirmed: boolean; amount: number | null }>): number {
  let total = 0
  for (const d of documents) {
    if (d.deleted !== 0 || d.category !== 'invoice' || !d.amountConfirmed || d.amount === null) continue
    total += d.amount
  }
  return total
}

/**
 * Recomputes `totalClaimed` of a live claim and queues `claim.upsert` when it changes.
 * Must run inside a 'rw' transaction that includes db.claims, db.documents and db.outbox.
 */
export async function recomputeClaimTotal(db: AppDB, claimId: string): Promise<void> {
  const claim = await db.claims.get(claimId)
  if (!claim || claim.deleted === 1) return
  const documents = await db.documents.where('claimId').equals(claimId).toArray()
  const total = claimTotal(documents)
  if (total === claim.totalClaimed) return
  const next = { ...claim, totalClaimed: total, updatedAt: now() }
  await db.claims.put(next)
  await enqueue(db, { type: 'claim.upsert', entity: 'claim', entityId: claimId, payload: next })
}
