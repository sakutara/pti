import { describe, it, expect } from 'vitest'
import marshJson from '../../public/data/administrators/marsh.json'
import { parseAdministrator, type ReplyWindow } from '../../src/domain/requirements-schema'
import { workingDaysBetween, replyLimit, isOverdue, requiresOriginals, addDays } from '../../src/domain/working-days'
import type { Claim } from '../../src/domain/claim-types'

const marsh = parseAdministrator(marshJson)
if (!marsh.ok) throw new Error(marsh.error)
const WINDOWS: ReplyWindow[] = marsh.data.replyWorkingDays

/** Local noon on the given day, so the local calendar date matches the string in every time zone. */
const at = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, 12).getTime()
}

function claimOf(overrides: Partial<Claim> = {}): Claim {
  return {
    id: 'claim-1',
    personId: 'person-1',
    type: 'outpatient',
    status: 'submitted',
    treatmentDate: '2026-11-01',
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
    totalClaimed: 750000,
    approvedAmount: null,
    rejectionReason: null,
    submittedAt: at('2026-11-02'),
    bundleFileIds: [],
    wizardStep: 0,
    sentVia: 'gmail',
    gmailThreadId: null,
    lastSubmittedFileIds: [],
    updatedAt: 1,
    deleted: 0,
    ...overrides,
  }
}

describe('claim-tracking.overdue: working days', () => {
  it('claim-tracking.overdue.mark: 02/11 to 12/11/2026 is 8 working days', () => {
    expect(workingDaysBetween('2026-11-02', '2026-11-12')).toBe(8)
  })

  it('claim-tracking.overdue.mark: weekends are skipped', () => {
    expect(workingDaysBetween('2026-11-06', '2026-11-09')).toBe(1)
    expect(workingDaysBetween('2026-11-07', '2026-11-08')).toBe(0)
  })

  it('claim-tracking.overdue.mark: the start day is not counted and the end day is', () => {
    expect(workingDaysBetween('2026-11-02', '2026-11-02')).toBe(0)
    expect(workingDaysBetween('2026-11-02', '2026-11-03')).toBe(1)
    expect(workingDaysBetween('2026-11-12', '2026-11-02')).toBe(0)
  })

  it('claim-tracking.overdue: addDays moves a date across month ends', () => {
    expect(addDays('2026-10-01', 365)).toBe('2027-10-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('claim-tracking.overdue: reply limit by total', () => {
  it('claim-tracking.overdue.large: the limit changes at 20000000 and 100000000 with the boundary values', () => {
    expect(replyLimit(19999999, WINDOWS)).toBe(7)
    expect(replyLimit(20000000, WINDOWS)).toBe(15)
    expect(replyLimit(100000000, WINDOWS)).toBe(15)
    expect(replyLimit(100000001, WINDOWS)).toBe(20)
  })

  it('claim-tracking.overdue.mark: 750000 has a 7 working day limit', () => {
    expect(replyLimit(750000, WINDOWS)).toBe(7)
  })
})

describe('claim-tracking.overdue: overdue marking', () => {
  it('claim-tracking.overdue.mark: 750000 submitted on Monday 02/11 is overdue on Thursday 12/11', () => {
    expect(isOverdue(claimOf(), '2026-11-12', WINDOWS)).toBe(true)
  })

  it('claim-tracking.overdue.not-yet: 750000 submitted on Monday 02/11 is not overdue on Wednesday 11/11 (7 days)', () => {
    expect(isOverdue(claimOf(), '2026-11-11', WINDOWS)).toBe(false)
  })

  it('claim-tracking.overdue.large: 25000000 submitted on 02/11 is not overdue on 23/11 (15 days) and is on 24/11', () => {
    const big = claimOf({ totalClaimed: 25000000 })
    expect(isOverdue(big, '2026-11-23', WINDOWS)).toBe(false)
    expect(isOverdue(big, '2026-11-24', WINDOWS)).toBe(true)
  })

  it('claim-tracking.overdue.large: only a submitted claim can be overdue', () => {
    expect(isOverdue(claimOf({ status: 'need_info' }), '2026-11-30', WINDOWS)).toBe(false)
    expect(isOverdue(claimOf({ status: 'approved' }), '2026-11-30', WINDOWS)).toBe(false)
  })

  it('claim-tracking.overdue.mark: a claim without a submission date is not overdue', () => {
    expect(isOverdue(claimOf({ submittedAt: null }), '2026-12-30', WINDOWS)).toBe(false)
  })

  it('claim-tracking.overdue.originals-pending: an inpatient claim without originals is not overdue after 30 working days', () => {
    const inpatient = claimOf({ type: 'inpatient', totalClaimed: 750000, originalsSubmittedAt: null })
    expect(requiresOriginals('inpatient')).toBe(true)
    expect(isOverdue(inpatient, '2026-12-14', WINDOWS)).toBe(false)
  })

  it('claim-tracking.overdue.originals-pending: once the originals are handed in, the count starts from that day', () => {
    const inpatient = claimOf({
      type: 'inpatient',
      totalClaimed: 750000,
      originalsSubmittedAt: at('2026-11-20'),
    })
    expect(isOverdue(inpatient, '2026-12-01', WINDOWS)).toBe(false)
    expect(isOverdue(inpatient, '2026-12-02', WINDOWS)).toBe(true)
  })

  it('claim-tracking.overdue.originals-pending: email-only claim types never wait for originals', () => {
    expect(requiresOriginals('outpatient')).toBe(false)
    expect(requiresOriginals('dental')).toBe(false)
    expect(requiresOriginals('optical')).toBe(false)
  })
})
