// Schema and parsers for the claim requirements dataset (public/data/claim-requirements.json) and the
// administrator configuration (public/data/administrators/<id>.json). Hand-written checks, no schema library.
import type { Result } from './benefits-schema'
import { CLAIM_TYPES, type ClaimFlags, type ClaimType } from './claim-types'
import { DOC_CATEGORIES, type DocCategory } from './document-types'

export type { Result }

export const FLAG_KEYS = [
  'multiDayTreatment',
  'surgery',
  'transfer',
  'publicFacility',
  'rootCanalOrExtraction',
] as const satisfies ReadonlyArray<keyof ClaimFlags>

/** A condition over the claim's flags and total. Used by requirements (`when`). */
export type Condition =
  | { flag: keyof ClaimFlags }
  | { totalGte: number }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }

export interface Requirement {
  id: string
  claimTypes: ClaimType[]
  /** A document of any of these categories meets the requirement. */
  categories: DocCategory[]
  title: string
  required: boolean
  /** null means the requirement always applies to its claim types. */
  when: Condition | null
  note?: string
  checklist: string[]
}

export interface InvoiceGuidance {
  buyer: 'patient'
  fields: string[]
  requiredFields: string[]
  warnings: string[]
}

export interface ClaimRequirements {
  source: string
  updatedAt: string
  invoiceGuidance: InvoiceGuidance
  requirements: Requirement[]
}

export interface ReplyWindow {
  /** Upper bound of the total in VND, exclusive. Absent on the last window. */
  below?: number
  days: number
}

export interface OriginalsAddress {
  region: string
  address: string
}

export interface AdministratorConfig {
  id: string
  name: string
  verified: boolean
  claimEmail: string
  cc: string[]
  /** Placeholders: {patientName}, {contractCode}, {policyholderName}. */
  subjectTemplate: string
  emailClaimTypes: ClaimType[]
  maxAttachmentBytes: number
  hotline: string
  originalsAddresses: OriginalsAddress[]
  replyWorkingDays: ReplyWindow[]
  network: string
  notes: string
}

class SchemaError extends Error {}

function fail(path: string, message: string): never {
  throw new SchemaError(`${path}: ${message}`)
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

function str(v: unknown, path: string): string {
  if (typeof v !== 'string' || v === '') fail(path, 'must be a non-empty string')
  return v
}

function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') fail(path, 'must be a boolean')
  return v
}

function nonNegInt(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) fail(path, 'must be a whole number >= 0')
  return v
}

function positiveInt(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) fail(path, 'must be a whole number > 0')
  return v
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], path: string): T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    fail(path, `must be one of ${allowed.join(', ')}`)
  }
  return v as T
}

function list<T>(v: unknown, path: string, item: (x: unknown, p: string) => T, nonEmpty = false): T[] {
  if (!Array.isArray(v)) fail(path, 'must be an array')
  if (nonEmpty && v.length === 0) fail(path, 'must not be empty')
  return v.map((x, i) => item(x, `${path}[${i}]`))
}

function condition(v: unknown, path: string): Condition {
  if (!isRecord(v)) fail(path, 'must be an object')
  if ('flag' in v) return { flag: oneOf(v.flag, FLAG_KEYS, `${path}.flag`) }
  if ('totalGte' in v) return { totalGte: nonNegInt(v.totalGte, `${path}.totalGte`) }
  if ('all' in v) return { all: list(v.all, `${path}.all`, condition, true) }
  if ('any' in v) return { any: list(v.any, `${path}.any`, condition, true) }
  if ('not' in v) return { not: condition(v.not, `${path}.not`) }
  return fail(path, 'must have one of flag, totalGte, all, any, not')
}

