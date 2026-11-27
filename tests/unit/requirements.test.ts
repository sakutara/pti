import { describe, it, expect } from 'vitest'
import claimRequirementsJson from '../../public/data/claim-requirements.json'
import { applicableRequirements, missingRequired } from '../../src/domain/requirements'
import { parseClaimRequirements, type ClaimRequirements } from '../../src/domain/requirements-schema'
import type { Claim, ClaimFlags, ClaimType } from '../../src/domain/claim-types'
import type { DocCategory, DocumentRecord } from '../../src/domain/document-types'

const parsed = parseClaimRequirements(claimRequirementsJson)
if (!parsed.ok) throw new Error(parsed.error)
const dataset: ClaimRequirements = parsed.data
const NO_DOCS: readonly DocumentRecord[] = []

function claimOf(type: ClaimType, total = 0, flags: ClaimFlags = {}): Claim {
  return {
    id: 'claim-1',
    personId: 'person-1',
    type,
    status: 'draft',
    treatmentDate: '2026-11-20',
    facilityId: null,
    facilityName: '',
    reason: 'Khám',
    originalsSubmittedAt: null,
    daysOff: 0,
    admissionDate: null,
    dischargeDate: null,
    bank: null,
    notApplicable: [],
    diagnosis: null,
    flags,
    totalClaimed: total,
    approvedAmount: null,
    rejectionReason: null,
    submittedAt: null,
    bundleFileIds: [],
    wizardStep: 0,
    sentVia: null,
    gmailThreadId: null,
    lastSubmittedFileIds: [],
    updatedAt: 1,
    deleted: 0,
  }
}

function doc(category: DocCategory, overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: `doc-${category}-${Math.random()}`,
    personId: 'person-1',
    claimId: 'claim-1',
    category,
    fileIds: [],
    docDate: '2026-11-20',
    amount: null,
    amountSource: null,
    amountConfirmed: false,
    ocrStatus: 'none',
    ocrText: null,
    ocrCandidates: [],
    lowResolution: false,
    createdAt: 1,
    updatedAt: 1,
    deleted: 0,
    ...overrides,
  }
}

const idsOf = (reqs: { id: string }[]) => reqs.map((r) => r.id)

