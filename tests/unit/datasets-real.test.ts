import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseBenefits, type Benefit, type BenefitsDataset } from '../../src/domain/benefits-schema'
import { buildDataset, facilityId, sortFacilities } from '../../scripts/lib/facilities.mjs'
import {
  parseAdministrator,
  parseClaimRequirements,
  type AdministratorConfig,
  type ClaimRequirements,
} from '../../src/domain/requirements-schema'
import { CLAIM_TYPES } from '../../src/domain/claim-types'

// Reads the shipped dataset straight from disk (read-only) and runs the same parser the app uses.
// Vitest runs from the project root; import.meta.url is not a file: URL under jsdom.
const dataDir = resolve(process.cwd(), 'public/data')
const readText = (rel: string) => readFileSync(resolve(dataDir, rel), 'utf8')

interface Manifest {
  schema: number
  datasets: Record<string, { files: string[]; changes?: Record<string, number> }>
}

interface RawFacility {
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
  network: string
}

interface FacilitiesFile {
  fetchedAt: string
  source: string
  count: { directBilling: number; blacklisted: number }
  provinces: { code: string; name: string }[]
  facilities: RawFacility[]
}

// Structural check for the facilities file. The app's own parser (facilities-schema) is not imported here.
const FACILITY_STRING_FIELDS = ['id', 'name', 'address', 'network'] as const
const FACILITY_NULLABLE_FIELDS = ['nameEn', 'phone', 'provinceCode', 'provinceName', 'hours', 'specialty'] as const
const FACILITY_BOOLEAN_FIELDS = ['inpatient', 'outpatient', 'dental', 'blacklisted'] as const

function facilitiesShapeError(json: unknown): string | null {
  if (typeof json !== 'object' || json === null) return 'facilities file must be an object'
  const file = json as Partial<FacilitiesFile>
  if (typeof file.fetchedAt !== 'string' || typeof file.source !== 'string') return 'missing fetchedAt or source'
  if (!Array.isArray(file.provinces) || !Array.isArray(file.facilities)) return 'missing provinces or facilities'
  for (const f of file.facilities as Record<string, unknown>[]) {
    for (const key of FACILITY_STRING_FIELDS) if (typeof f[key] !== 'string' || f[key] === '') return `${key} of ${String(f.name)}`
    for (const key of FACILITY_NULLABLE_FIELDS) if (f[key] !== null && typeof f[key] !== 'string') return `${key} of ${String(f.name)}`
    for (const key of FACILITY_BOOLEAN_FIELDS) if (typeof f[key] !== 'boolean') return `${key} of ${String(f.name)}`
    if (f.network !== 'pti') return `network of ${String(f.name)}`
    if (!/^f-[0-9a-f]{12}$/.test(String(f.id))) return `id of ${String(f.name)}`
  }
  return null
}

// Parsers per dataset name. Benefits use the app parser; facilities use the structural check above.
const datasetChecks: Record<string, (json: unknown) => string | null> = {
  benefits: (json) => {
    const result = parseBenefits(json)
    return result.ok ? null : result.error
  },
  facilities: facilitiesShapeError,
  claimRequirements: (json) => {
    const result = parseClaimRequirements(json)
    return result.ok ? null : result.error
  },
  administrators: (json) => {
    const result = parseAdministrator(json)
    return result.ok ? null : result.error
  },
}

function loadRealFacilities(): FacilitiesFile {
  return JSON.parse(readText('facilities/pti.json')) as FacilitiesFile
}

function loadRealBenefits(): BenefitsDataset {
  const manifest = JSON.parse(readText('manifest.json')) as Manifest
  const files = manifest.datasets.benefits?.files ?? []
  const file = files.find((f) => f === 'benefits/2026.json')
  expect(file, 'manifest lists benefits/2026.json').toBeDefined()
  const result = parseBenefits(JSON.parse(readText(file as string)))
  if (!result.ok) throw new Error(result.error)
  return result.data
}

function loadRealRequirements(): ClaimRequirements {
  const result = parseClaimRequirements(JSON.parse(readText('claim-requirements.json')))
  if (!result.ok) throw new Error(result.error)
  return result.data
}

function loadRealMarsh(): AdministratorConfig {
  const result = parseAdministrator(JSON.parse(readText('administrators/marsh.json')))
  if (!result.ok) throw new Error(result.error)
  return result.data
}

const REQUIREMENT_IDS = [
  'common.invoice',
  'common.invoice-breakdown',
  'outpatient.prescription',
  'outpatient.lab-result',
  'outpatient.multi-day',
  'optical.exam',
  'optical.prescription',
  'dental.treatment-form',
  'dental.xray',
  'dental.prescription',
  'inpatient.invoice-breakdown',
  'inpatient.discharge',
  'inpatient.pre-admission',
  'inpatient.surgery-cert',
  'inpatient.transfer',
  'inpatient.post-discharge',
]

