import { signal } from '@preact/signals'
import type { AppDB } from '../db/db'
import { localOnlyAdapter, type SyncAdapter } from './adapters'

export interface SyncStatus { online: boolean; pending: number; syncing: boolean; lastSyncAt?: number; error?: string }

export const syncStatus = signal<SyncStatus>({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  pending: 0,
  syncing: false,
})

const BATCH = 50

export function createSyncEngine(db: AppDB, adapter: SyncAdapter = localOnlyAdapter) {
  let inFlight: Promise<void> | null = null

  const refreshPending = async () => {
    syncStatus.value = { ...syncStatus.value, pending: await db.outbox.count() }
  }

  async function doFlush() {
    if (!navigator.onLine) return
    syncStatus.value = { ...syncStatus.value, syncing: true, error: undefined }
    try {
      for (;;) {
        const ops = await db.outbox.orderBy('createdAt').limit(BATCH).toArray()
        if (ops.length === 0) break
        const { ok, failed } = await adapter.push(ops)
        await db.transaction('rw', db.outbox, async () => {
          await db.outbox.bulkDelete(ok)
          for (const f of failed) {
            const op = ops.find((o) => o.id === f.id)
            if (op) await db.outbox.update(f.id, { attempts: op.attempts + 1, lastError: f.error })
          }
        })
        if (failed.length > 0) {
          syncStatus.value = { ...syncStatus.value, error: failed[0].error }
          break // retry later with backoff instead of hammering
        }
      }
      syncStatus.value = { ...syncStatus.value, lastSyncAt: Date.now() }
    } finally {
      syncStatus.value = { ...syncStatus.value, syncing: false }
      await refreshPending()
    }
  }

  /** Single-flight: concurrent callers share the running flush. */
  function flush(): Promise<void> {
    if (!inFlight) inFlight = doFlush().finally(() => { inFlight = null })
    return inFlight
  }

  let retryDelay = 1000
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  const scheduleRetry = () => {
    clearTimeout(retryTimer)
    retryTimer = setTimeout(async () => {
      await flush()
      if (syncStatus.value.error) { retryDelay = Math.min(retryDelay * 2, 5 * 60_000); scheduleRetry() }
      else retryDelay = 1000
    }, retryDelay)
  }

  const run = async () => { await flush(); if (syncStatus.value.error) scheduleRetry() }
  const onOnline = () => { syncStatus.value = { ...syncStatus.value, online: true }; void run() }
  const onOffline = () => { syncStatus.value = { ...syncStatus.value, online: false } }
  const onVisible = () => { if (document.visibilityState === 'visible') void run() }

  function start() {
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisible)
    void refreshPending().then(run)
  }

  function stop() {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    document.removeEventListener('visibilitychange', onVisible)
    clearTimeout(retryTimer)
  }

  return { start, stop, flush, refreshPending }
}
