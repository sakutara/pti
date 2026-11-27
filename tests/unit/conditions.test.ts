import { describe, it, expect } from 'vitest'
import { evaluate } from '../../src/domain/conditions'
import type { Claim, ClaimFlags } from '../../src/domain/claim-types'
import type { DocumentRecord } from '../../src/domain/document-types'
import type { Condition } from '../../src/domain/requirements-schema'

function claimOf(total: number, flags: ClaimFlags = {}, type: Claim['type'] = 'outpatient'): Claim {
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

const NO_DOCS: readonly DocumentRecord[] = []

describe('claims.docs: condition evaluation', () => {
  it('claims.docs.public-breakdown: a flag condition follows the claim flags', () => {
    const flag: Condition = { flag: 'publicFacility' }
    expect(evaluate(flag, claimOf(0, { publicFacility: true }), NO_DOCS)).toBe(true)
    expect(evaluate(flag, claimOf(0), NO_DOCS)).toBe(false)
  })

  it('claims.docs.public-breakdown: totalGte is inclusive at the threshold', () => {
    const cond: Condition = { totalGte: 1000000 }
    expect(evaluate(cond, claimOf(999999), NO_DOCS)).toBe(false)
    expect(evaluate(cond, claimOf(1000000), NO_DOCS)).toBe(true)
  })

  it('claims.docs.public-breakdown: all, any and not combine conditions', () => {
    const claim = claimOf(900000, { publicFacility: true })
    const allCond: Condition = { all: [{ flag: 'publicFacility' }, { not: { totalGte: 1000000 } }] }
    const anyCond: Condition = { any: [{ flag: 'surgery' }, { totalGte: 1000000 }] }
    expect(evaluate(allCond, claim, NO_DOCS)).toBe(true)
    expect(evaluate(anyCond, claim, NO_DOCS)).toBe(false)
    expect(evaluate({ not: allCond }, claim, NO_DOCS)).toBe(false)
    expect(evaluate(anyCond, claimOf(1000000), NO_DOCS)).toBe(true)
  })

  it('claims.docs.public-breakdown: a claim with no flags has every flag false', () => {
    const flags: Condition[] = [
      { flag: 'multiDayTreatment' },
      { flag: 'surgery' },
      { flag: 'transfer' },
      { flag: 'publicFacility' },
      { flag: 'rootCanalOrExtraction' },
    ]
    for (const cond of flags) expect(evaluate(cond, claimOf(0), NO_DOCS)).toBe(false)
  })
})