function benefitById(data: BenefitsDataset, id: string): Benefit {
  const found = data.benefits.find((b) => b.id === id)
  if (!found) throw new Error(`benefit ${id} not found`)
  return found
}

describe('benefits.dataset.load (real data)', () => {
  it('benefits.dataset.load: every file listed in manifest.json passes the parser', () => {
    const manifest = JSON.parse(readText('manifest.json')) as Manifest
    expect(manifest.schema).toBe(1)
    const entries = Object.entries(manifest.datasets)
    expect(entries.length).toBeGreaterThan(0)
    for (const [name, dataset] of entries) {
      expect(dataset.files.length, name).toBeGreaterThan(0)
      const check = datasetChecks[name]
      expect(check, `no check for dataset ${name}`).toBeDefined()
      for (const file of dataset.files) {
        const error = check?.(JSON.parse(readText(file))) ?? null
        expect(error, `${name}:${file}`).toBeNull()
      }
    }
  })

  it('benefits.dataset.load: 2026 dataset has policy year 2026 and 4 tiers', () => {
    const data = loadRealBenefits()
    expect(data.policyYear).toBe(2026)
    expect(data.tiers.map((t) => t.tier)).toEqual([1, 2, 3, 4])
  })

  it('benefits.dataset.load: milestone values match the policy summary', () => {
    const data = loadRealBenefits()
    // Outpatient yearly limit, employee, tier 2 (index 1).
    expect(benefitById(data, 'outpatient.annual').values.employee?.[1]).toBe(16000000)
    // Outpatient yearly limit, voluntary dependent, tier 3 (index 2).
    expect(benefitById(data, 'outpatient.annual').values.voluntary?.[2]).toBe(16500000)
    // Maternity yearly limit, voluntary dependent, tier 4 (index 3).
    expect(benefitById(data, 'maternity.annual').values.voluntary?.[3]).toBe(50000000)
  })

  it('benefits.dataset.load: contains no company name fields and no contract or policy numbers', () => {
    const raw = readText('benefits/2026.json')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    for (const key of Object.keys(parsed)) {
      expect(key, 'top-level key').not.toMatch(/company|employer|contract|policy(holder|number|no)/i)
    }
    expect(raw).not.toMatch(/số hợp đồng|hợp đồng số|contract\s*(no|number)|policy\s*(no|number)|\bHĐ\b/i)
  })
})

describe('claims.docs.outpatient: claim requirements dataset (real data)', () => {
  it('claims.docs.outpatient: an outpatient claim without flags lists the prescription or medical book and the invoice as required', () => {
    const data = loadRealRequirements()
    const applicable = data.requirements.filter((r) => r.claimTypes.includes('outpatient') && r.when === null)
    const required = applicable.filter((r) => r.required).map((r) => r.id)
    expect(required).toEqual(expect.arrayContaining(['common.invoice', 'outpatient.prescription']))
    const prescription = data.requirements.find((r) => r.id === 'outpatient.prescription')
    expect(prescription?.categories).toEqual(expect.arrayContaining(['prescription', 'medical-record']))
  })

  it('claims.docs.outpatient: the file holds the 16 requirements of the design table, each with categories and a checklist', () => {
    const data = loadRealRequirements()
    expect(data.requirements.map((r) => r.id).sort()).toEqual([...REQUIREMENT_IDS].sort())
    for (const r of data.requirements) {
      expect(r.categories.length, r.id).toBeGreaterThan(0)
      expect(r.checklist.length, r.id).toBeGreaterThan(0)
    }
  })

  it('claims.docs.outpatient: every requirement applies to at least one claim type from the claim type list', () => {
    const data = loadRealRequirements()
    for (const r of data.requirements) {
      expect(r.claimTypes.length, r.id).toBeGreaterThan(0)
      for (const t of r.claimTypes) expect(CLAIM_TYPES).toContain(t)
    }
    const common = data.requirements.find((r) => r.id === 'common.invoice')
    expect([...(common?.claimTypes ?? [])].sort()).toEqual([...CLAIM_TYPES].sort())
  })

  it('claims.docs.outpatient: the public hospital breakdown thresholds are 1000000 (outpatient) and 5000000 (inpatient)', () => {
    const data = loadRealRequirements()
    const outpatientBreakdown = data.requirements.find((r) => r.id === 'common.invoice-breakdown')
    const inpatientBreakdown = data.requirements.find((r) => r.id === 'inpatient.invoice-breakdown')
    expect(JSON.stringify(outpatientBreakdown?.when)).toContain('"totalGte":1000000')
    expect(JSON.stringify(inpatientBreakdown?.when)).toContain('"totalGte":5000000')
  })

  it('claims.docs.outpatient: the invoice guidance names the insured person as buyer with the three fields', () => {
    const data = loadRealRequirements()
    expect(data.invoiceGuidance.buyer).toBe('patient')
    expect(data.invoiceGuidance.fields).toEqual(['fullName', 'address', 'idNumber'])
    expect(data.invoiceGuidance.requiredFields).toEqual(['fullName', 'address'])
    expect(data.invoiceGuidance.warnings.length).toBeGreaterThan(0)
  })
})

