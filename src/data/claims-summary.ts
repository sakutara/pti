import type { AppDB } from '../db/db'
import { isOverdue } from '../domain/working-days'
import type { ReplyWindow } from '../domain/requirements-schema'

/** Claims still with the insurer: submitted or waiting for supplementary documents (claims.list.filter, app-shell.home.summary). */
export async function countOpenClaims(db: AppDB): Promise<number> {
  const rows = await db.claims.filter((c) => c.deleted === 0 && (c.status === 'submitted' || c.status === 'need_info')).toArray()
  return rows.length
}

/** Submitted claims whose reply time has passed on `today` (YYYY-MM-DD), by the reply windows of the administrator. */
export async function countOverdue(db: AppDB, today: string, windows: readonly ReplyWindow[]): Promise<number> {
  const rows = await db.claims.filter((c) => c.deleted === 0 && c.status === 'submitted').toArray()
  return rows.filter((c) => isOverdue(c, today, windows)).length
}
