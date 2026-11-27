// One-time notice when the bundled facilities list changed since the user last saw it.
// The last seen version is device-only UI state: it lives in the `settings` table and
// deliberately writes no outbox op.
import { db as appDb, now, type AppDB } from '../db/db'
import type { Manifest } from './datasets'

export const SEEN_FACILITIES_KEY = 'seenFacilitiesVersion'

export interface FacilitiesNotice {
  version: string
  added: number
  removed: number
  changed: number
}

/**
 * Returns the notice to show, or null. On the very first run (no version seen yet) it
 * stores the bundled version and returns null, so a fresh install is not greeted by a notice.
 * A manifest without changes counts reports zeros.
 */
export async function pendingNotice(
  manifest: Manifest,
  database: AppDB = appDb,
): Promise<FacilitiesNotice | null> {
  const entry = manifest.datasets.facilities
  if (!entry) return null

  const row = await database.settings.get(SEEN_FACILITIES_KEY)
  const seen = typeof row?.value === 'string' ? row.value : undefined
  if (seen === undefined) {
    await database.settings.put({ key: SEEN_FACILITIES_KEY, value: entry.version, updatedAt: now() })
    return null
  }
  if (seen === entry.version) return null

  const changes = entry.changes ?? { added: 0, removed: 0, changed: 0 }
  return { version: entry.version, ...changes }
}

/** Records that the user has seen `version`, so its notice is not shown again. */
export async function dismissNotice(version: string, database: AppDB = appDb): Promise<void> {
  await database.settings.put({ key: SEEN_FACILITIES_KEY, value: version, updatedAt: now() })
}
