// Schema and parser for the benefits dataset (public/data/benefits/<year>.json).
// Hand-written checks, no schema library. Money values are whole VND >= 0.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export const MEMBER_TYPES = ['employee', 'sponsored', 'voluntary'] as const
export type MemberType = (typeof MEMBER_TYPES)[number]

export const CATEGORIES = [
  'outpatient',
  'dental',
  'optical',
  'inpatient',
  'maternity',
  'accident',
  'life',
  'income',
] as const
export type Category = (typeof CATEGORIES)[number]

export type Tier = 1 | 2 | 3 | 4

export const UNITS = ['year', 'visit', 'day', 'case', 'actual', 'sumInsured'] as const
export type Unit = (typeof UNITS)[number]

// number: whole VND; 'actual': paid up to the limit; other string: description; null: no own limit.
export type Value = number | 'actual' | string | null

export interface Tiered {
  tier: Tier
  name: string
}

export interface Benefit {
  id: string
  category: Category
  title: string
  unit: Unit
  values: Record<MemberType, Value[] | null>
  maxDaysPerYear?: number
  notes?: string
}

export interface Extension {
  id: string
  title: string
  limitPerYear?: number
  notes?: string
}

export interface Exclusion {
  id: string
  text: string
  keywords: string[]
  extensionIds: string[]
}

export interface BenefitsDataset {
  policyYear: number
  effectiveFrom: string
  effectiveTo: string
  product: string
  insurer: string
  verified: boolean
  source: string
  claimDeadlineDays: number
  hotline: string
  memberTypes: Record<MemberType, string>
  tiers: Tiered[]
  copayPercent: Partial<Record<Category, Partial<Record<MemberType, number>>>>
  benefits: Benefit[]
  extensions: Extension[]
  waitingPeriods: Record<MemberType, string[]>
  exclusions: Exclusion[]
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

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined
  return typeof value === 'string' ? value : fail(path, 'phải là chuỗi')
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

function optionalNonNegativeInt(value: unknown, path: string): number | undefined {
  return value === undefined ? undefined : asNonNegativeInt(value, path)
}

// Money: whole VND, zero or more.
function asMoney(value: unknown, path: string): number {
  return asNonNegativeInt(value, path)
}

function asPercent(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    fail(path, 'phải là số từ 0 đến 100')
  }
  return value
}

function asIsoDate(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(path, 'phải có dạng YYYY-MM-DD')
  }
  const [y, m, d] = value.split('-').map(Number) as [number, number, number]
  const probe = new Date(Date.UTC(y, m - 1, d))
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    fail(path, 'không phải ngày có thật')
  }
  return value
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    fail(path, `phải là một trong: ${allowed.join(', ')}`)
  }
  return value as T
}

function asMemberRecord<T>(
  value: unknown,
  path: string,
  read: (v: unknown, p: string) => T,
): Record<MemberType, T> {
  const obj = asRecord(value, path)
  const out = {} as Record<MemberType, T>
  for (const mt of MEMBER_TYPES) {
    if (!(mt in obj)) fail(`${path}.${mt}`, 'thiếu')
    out[mt] = read(obj[mt], `${path}.${mt}`)
  }
  return out
}

function asValue(value: unknown, path: string): Value {
  if (value === null) return null
  if (typeof value === 'number') return asMoney(value, path)
  if (typeof value === 'string') return value
  return fail(path, 'phải là số, chuỗi hoặc null')
}

function asBenefit(value: unknown, path: string): Benefit {
  const o = asRecord(value, path)
  const benefit: Benefit = {
    id: asString(o.id, `${path}.id`),
    category: asEnum(o.category, CATEGORIES, `${path}.category`),
    title: asString(o.title, `${path}.title`),
    unit: asEnum(o.unit, UNITS, `${path}.unit`),
    values: asMemberRecord(o.values, `${path}.values`, (v, p) => {
      if (v === null) return null
      const arr = asArray(v, p)
      if (arr.length !== 4) fail(p, 'phải có đúng 4 giá trị theo hạng 1..4')
      return arr.map((item, i) => asValue(item, `${p}[${i}]`))
    }),
  }
  const maxDays = optionalNonNegativeInt(o.maxDaysPerYear, `${path}.maxDaysPerYear`)
  if (maxDays !== undefined) benefit.maxDaysPerYear = maxDays
  const notes = optionalString(o.notes, `${path}.notes`)
  if (notes !== undefined) benefit.notes = notes
  return benefit
}

function asExtension(value: unknown, path: string): Extension {
  const o = asRecord(value, path)
  const ext: Extension = {
    id: asString(o.id, `${path}.id`),
    title: asString(o.title, `${path}.title`),
  }
  const limit = optionalNonNegativeInt(o.limitPerYear, `${path}.limitPerYear`)
  if (limit !== undefined) ext.limitPerYear = limit
  const notes = optionalString(o.notes, `${path}.notes`)
  if (notes !== undefined) ext.notes = notes
  return ext
}

