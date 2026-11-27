import type { AdministratorConfig } from '../domain/requirements-schema'
import { parseAdministrator } from '../domain/requirements-schema'
import { loadDataset, loadManifest } from './datasets'

/** The administrator file (public/data/administrators/<id>.json), read through the manifest. Null when it cannot be read. */
export async function loadAdministrator(id: string): Promise<AdministratorConfig | null> {
  const manifest = await loadManifest()
  if (!manifest.ok) return null
  const file = manifest.data.datasets.administrators?.files.find((f) => f.endsWith(`${id}.json`))
  if (!file) return null
  const loaded = await loadDataset(file, parseAdministrator)
  return loaded.ok ? loaded.data : null
}
