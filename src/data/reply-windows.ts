import { parseAdministrator, type ReplyWindow } from '../domain/requirements-schema'
import { loadDataset, loadManifest } from './datasets'

/**
 * Reply windows of an administrator from its bundled dataset. Null when the manifest or the file cannot be read: the
 * pages then show no overdue marks instead of failing.
 */
export async function loadReplyWindows(administratorId: string): Promise<ReplyWindow[] | null> {
  const manifest = await loadManifest()
  if (!manifest.ok) return null
  const file = manifest.data.datasets.administrators?.files.find((f) => f.endsWith(`${administratorId}.json`))
  if (!file) return null
  const loaded = await loadDataset(file, parseAdministrator)
  return loaded.ok ? loaded.data.replyWorkingDays : null
}