describe('claims.docs: applicable requirements from the dataset', () => {
  it('claims.docs.outpatient: an outpatient claim without flags requires the prescription and the invoice', () => {
    const reqs = applicableRequirements(dataset, claimOf('outpatient'), NO_DOCS)
    const required = reqs.filter((r) => r.required)
    expect(idsOf(required)).toEqual(expect.arrayContaining(['common.invoice', 'outpatient.prescription']))
    expect(reqs.find((r) => r.id === 'outpatient.prescription')?.title).toBe('Đơn thuốc hoặc sổ khám')
    expect(idsOf(reqs)).not.toContain('outpatient.multi-day')
  })

  it('claims.docs.public-breakdown: a public-facility outpatient claim of 900000 does not need the itemised bill', () => {
    const reqs = applicableRequirements(dataset, claimOf('outpatient', 900000, { publicFacility: true }), NO_DOCS)
    expect(idsOf(reqs)).not.toContain('common.invoice-breakdown')
  })

  it('claims.docs.public-breakdown: the same public-facility claim at 1200000 needs the itemised bill', () => {
    const reqs = applicableRequirements(dataset, claimOf('outpatient', 1200000, { publicFacility: true }), NO_DOCS)
    expect(idsOf(reqs)).toContain('common.invoice-breakdown')
  })

  it('claims.docs.public-breakdown: the public-facility inpatient threshold is 5000000, inclusive', () => {
    const below = applicableRequirements(dataset, claimOf('inpatient', 4999999, { publicFacility: true }), NO_DOCS)
    const at = applicableRequirements(dataset, claimOf('inpatient', 5000000, { publicFacility: true }), NO_DOCS)
    expect(idsOf(below)).not.toContain('inpatient.invoice-breakdown')
    expect(idsOf(at)).toContain('inpatient.invoice-breakdown')
  })

  it('claims.docs.public-breakdown: the public-facility outpatient threshold is 1000000, inclusive', () => {
    const below = applicableRequirements(dataset, claimOf('outpatient', 999999, { publicFacility: true }), NO_DOCS)
    const at = applicableRequirements(dataset, claimOf('outpatient', 1000000, { publicFacility: true }), NO_DOCS)
    expect(idsOf(below)).not.toContain('common.invoice-breakdown')
    expect(idsOf(at)).toContain('common.invoice-breakdown')
  })

  it('claims.docs.optical: an optical claim requires the examination record, the glasses prescription and the invoice', () => {
    const reqs = applicableRequirements(dataset, claimOf('optical'), NO_DOCS)
    const required = idsOf(reqs.filter((r) => r.required))
    expect(required).toEqual(expect.arrayContaining(['optical.exam', 'optical.prescription', 'common.invoice']))
    const exam = reqs.find((r) => r.id === 'optical.exam')
    expect(exam?.categories).toEqual(expect.arrayContaining(['medical-record']))
    expect(reqs.find((r) => r.id === 'optical.prescription')?.categories).toEqual(expect.arrayContaining(['prescription']))
  })

  it('claims.docs.optical: a claim only gets requirements for its own type', () => {
    const reqs = applicableRequirements(dataset, claimOf('dental'), NO_DOCS)
    expect(reqs.every((r) => r.claimTypes.includes('dental'))).toBe(true)
    expect(idsOf(reqs)).toEqual(expect.arrayContaining(['dental.treatment-form']))
  })

  it('claims.docs.optical: dental x-ray is required only with a root canal or extraction flag', () => {
    expect(idsOf(applicableRequirements(dataset, claimOf('dental'), NO_DOCS))).not.toContain('dental.xray')
    const withFlag = applicableRequirements(dataset, claimOf('dental', 0, { rootCanalOrExtraction: true }), NO_DOCS)
    expect(idsOf(withFlag)).toContain('dental.xray')
  })
})

describe('claims.docs: missing required documents', () => {
  it('claims.docs.progress: of 3 required requirements, 2 met leaves one missing', () => {
    const claim = claimOf('outpatient', 0)
    const reqs = applicableRequirements(dataset, claim, NO_DOCS)
    expect(reqs.filter((r) => r.required)).toHaveLength(3)

    const docs = [doc('invoice'), doc('prescription')]
    const missing = missingRequired(reqs, docs)
    expect(idsOf(missing)).toEqual(['common.invoice-breakdown'])
  })

  it('claim-submission.ready.missing: a claim without a prescription lists "Đơn thuốc hoặc sổ khám" as missing', () => {
    const reqs = applicableRequirements(dataset, claimOf('outpatient', 0), NO_DOCS)
    const missing = missingRequired(reqs, [doc('invoice')])
    expect(missing.map((r) => r.title)).toContain('Đơn thuốc hoặc sổ khám')
  })

  it('claims.docs.attach: a document of any listed category meets the requirement', () => {
    const reqs = applicableRequirements(dataset, claimOf('optical'), NO_DOCS)
    const missing = missingRequired(reqs, [doc('medical-record'), doc('prescription'), doc('invoice')])
    expect(missing).toEqual([])
  })

  it('claims.docs.attach: a deleted document does not meet a requirement', () => {
    const reqs = applicableRequirements(dataset, claimOf('outpatient', 0), NO_DOCS)
    const missing = missingRequired(reqs, [doc('invoice'), doc('prescription', { deleted: 1 })])
    expect(idsOf(missing)).toContain('outpatient.prescription')
  })

  it('claims.docs.progress: an optional requirement never counts as missing', () => {
    const reqs = applicableRequirements(dataset, claimOf('outpatient', 0), NO_DOCS)
    const missing = missingRequired(reqs, [doc('invoice'), doc('prescription'), doc('invoice-breakdown')])
    expect(idsOf(missing)).not.toContain('outpatient.lab-result')
    expect(missing).toEqual([])
  })
})