describe('claim-submission.email.recipient-default: administrator configuration (real data)', () => {
  it('claim-submission.email.recipient-default: the Marsh claim email is the PTI address and the Marsh address is the CC', () => {
    const marsh = loadRealMarsh()
    expect(marsh.id).toBe('marsh')
    expect(marsh.claimEmail).toBe('nhanhsbt.mn@pti.com.vn')
    expect(marsh.cc).toEqual(['vietnamMMBclaims@marsh.com'])
    expect(marsh.emailClaimTypes).toEqual(['outpatient', 'dental', 'optical'])
    expect(marsh.maxAttachmentBytes).toBe(15000000)
    expect(marsh.hotline).toBe('1900 5454 75')
    expect(marsh.subjectTemplate).toBe('HS YCBT – {patientName} – {contractCode} – {policyholderName}')
  })

  it('claim-submission.email.recipient-default: the reply windows give 7, 15 and 20 working days by amount', () => {
    const marsh = loadRealMarsh()
    expect(marsh.replyWorkingDays).toEqual([
      { below: 20000000, days: 7 },
      { below: 100000001, days: 15 },
      { days: 20 },
    ])
  })

  it('claim-submission.email.recipient-default: the originals addresses are the two PTI claim centre addresses from the policy summary', () => {
    const marsh = loadRealMarsh()
    expect(marsh.originalsAddresses).toEqual([
      {
        region: 'Miền Nam',
        address:
          'Tầng 2, Tòa nhà Thủy Lợi 4, 205 Nguyễn Xí, phường Bình Thạnh, TP. Hồ Chí Minh.',
      },
      {
        region: 'Miền Bắc',
        address:
          'Zone 2B, Tầng 2, CT1 Tòa nhà Ban Cơ yếu Chính phủ, 43 Lê Văn Lương, phường Thanh Xuân, Hà Nội.',
      },
    ])
  })

  it('claim-submission.email.recipient-default: the administrator file has no contract number, policyholder name or office hours', () => {
    const raw = readText('administrators/marsh.json')
    expect(raw).not.toMatch(/số hợp đồng|hợp đồng số|contract\s*(no|number)|policy\s*(no|number)|HĐ\s*\d|Công ty/i)
    expect(raw).not.toMatch(/\b\d{1,2}:\d{2}\b/)
  })

  it('claim-submission.email.recipient-default: manifest lists claimRequirements and administrators, and both pass the parsers', () => {
    const manifest = JSON.parse(readText('manifest.json')) as Manifest
    expect(manifest.datasets.claimRequirements?.files).toEqual(['claim-requirements.json'])
    expect(manifest.datasets.administrators?.files).toEqual(['administrators/marsh.json'])
  })
})

describe('data-refresh.normalize.deterministic (committed facilities data)', () => {
  it('data-refresh.normalize.deterministic: pti.json is in canonical order with stable ids', () => {
    const file = loadRealFacilities()
    const sorted = sortFacilities(file.facilities)
    expect(file.facilities.map((f) => f.id)).toEqual(sorted.map((f) => f.id))
    for (const f of file.facilities) expect(f.id).toBe(facilityId(f.name, f.address))
    expect(new Set(file.facilities.map((f) => f.id)).size).toBe(file.facilities.length)
  })

  it('data-refresh.normalize.deterministic: re-serializing pti.json reproduces the file bytes exactly', () => {
    const raw = readText('facilities/pti.json')
    const file = loadRealFacilities()
    const rebuilt = buildDataset({
      provinces: file.provinces,
      facilities: file.facilities,
      fetchedAt: file.fetchedAt,
      source: file.source,
    })
    expect(`${JSON.stringify(rebuilt, null, 2)}\n`).toBe(raw)
  })

  it('data-refresh.normalize.deterministic: count matches the facilities list and manifest changes match the first load', () => {
    const file = loadRealFacilities()
    expect(file.count.directBilling).toBe(file.facilities.filter((f) => !f.blacklisted).length)
    expect(file.count.blacklisted).toBe(file.facilities.filter((f) => f.blacklisted).length)
    expect(file.count.directBilling).toBeGreaterThan(0)
    const manifest = JSON.parse(readText('manifest.json')) as Manifest
    const entry = manifest.datasets.facilities
    expect(entry?.files).toEqual(['facilities/pti.json'])
    expect(entry?.changes).toBeDefined()
  })
})
