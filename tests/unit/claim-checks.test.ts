import { describe, it, expect } from 'vitest'
import benefitsJson from '../../public/data/benefits/2026.json'
import { runChecks, type Check } from '../../src/domain/claim-checks'
import { parseBenefits, type BenefitsDataset } from '../../src/domain/benefits-schema'
import type { Facility } from '../../src/domain/facilities-schema'
import type { Claim, ClaimType } from '../../src/domain/claim-types'
import type { DocumentRecord } from '../../src/domain/document-types'
import type { Person } from '../../src/domain/types'

const parsed = parseBenefits(benefitsJson)
if (!parsed.ok) throw new Error(parsed.error)
const BENEFITS: BenefitsDataset = { ...parsed.data, claimDeadlineDays: 365 }
const TODAY = '2026-11-26'

function claimOf(overrides: Partial<Claim> = {}): Claim {
  return {
    id: 'claim-1',
    personId: 'person-1',
    type: 'outpatient' as ClaimType,
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
    flags: {},
    totalClaimed: 0,
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
    ...overrides,
  }
}

function personOf(overrides: Partial<Person> = {}): Person {
  return {
    id: 'person-1',
    accountId: 'account-1',
    role: 'holder',
    relation: 'self',
    memberType: 'employee',
    fullName: 'Nguyen Van A',
    dateOfBirth: '1990-01-01',
    idNumber: null,
    phone: null,
    email: null,
    address: null,
    employeeCode: null,
    jobTitle: null,
    tier: 1,
    policyholderName: null,
    contractCode: null,
    cardNumber: null,
    cardValidFrom: null,
    cardValidTo: null,
    cardFrontFileId: null,
    cardBackFileId: null,
    bank: null,
    updatedAt: 1,
    deleted: 0,
    ...overrides,
  }
}

function facilityOf(overrides: Partial<Facility> = {}): Facility {
  return {
    id: 'fac-1',
    name: 'Phòng khám mẫu',
    nameEn: null,
    phone: null,
    address: 'Hà Nội',
    provinceCode: null,
    provinceName: null,
    hours: null,
    specialty: null,
    inpatient: false,
    outpatient: false,
    dental: false,
    blacklisted: false,
    network: 'pti',
    ...overrides,
  }
}

function invoiceOn(docDate: string): DocumentRecord {
  return {
    id: `inv-${docDate}`,
    personId: 'person-1',
    claimId: 'claim-1',
    category: 'invoice',
    fileIds: [],
    docDate,
    amount: 300000,
    amountSource: 'manual',
    amountConfirmed: true,
    ocrStatus: 'none',
    ocrText: null,
    ocrCandidates: [],
    lowResolution: false,
    createdAt: 1,
    updatedAt: 1,
    deleted: 0,
  }
}

function run(input: {
  claim?: Claim
  person?: Person | null
  benefits?: BenefitsDataset | null
  facility?: Facility | null
  documents?: DocumentRecord[]
  today?: string
}): Check[] {
  return runChecks({
    claim: input.claim ?? claimOf(),
    person: input.person === undefined ? personOf() : input.person,
    benefits: input.benefits === undefined ? BENEFITS : input.benefits,
    facility: input.facility ?? null,
    documents: input.documents ?? [],
    today: input.today ?? TODAY,
  })
}

const codes = (checks: Check[]) => checks.map((c) => c.code)
const find = (checks: Check[], code: string) => checks.find((c) => c.code === code)