function requirement(v: unknown, path: string): Requirement {
  if (!isRecord(v)) fail(path, 'must be an object')
  const req: Requirement = {
    id: str(v.id, `${path}.id`),
    claimTypes: list(v.claimTypes, `${path}.claimTypes`, (x, p) => oneOf(x, CLAIM_TYPES, p), true),
    categories: list(v.categories, `${path}.categories`, (x, p) => oneOf(x, DOC_CATEGORIES, p), true),
    title: str(v.title, `${path}.title`),
    required: bool(v.required, `${path}.required`),
    when: v.when === null ? null : condition(v.when, `${path}.when`),
    checklist: list(v.checklist, `${path}.checklist`, (x, p) => str(x, p), true),
  }
  if (v.note !== undefined) req.note = str(v.note, `${path}.note`)
  return req
}

function guidance(v: unknown): InvoiceGuidance {
  if (!isRecord(v)) fail('invoiceGuidance', 'must be an object')
  return {
    buyer: oneOf(v.buyer, ['patient'] as const, 'invoiceGuidance.buyer'),
    fields: list(v.fields, 'invoiceGuidance.fields', (x, p) => str(x, p), true),
    requiredFields: list(v.requiredFields, 'invoiceGuidance.requiredFields', (x, p) => str(x, p)),
    warnings: list(v.warnings, 'invoiceGuidance.warnings', (x, p) => str(x, p)),
  }
}

function claimRequirements(json: unknown): ClaimRequirements {
  if (!isRecord(json)) fail('claim-requirements', 'must be an object')
  const requirements = list(json.requirements, 'requirements', requirement, true)
  const ids = new Set<string>()
  for (const r of requirements) {
    if (ids.has(r.id)) fail(`requirements.${r.id}`, 'duplicate id')
    ids.add(r.id)
  }
  return {
    source: str(json.source, 'source'),
    updatedAt: str(json.updatedAt, 'updatedAt'),
    invoiceGuidance: guidance(json.invoiceGuidance),
    requirements,
  }
}

function administrator(json: unknown): AdministratorConfig {
  if (!isRecord(json)) fail('administrator', 'must be an object')
  const replyWorkingDays = list(json.replyWorkingDays, 'replyWorkingDays', (x, p) => {
    if (!isRecord(x)) fail(p, 'must be an object')
    const window: ReplyWindow = { days: positiveInt(x.days, `${p}.days`) }
    if (x.below !== undefined) window.below = positiveInt(x.below, `${p}.below`)
    return window
  }, true)
  if (replyWorkingDays[replyWorkingDays.length - 1].below !== undefined) {
    fail('replyWorkingDays', 'the last window must have no below')
  }
  return {
    id: str(json.id, 'id'),
    name: str(json.name, 'name'),
    verified: bool(json.verified, 'verified'),
    claimEmail: str(json.claimEmail, 'claimEmail'),
    cc: list(json.cc, 'cc', (x, p) => str(x, p)),
    subjectTemplate: str(json.subjectTemplate, 'subjectTemplate'),
    emailClaimTypes: list(json.emailClaimTypes, 'emailClaimTypes', (x, p) => oneOf(x, CLAIM_TYPES, p), true),
    maxAttachmentBytes: positiveInt(json.maxAttachmentBytes, 'maxAttachmentBytes'),
    hotline: str(json.hotline, 'hotline'),
    originalsAddresses: list(json.originalsAddresses, 'originalsAddresses', (x, p) => {
      if (!isRecord(x)) fail(p, 'must be an object')
      return { region: str(x.region, `${p}.region`), address: str(x.address, `${p}.address`) }
    }),
    replyWorkingDays,
    network: oneOf(json.network, ['pti'] as const, 'network'),
    notes: str(json.notes, 'notes'),
  }
}

function attempt<T>(build: () => T): Result<T> {
  try {
    return { ok: true, data: build() }
  } catch (e) {
    if (e instanceof SchemaError) return { ok: false, error: e.message }
    throw e
  }
}

/** Parses public/data/claim-requirements.json. */
export const parseClaimRequirements = (json: unknown): Result<ClaimRequirements> => attempt(() => claimRequirements(json))

/** Parses public/data/administrators/<id>.json. */
export const parseAdministrator = (json: unknown): Result<AdministratorConfig> => attempt(() => administrator(json))
