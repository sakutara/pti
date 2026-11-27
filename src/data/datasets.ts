// Loads the bundled datasets from public/data (precached by the service worker).
// Results are cached in memory for the session; failures are never cached.
import type { Result } from '../domain/benefits-schema'

export interface DatasetChanges {
  added: number
  removed: number
  changed: number
}

export interface DatasetEntry {
  files: string[]
  updatedAt: string
  version: string
  /** Only the facilities dataset carries this: counts relative to the previous version. */
  changes?: DatasetChanges
}

export interface Manifest {
  schema: number
  datasets: Record<string, DatasetEntry>
}

type Parser<T> = (json: unknown) => Result<T>

const cache = new Map<string, Promise<Result<unknown>>>()

/** Clears the in-memory cache. Used by tests; the app never needs it. */
export function resetDatasetCache(): void {
  cache.clear()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseManifest(json: unknown): Result<Manifest> {
  if (!isRecord(json)) return { ok: false, error: 'manifest phải là đối tượng' }
  if (json.schema !== 1) return { ok: false, error: `manifest schema không được hỗ trợ: ${String(json.schema)}` }
  if (!isRecord(json.datasets)) return { ok: false, error: 'manifest thiếu datasets' }
  const datasets: Record<string, DatasetEntry> = {}
  for (const [name, entry] of Object.entries(json.datasets)) {
    if (!isRecord(entry) || !Array.isArray(entry.files)) {
      return { ok: false, error: `manifest.${name} thiếu files` }
    }
    if (!entry.files.every((f): f is string => typeof f === 'string' && f !== '')) {
      return { ok: false, error: `manifest.${name}.files phải là chuỗi` }
    }
    if (typeof entry.updatedAt !== 'string' || typeof entry.version !== 'string') {
      return { ok: false, error: `manifest.${name} thiếu updatedAt hoặc version` }
    }
    const parsed: DatasetEntry = { files: entry.files, updatedAt: entry.updatedAt, version: entry.version }
    if (entry.changes !== undefined) {
      const c = isRecord(entry.changes) ? entry.changes : {}
      const counts = [c.added, c.removed, c.changed]
      if (!counts.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0)) {
        return { ok: false, error: `manifest.${name}.changes phải có added, removed, changed là số nguyên ≥ 0` }
      }
      parsed.changes = { added: c.added as number, removed: c.removed as number, changed: c.changed as number }
    }
    datasets[name] = parsed
  }
  return { ok: true, data: { schema: 1, datasets } }
}

async function fetchAndParse<T>(path: string, parse: Parser<T>): Promise<Result<T>> {
  let response: Response
  try {
    response = await fetch(`${import.meta.env.BASE_URL}data/${path}`)
  } catch {
    return { ok: false, error: `Không tải được ${path}` }
  }
  if (!response.ok) return { ok: false, error: `Không tải được ${path} (HTTP ${response.status})` }
  let json: unknown
  try {
    json = await response.json()
  } catch {
    return { ok: false, error: `${path} không phải JSON hợp lệ` }
  }
  return parse(json)
}

/**
 * Fetches `data/<path>` once per session and validates it with `parse`.
 * Returns `{ ok: false, error }` for network, HTTP, JSON or validation failures.
 */
export async function loadDataset<T>(path: string, parse: Parser<T>): Promise<Result<T>> {
  const cached = cache.get(path)
  if (cached) return (await cached) as Result<T>

  const pending = fetchAndParse(path, parse)
  cache.set(path, pending as Promise<Result<unknown>>)
  const result = await pending
  if (!result.ok && cache.get(path) === (pending as Promise<Result<unknown>>)) cache.delete(path)
  return result
}

export function loadManifest(): Promise<Result<Manifest>> {
  return loadDataset('manifest.json', parseManifest)
}