describe('claims.check: pre-submission checks', () => {
  it('claims.check.deadline: 45 days left, deadline 10/01/2027', () => {
    const checks = run({ claim: claimOf({ treatmentDate: '2026-01-10' }) })
    const check = find(checks, 'check.deadline.remaining')
    expect(check).toEqual({ code: 'check.deadline.remaining', severity: 'info', params: { days: 45, deadline: '2027-01-10' } })
  })

  it('claims.check.deadline-passed: a deadline before today is a warning naming the deadline', () => {
    const checks = run({ claim: claimOf({ treatmentDate: '2025-10-01' }) })
    expect(find(checks, 'check.deadline.passed')).toEqual({
      code: 'check.deadline.passed',
      severity: 'warning',
      params: { deadline: '2026-10-01' },
    })
    expect(codes(checks)).not.toContain('check.deadline.remaining')
  })

  it('claims.check.invoice-date: an invoice dated after the treatment date is a warning', () => {
    const checks = run({ claim: claimOf({ treatmentDate: '2026-11-20' }), documents: [invoiceOn('2026-11-23')] })
    expect(find(checks, 'check.invoiceDate')).toEqual({ code: 'check.invoiceDate', severity: 'warning', params: {} })
  })

  it('claims.check.invoice-date: an invoice on the treatment date raises nothing', () => {
    const checks = run({ claim: claimOf({ treatmentDate: '2026-11-20' }), documents: [invoiceOn('2026-11-20')] })
    expect(codes(checks)).not.toContain('check.invoiceDate')
  })

  it('claims.check.discharge-date: the deadline counts from the discharge date and an invoice dated then raises nothing', () => {
    const claim = claimOf({
      type: 'inpatient',
      treatmentDate: '2026-11-01',
      admissionDate: '2026-11-01',
      dischargeDate: '2026-11-05',
    })
    const checks = run({ claim, documents: [invoiceOn('2026-11-05')] })
    expect(find(checks, 'check.deadline.remaining')?.params).toEqual({ days: 344, deadline: '2027-11-05' })
    expect(codes(checks)).not.toContain('check.invoiceDate')
  })

  it('claims.check.discharge-date: an invoice dated on the admission day is not the discharge date and warns', () => {
    const claim = claimOf({
      type: 'inpatient',
      treatmentDate: '2026-11-01',
      admissionDate: '2026-11-01',
      dischargeDate: '2026-11-05',
    })
    expect(codes(run({ claim, documents: [invoiceOn('2026-11-01')] }))).toContain('check.invoiceDate')
  })

  it('claims.check.child-age: a child born 2000-01-01 is 26 on 2026-03-01 and gets the age warning', () => {
    const child = personOf({ relation: 'child', role: 'dependent', memberType: 'sponsored', dateOfBirth: '2000-01-01' })
    const checks = run({ person: child, claim: claimOf({ treatmentDate: '2026-03-01' }) })
    expect(find(checks, 'check.childAge')).toEqual({ code: 'check.childAge', severity: 'warning', params: { maxAge: 25 } })
  })

  it('claims.check.child-age: a child born 2001-01-01 is 25 on 2026-03-01 and gets no warning', () => {
    const child = personOf({ relation: 'child', role: 'dependent', memberType: 'sponsored', dateOfBirth: '2001-01-01' })
    const checks = run({ person: child, claim: claimOf({ treatmentDate: '2026-03-01' }) })
    expect(codes(checks)).not.toContain('check.childAge')
  })

  it('claims.check.child-age: the age rule applies only to children', () => {
    const spouse = personOf({ relation: 'spouse', role: 'dependent', memberType: 'sponsored', dateOfBirth: '1960-01-01' })
    expect(codes(run({ person: spouse }))).not.toContain('check.childAge')
  })

  it('claims.check.card-invalid: a treatment date after cardValidTo is a warning', () => {
    const person = personOf({ cardValidTo: '2025-12-31' })
    const checks = run({ person, claim: claimOf({ treatmentDate: '2026-02-01' }) })
    expect(find(checks, 'check.cardInvalid')).toEqual({ code: 'check.cardInvalid', severity: 'warning', params: {} })
  })

  it('claims.check.card-invalid: a treatment date inside the card validity raises nothing', () => {
    const person = personOf({ cardValidFrom: '2026-01-01', cardValidTo: '2026-12-31' })
    expect(codes(run({ person, claim: claimOf({ treatmentDate: '2026-02-01' }) }))).not.toContain('check.cardInvalid')
  })

  it('claims.check.not-covered: a tier with no maternity benefit warns for a maternity claim', () => {
    const noMaternity: BenefitsDataset = {
      ...BENEFITS,
      benefits: BENEFITS.benefits.filter((b) => b.category !== 'maternity'),
    }
    const claim = claimOf({ type: 'maternity', treatmentDate: '2026-02-01', admissionDate: '2026-02-01' })
    const checks = run({ claim, benefits: noMaternity, person: personOf({ tier: 2 }) })
    expect(find(checks, 'check.notCovered')).toEqual({ code: 'check.notCovered', severity: 'warning', params: { tier: 2 } })
  })

  it('claims.check.not-covered: an outpatient claim covered by the tier raises nothing', () => {
    expect(codes(run({ claim: claimOf({ type: 'outpatient' }) }))).not.toContain('check.notCovered')
  })

  it('claims.check.blacklisted: an excluded facility warns', () => {
    const checks = run({ facility: facilityOf({ blacklisted: true }) })
    expect(find(checks, 'check.blacklisted')).toEqual({ code: 'check.blacklisted', severity: 'warning', params: {} })
  })

  it('claims.check.direct-billing-hint: an outpatient claim at a direct-billing facility gets the hint', () => {
    const checks = run({ facility: facilityOf({ outpatient: true }) })
    expect(find(checks, 'check.directBillingHint')).toEqual({
      code: 'check.directBillingHint',
      severity: 'info',
      params: { service: 'outpatient' },
    })
  })

  it('claims.check.direct-billing-hint: a facility without direct billing for the service gets no hint', () => {
    expect(codes(run({ facility: facilityOf({ dental: true }) }))).not.toContain('check.directBillingHint')
  })

  it('claims.check: never throws when data is missing and skips the checks it cannot run', () => {
    const empty = claimOf({ treatmentDate: '' })
    expect(() =>
      runChecks({ claim: empty, person: null, benefits: null, facility: null, documents: [], today: 'not-a-date' }),
    ).not.toThrow()
    expect(
      runChecks({ claim: empty, person: null, benefits: null, facility: null, documents: [], today: 'not-a-date' }),
    ).toEqual([])
  })

  it('claims.check: a claim with a dangling date in documents does not stop the other checks', () => {
    const checks = run({
      claim: claimOf({ treatmentDate: '2025-10-01' }),
      documents: [{ ...invoiceOn('bad-date'), docDate: 'bad-date' }],
    })
    expect(codes(checks)).toContain('check.deadline.passed')
    expect(codes(checks)).not.toContain('check.invoiceDate')
  })
})
