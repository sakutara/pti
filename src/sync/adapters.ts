import type { OutboxOp } from './outbox'

export interface PushResult { ok: string[]; failed: { id: string; error: string }[] }

export interface SyncAdapter {
  name: string
  push(ops: OutboxOp[]): Promise<PushResult>
  pull?(since: number): Promise<{ entity: string; records: unknown[] }[]>
}

/** Default while the app has no backend: acknowledges every op so the outbox drains. */
export const localOnlyAdapter: SyncAdapter = {
  name: 'local-only',
  async push(ops) {
    return { ok: ops.map((o) => o.id), failed: [] }
  },
}
