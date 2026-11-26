import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppDB } from '../../src/db/db'
import { enqueue } from '../../src/sync/outbox'
import { createSyncEngine } from '../../src/sync/sync-engine'
import type { SyncAdapter } from '../../src/sync/adapters'
import { setOnline } from '../setup'

let db: AppDB
beforeEach(async () => {
  db = new AppDB(`test-${crypto.randomUUID()}`)
  await db.open()
  setOnline(true)
})

const op = (n: number) => ({ type: 'note.upsert', entity: 'note', entityId: `n${n}`, payload: { n } })

describe('sync', () => {
  it('sync.resync.online-event: flushes queued ops in order when back online', async () => {
    setOnline(false)
    for (const n of [1, 2, 3]) await enqueue(db, op(n))
    const pushed: string[] = []
    const adapter: SyncAdapter = { name: 'fake', push: async (ops) => { pushed.push(...ops.map((o) => o.entityId)); return { ok: ops.map((o) => o.id), failed: [] } } }
    const engine = createSyncEngine(db, adapter)
    engine.start()
    setOnline(true)
    await vi.waitFor(async () => expect(await db.outbox.count()).toBe(0))
    expect(pushed).toEqual(['n1', 'n2', 'n3'])
    engine.stop()
  })

  it('sync.resync.failure-retry: keeps failed op with attempts and lastError', async () => {
    const queued = await enqueue(db, op(1))
    const adapter: SyncAdapter = { name: 'fake', push: async (ops) => ({ ok: [], failed: ops.map((o) => ({ id: o.id, error: 'boom' })) }) }
    await createSyncEngine(db, adapter).flush()
    const after = await db.outbox.get(queued.id)
    expect(after?.attempts).toBe(1)
    expect(after?.lastError).toBe('boom')
  })

  it('sync.resync.single-flight: concurrent flushes push each op once', async () => {
    await enqueue(db, op(1))
    const push = vi.fn(async (ops: { id: string }[]) => ({ ok: ops.map((o) => o.id), failed: [] }))
    const engine = createSyncEngine(db, { name: 'fake', push })
    await Promise.all([engine.flush(), engine.flush()])
    expect(push).toHaveBeenCalledTimes(1)
  })
})

describe('sync.outbox', () => {
  it('sync.outbox.order: ops queued in the same millisecond keep insertion order', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    for (let n = 1; n <= 20; n++) await enqueue(db, op(n))
    now.mockRestore()
    const ids = (await db.outbox.orderBy('createdAt').toArray()).map((o) => o.entityId)
    expect(ids).toEqual(Array.from({ length: 20 }, (_, i) => `n${i + 1}`))
  })
})