function asExclusion(value: unknown, path: string): Exclusion {
  const o = asRecord(value, path)
  return {
    id: asString(o.id, `${path}.id`),
    text: asString(o.text, `${path}.text`),
    keywords: asArray(o.keywords, `${path}.keywords`).map((k, i) =>
      asString(k, `${path}.keywords[${i}]`),
    ),
    extensionIds: asArray(o.extensionIds, `${path}.extensionIds`).map((k, i) =>
      asString(k, `${path}.extensionIds[${i}]`),
    ),
  }
}

function assertUnique(ids: string[], path: string): void {
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) fail(path, `trùng id "${id}"`)
    seen.add(id)
  }
}

function asCopay(value: unknown): BenefitsDataset['copayPercent'] {
  const byCategory = asRecord(value, 'copayPercent')
  const out: BenefitsDataset['copayPercent'] = {}
  for (const [key, perMember] of Object.entries(byCategory)) {
    const category = asEnum(key, CATEGORIES, `copayPercent.${key}`)
    const byMember = asRecord(perMember, `copayPercent.${key}`)
    const cell: Partial<Record<MemberType, number>> = {}
    for (const [mkey, pct] of Object.entries(byMember)) {
      const mt = asEnum(mkey, MEMBER_TYPES, `copayPercent.${key}.${mkey}`)
      cell[mt] = asPercent(pct, `copayPercent.${key}.${mkey}`)
    }
    out[category] = cell
  }
  return out
}

function asTiers(value: unknown): Tiered[] {
  const arr = asArray(value, 'tiers')
  const tiers = arr.map((item, i) => {
    const o = asRecord(item, `tiers[${i}]`)
    const tier = asNonNegativeInt(o.tier, `tiers[${i}].tier`)
    if (tier < 1 || tier > 4) fail(`tiers[${i}].tier`, 'phải nằm trong 1..4')
    return { tier: tier as Tier, name: asString(o.name, `tiers[${i}].name`) }
  })
  const seen = new Set<number>()
  for (const t of tiers) {
    if (seen.has(t.tier)) fail('tiers', `hạng ${t.tier} bị trùng`)
    seen.add(t.tier)
  }
  for (const required of [1, 2, 3, 4]) {
    if (!seen.has(required)) fail('tiers', `thiếu hạng ${required}`)
  }
  return tiers
}

function parseDataset(raw: unknown): BenefitsDataset {
  const o = asRecord(raw, 'dataset')

  const policyYear = asNonNegativeInt(o.policyYear, 'policyYear')
  const effectiveFrom = asIsoDate(o.effectiveFrom, 'effectiveFrom')
  const effectiveTo = asIsoDate(o.effectiveTo, 'effectiveTo')
  if (effectiveFrom > effectiveTo) fail('effectiveFrom', 'sau effectiveTo')

  const benefits = asArray(o.benefits, 'benefits').map((b, i) => asBenefit(b, `benefits[${i}]`))
  assertUnique(
    benefits.map((b) => b.id),
    'benefits',
  )

  const extensions = asArray(o.extensions, 'extensions').map((e, i) =>
    asExtension(e, `extensions[${i}]`),
  )
  assertUnique(
    extensions.map((e) => e.id),
    'extensions',
  )

  // Exclusions may point at an extension or at a benefit (e.g. the optical limit).
  const knownTargets = new Set([...extensions.map((e) => e.id), ...benefits.map((b) => b.id)])
  const exclusions = asArray(o.exclusions, 'exclusions').map((x, i) => {
    const ex = asExclusion(x, `exclusions[${i}]`)
    ex.extensionIds.forEach((target, j) => {
      if (!knownTargets.has(target)) {
        fail(`exclusions[${i}].extensionIds[${j}]`, `không có quyền lợi hoặc tiện ích "${target}"`)
      }
    })
    return ex
  })

  return {
    policyYear,
    effectiveFrom,
    effectiveTo,
    product: asString(o.product, 'product'),
    insurer: asString(o.insurer, 'insurer'),
    verified: asBoolean(o.verified, 'verified'),
    source: asString(o.source, 'source'),
    claimDeadlineDays: asNonNegativeInt(o.claimDeadlineDays, 'claimDeadlineDays'),
    hotline: asString(o.hotline, 'hotline'),
    memberTypes: asMemberRecord(o.memberTypes, 'memberTypes', (v, p) => asString(v, p)),
    tiers: asTiers(o.tiers),
    copayPercent: asCopay(o.copayPercent),
    benefits,
    extensions,
    waitingPeriods: asMemberRecord(o.waitingPeriods, 'waitingPeriods', (v, p) =>
      asArray(v, p).map((item, i) => asString(item, `${p}[${i}]`)),
    ),
    exclusions,
  }
}

/** Validates an already-parsed JSON value. Never throws; returns the reason on failure. */
export function parseBenefits(json: unknown): Result<BenefitsDataset> {
  try {
    return { ok: true, data: parseDataset(json) }
  } catch (err) {
    if (err instanceof SchemaError) return { ok: false, error: err.message }
    throw err
  }
}
