import { describe, it, expect } from 'vitest'
import { CLAIM_STATUSES, type ClaimStatus } from '../../src/domain/claim-types'
import { canTransition, validateOutcome } from '../../src/domain/claim-status'

const ALLOWED: Array<[ClaimStatus, ClaimStatus]> = [
  ['draft', 'ready'],
  ['ready', 'submitted'],
  ['ready', 'draft'],
  ['submitted', 'need_info'],
  ['submitted', 'approved'],
  ['submitted', 'partially_approved'],
  ['submitted', 'rejected'],
  ['need_info', 'submitted'],
  ['need_info', 'rejected'],
  ['approved', 'paid'],
  ['partially_approved', 'paid'],
]

describe('claim-tracking.status: allowed transitions', () => {
  it('claim-tracking.status.partial: submitted may become partially_approved', () => {
    expect(canTransition('submitted', 'partially_approved')).toBe(true)
  })

  it('claim-tracking.status.invalid-transition: a paid claim allows no change at all', () => {
    for (const to of CLAIM_STATUSES) expect(canTransition('paid', to)).toBe(false)
  })

  it('claim-tracking.status.invalid-transition: rejected is final', () => {
    for (const to of CLAIM_STATUSES) expect(canTransition('rejected', to)).toBe(false)
  })

  it('claim-tracking.status.invalid-transition: a draft cannot skip ready and go straight to submitted', () => {
    expect(canTransition('draft', 'submitted')).toBe(false)
  })

  it('claim-submission.supplement.subject: need_info may return to submitted (resubmission)', () => {
    expect(canTransition('need_info', 'submitted')).toBe(true)
  })

  it('claim-tracking.status.invalid-transition: the table allows exactly the listed transitions', () => {
    const allowed = new Set(ALLOWED.map(([from, to]) => `${from}>${to}`))
    for (const from of CLAIM_STATUSES) {
      for (const to of CLAIM_STATUSES) {
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(allowed.has(`${from}>${to}`))
      }
    }
  })
})

describe('claims.wizard.fields: editing a ready claim', () => {
  it('claims.wizard.fields: a ready claim edited in the wizard goes back to draft', () => {
    expect(canTransition('ready', 'draft')).toBe(true)
  })

  it('claims.wizard.fields: a submitted claim cannot be reopened as draft', () => {
    expect(canTransition('submitted', 'draft')).toBe(false)
  })
})

describe('claim-tracking.status: outcome validation', () => {
  it('claim-tracking.status.partial: partially approved with an amount within the total and a reason is valid', () => {
    expect(validateOutcome('partially_approved', 500000, 750000, 'Thuốc bổ không được chi trả')).toBeNull()
  })

  it('claim-tracking.status.amount-too-high: approved above the total is refused on approvedAmount', () => {
    expect(validateOutcome('approved', 800000, 750000, null)).toEqual({
      field: 'approvedAmount',
      code: 'error.amountTooHigh',
    })
  })

  it('claim-tracking.status.amount-too-high: an amount equal to the total is allowed', () => {
    expect(validateOutcome('approved', 750000, 750000, null)).toBeNull()
  })

  it('claim-tracking.status.partial: approved and partially approved need an amount', () => {
    expect(validateOutcome('approved', null, 750000, null)).toEqual({ field: 'approvedAmount', code: 'error.amountRequired' })
    expect(validateOutcome('partially_approved', null, 750000, 'Lý do')).toEqual({
      field: 'approvedAmount',
      code: 'error.amountRequired',
    })
  })

  it('claim-tracking.status.partial: an amount must be a whole number of at least 0', () => {
    expect(validateOutcome('approved', -1, 750000, null)).toEqual({ field: 'approvedAmount', code: 'error.amountInvalid' })
    expect(validateOutcome('approved', 1.5, 750000, null)).toEqual({ field: 'approvedAmount', code: 'error.amountInvalid' })
    expect(validateOutcome('approved', 0, 750000, null)).toBeNull()
  })

  it('claim-tracking.status.partial: partially approved and rejected need a reason', () => {
    expect(validateOutcome('partially_approved', 500000, 750000, '   ')).toEqual({
      field: 'rejectionReason',
      code: 'error.reasonRequired',
    })
    expect(validateOutcome('rejected', null, 750000, null)).toEqual({ field: 'rejectionReason', code: 'error.reasonRequired' })
    expect(validateOutcome('rejected', null, 750000, 'Ngoài phạm vi')).toBeNull()
  })

  it('claim-tracking.status.partial: approved needs no reason', () => {
    expect(validateOutcome('approved', 750000, 750000, null)).toBeNull()
  })

  it('claim-tracking.status.partial: statuses without an outcome are not checked', () => {
    expect(validateOutcome('submitted', null, 0, null)).toBeNull()
    expect(validateOutcome('need_info', null, 0, null)).toBeNull()
    expect(validateOutcome('paid', null, 0, null)).toBeNull()
  })
})
