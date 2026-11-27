// Schema and parser for the PTI facilities dataset (public/data/facilities/pti.json).
// Hand-written checks, no schema library, same conventions as benefits-schema.ts.
import type { Result } from './benefits-schema'

export const SERVICES = ['inpatient', 'outpatient', 'dental'] as const
export type Service = (typeof SERVICES)[number]

export interface Facility {
  id: string
  name: string
  nameEn: string | null
  phone: string | null
  address: string
  provinceCode: string | null
  provinceName: string | null
  hours: string | null
  specialty: string | null
  inpatient: boolean
  outpatient: boolean
  dental: boolean
  blacklisted: boolean
  network: 'pti'
}

export interface FacilitiesDataset {
  fetchedAt: string
  source: string
  count: { directBilling: number; blacklisted: number }
  provinces: { code: string; name: string }[]
  facilities: Facility[]
}

class SchemaError extends Error {}

function fail(path: string, message: string): never {
  throw new SchemaError(`${path}: ${message}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) fail(path, 'phải là đối tượng')
  return value
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'phải là mảng')
  return value
}

function asString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') fail(path, 'phải là chuỗi không rỗng')
  return value
}

function nullableString(value: unknown, path: string): string | null {
  if (value === null) return null
  if (typeof value !== 'string') fail(path, 'phải là chuỗi hoặc null')
  return value
}

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'phải là true hoặc false')
  return value
}

function asNonNegativeInt(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    fail(path, 'phải là số nguyên ≥ 0')
  }
  return value
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/

function asFetchedAt(value: unknown, path: string): string {
  if (typeof value !== 'string' || !ISO_UTC.test(value) || Number.isNaN(Date.parse(value))) {
    fail(path, 'phải là thời điểm ISO 8601 UTC, ví dụ 2026-11-01T02:00:00Z')
  }
  return value
}

function asFacility(value: unknown, path: string): Facility {
  const o = asRecord(value, path)
  const network = o.network
  if (network !== 'pti') fail(`${path}.network`, 'phải là "pti"')
  return {
    id: asString(o.id, `${path}.id`),
    name: asString(o.name, `${path}.name`),
    nameEn: nullableString(o.nameEn, `${path}.nameEn`),
    phone: nullableString(o.phone, `${path}.phone`),
    address: asString(o.address, `${path}.address`),
    provinceCode: nullableString(o.provinceCode, `${path}.provinceCode`),
    provinceName: nullableString(o.provinceName, `${path}.provinceName`),
    hours: nullableString(o.hours, `${path}.hours`),
    specialty: nullableString(o.specialty, `${path}.specialty`),
    inpatient: asBoolean(o.inpatient, `${path}.inpatient`),
    outpatient: asBoolean(o.outpatient, `${path}.outpatient`),
    dental: asBoolean(o.dental, `${path}.dental`),
    blacklisted: asBoolean(o.blacklisted, `${path}.blacklisted`),
    network: 'pti',
  }
}

function parseDataset(raw: unknown): FacilitiesDataset {
  const o = asRecord(raw, 'dataset')

  const count = asRecord(o.count, 'count')
  const provinces = asArray(o.provinces, 'provinces').map((p, i) => {
    const po = asRecord(p, `provinces[${i}]`)
    return {
      code: asString(po.code, `provinces[${i}].code`),
      name: asString(po.name, `provinces[${i}].name`),
    }
  })
  const facilities = asArray(o.facilities, 'facilities').map((f, i) =>
    asFacility(f, `facilities[${i}]`),
  )

  const seen = new Set<string>()
  for (const f of facilities) {
    if (seen.has(f.id)) fail('facilities', `trùng id "${f.id}"`)
    seen.add(f.id)
  }

  return {
    fetchedAt: asFetchedAt(o.fetchedAt, 'fetchedAt'),
    source: asString(o.source, 'source'),
    count: {
      directBilling: asNonNegativeInt(count.directBilling, 'count.directBilling'),
      blacklisted: asNonNegativeInt(count.blacklisted, 'count.blacklisted'),
    },
    provinces,
    facilities,
  }
}

/** Validates an already-parsed JSON value. Never throws; returns the reason on failure. */
export function parseFacilities(json: unknown): Result<FacilitiesDataset> {
  try {
    return { ok: true, data: parseDataset(json) }
  } catch (err) {
    if (err instanceof SchemaError) return { ok: false, error: err.message }
    throw err
  }
}
