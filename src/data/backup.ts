import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import type { Table } from 'dexie'
import type { AppDB } from '../db/db'
import { enqueue } from '../sync/outbox'

const APP = 'pti'
const SKIP_TABLES = new Set(['outbox'])
const SETTINGS_KEY = 'lastBackupAt'
/** Tables whose replaced rows are pushed to the outbox, mapped to the sync entity name. */
const ENTITY: Record<string, string> = {
  account: 'account',
  persons: 'person',
  files: 'file',
  documents: 'document',
  claims: 'claim',
  claimEvents: 'claimEvent',
}
/** Settings that describe this device only (the OCR model install) and never leave it. */
const DEVICE_ONLY_SETTINGS = new Set(['ocrModelVersion'])

const MESSAGES = {
  foreign: 'This file is not a backup of this app.',
  'newer-schema': 'This backup comes from a newer version of the app. Update the app and try again.',
  corrupt: 'The backup file is damaged or cannot be read.',
} as const

export class BackupError extends Error {
  code: 'foreign' | 'newer-schema' | 'corrupt'

  constructor(code: 'foreign' | 'newer-schema' | 'corrupt', message?: string) {
    super(message ?? MESSAGES[code])
    this.code = code
    this.name = 'BackupError'
  }
}

interface Row {
  [key: string]: unknown
  updatedAt: number
  deleted?: number
}

interface StagedRow {
  row: Row
  bytes?: Uint8Array
}

interface StagedTable {
  table: Table<Row, string>
  key: string
  items: StagedRow[]
}

const tableOf = (db: AppDB, name: string) => db.table(name) as Table<Row, string>

const pad = (n: number) => String(n).padStart(2, '0')

function backupFileName(at: Date): string {
  const d = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}`
  const t = `${pad(at.getHours())}${pad(at.getMinutes())}`
  return `pti-backup-${d}-${t}.ptibackup`
}

/** Zip the manifest, every table except the outbox, and the bytes of every file. */
export async function exportBackup(db: AppDB, at = new Date()): Promise<{ blob: Blob; fileName: string }> {
  const tableNames = db.tables.map((t) => t.name).filter((n) => !SKIP_TABLES.has(n) && n !== 'files')
  const { snapshot, files } = await db.transaction('r', db.tables, async () => {
    const snap: Record<string, unknown[]> = {}
    for (const name of tableNames) snap[name] = await tableOf(db, name).toArray()
    return { snapshot: snap, files: await db.files.toArray() }
  })

  const entries: Zippable = {}
  const counts: Record<string, number> = {}
  for (const name of tableNames) {
    const rows = name === 'settings' ? snapshot[name].filter((r) => !isDeviceOnly(r)) : snapshot[name]
    counts[name] = rows.length
    entries[`tables/${name}.json`] = strToU8(JSON.stringify(rows))
  }
  const withoutBlob = files.map(({ blob: _blob, ...meta }) => meta)
  counts.files = files.length
  entries['tables/files.json'] = strToU8(JSON.stringify(withoutBlob))
  for (const f of files) entries[`files/${f.id}`] = new Uint8Array(await f.blob.arrayBuffer())

  const manifest = {
    app: APP,
    schemaVersion: db.verno,
    exportedAt: at.toISOString(),
    counts,
  }
  entries['manifest.json'] = strToU8(JSON.stringify(manifest))

  const zip = zipSync(entries)
  return { blob: new Blob([new Uint8Array(zip)], { type: 'application/zip' }), fileName: backupFileName(at) }
}

function readEntries(bytes: ArrayBuffer): Record<string, Uint8Array> {
  try {
    return unzipSync(new Uint8Array(bytes))
  } catch {
    throw new BackupError('corrupt')
  }
}

function parseJson(bytes: Uint8Array, code: BackupError['code']): unknown {
  try {
    return JSON.parse(strFromU8(bytes))
  } catch {
    throw new BackupError(code)
  }
}

const isDeviceOnly = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && DEVICE_ONLY_SETTINGS.has((value as { key?: unknown }).key as string)

const isRow = (value: unknown, key: string): value is Row =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Record<string, unknown>)[key] === 'string' &&
  typeof (value as Record<string, unknown>).updatedAt === 'number'

/**
 * Merge a backup into the device. Everything is validated before the first write; the writes
 * then run in one transaction. A row replaces the device copy only when its updatedAt is strictly
 * newer (ties keep the device copy).
 */
export async function importBackup(db: AppDB, file: Blob): Promise<{ imported: number }> {
  const entries = readEntries(await file.arrayBuffer())

  const rawManifest = entries['manifest.json']
  if (!rawManifest) throw new BackupError('foreign')
  const manifest = parseJson(rawManifest, 'foreign') as { app?: unknown; schemaVersion?: unknown } | null
  if (typeof manifest !== 'object' || manifest === null || manifest.app !== APP) throw new BackupError('foreign')
  if (typeof manifest.schemaVersion !== 'number') throw new BackupError('foreign')
  if (manifest.schemaVersion > db.verno) throw new BackupError('newer-schema')

  const staged: StagedTable[] = []
  for (const dexieTable of db.tables) {
    const name = dexieTable.name
    if (SKIP_TABLES.has(name)) continue
    const raw = entries[`tables/${name}.json`]
    if (!raw) continue
    const rows = parseJson(raw, 'corrupt')
    if (!Array.isArray(rows)) throw new BackupError('corrupt')
    const key = dexieTable.schema.primKey.keyPath as string
    const items: StagedRow[] = []
    for (const candidate of rows) {
      if (!isRow(candidate, key)) throw new BackupError('corrupt')
      if (name === 'settings' && isDeviceOnly(candidate)) continue
      if (name === 'files') {
        const bytes = entries[`files/${candidate.id}`]
        if (!bytes || typeof candidate.mime !== 'string') throw new BackupError('corrupt')
        items.push({ row: candidate, bytes })
      } else {
        items.push({ row: candidate })
      }
    }
    staged.push({ table: tableOf(db, name), key, items })
  }

  let imported = 0
  await db.transaction('rw', db.tables, async () => {
    for (const { table, key, items } of staged) {
      for (const { row, bytes } of items) {
        const existing = await table.get(row[key] as string)
        if (existing && !(row.updatedAt > existing.updatedAt)) continue

        // fflate allocates plain ArrayBuffers; the cast only narrows the TS view type for Blob.
        const record = bytes
          ? { ...row, blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: row.mime as string }) }
          : row
        await table.put(record)

        const entity = ENTITY[table.name]
        if (!entity) continue
        const type = row.deleted === 1 ? `${entity}.delete` : `${entity}.upsert`
        await enqueue(db, { type, entity, entityId: row[key] as string, payload: row })
        imported++
      }
    }
  })
  return { imported }
}

export async function markBackupDone(db: AppDB, at: number): Promise<void> {
  await db.settings.put({ key: SETTINGS_KEY, value: at, updatedAt: at })
}

export async function getLastBackupAt(db: AppDB): Promise<number | null> {
  const row = await db.settings.get(SETTINGS_KEY)
  return typeof row?.value === 'number' ? row.value : null
}

export async function requestPersistence(): Promise<boolean> {
  return (await navigator.storage?.persist?.()) ?? false
}
