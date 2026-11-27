import { render, screen, within } from '@testing-library/preact'
import { describe, expect, it } from 'vitest'
import { newId, now } from '../../src/db/db'
import type { Claim, ClaimEvent } from '../../src/domain/claim-types'
import { Timeline } from '../../src/ui/Timeline'

const at = (day: number, month: number) => new Date(2026, month - 1, day, 9).getTime()

function claimOf(over: Partial<Claim> = {}): Claim {
  return {
    id: newId(),
    personId: 'person-holder',
    type: 'outpatient',
    status: 'submitted',
    treatmentDate: '2026-11-02',
    facilityId: null,
    facilityName: '',
    reason: 'Đau họng',
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
    submittedAt: null,
    bundleFileIds: [],
    wizardStep: 5,
    sentVia: 'gmail',
    gmailThreadId: null,
    lastSubmittedFileIds: [],
    updatedAt: now(),
    deleted: 0,
    ...over,
  }
}

function eventOf(claimId: string, over: Partial<ClaimEvent>): ClaimEvent {
  return { id: newId(), claimId, at: at(20, 11), status: 'ready', note: '', amount: null, updatedAt: now(), deleted: 0, ...over }
}

describe('claim-tracking.timeline', () => {
  it('claim-tracking.timeline.order: lists events oldest first with their dates and status labels', () => {
    const claim = claimOf()
    // Stored out of order on purpose: the timeline sorts by date.
    const events = [
      eventOf(claim.id, { status: 'need_info', at: at(28, 11), note: 'Thiếu đơn thuốc' }),
      eventOf(claim.id, { status: 'ready', at: at(20, 11) }),
      eventOf(claim.id, { status: 'submitted', at: at(21, 11) }),
    ]
    render(<Timeline claim={claim} events={events} />)

    const list = screen.getByRole('list', { name: 'Lịch sử' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('20/11/2026')
    expect(items[0]).toHaveTextContent('Sẵn sàng gửi')
    expect(items[1]).toHaveTextContent('21/11/2026')
    expect(items[1]).toHaveTextContent('Đã gửi')
    expect(items[2]).toHaveTextContent('28/11/2026')
    expect(items[2]).toHaveTextContent('Cần bổ sung')
    expect(items[2]).toHaveTextContent('Thiếu đơn thuốc')
  })

  it('claim-tracking.timeline.amounts: shows requested, approved and difference amounts once an outcome exists', () => {
    const claim = claimOf({ status: 'partially_approved', totalClaimed: 750000, approvedAmount: 500000, rejectionReason: 'x' })
    render(<Timeline claim={claim} events={[]} />)

    expect(screen.getByText('Yêu cầu 750.000 đ')).toBeInTheDocument()
    expect(screen.getByText('Được duyệt 500.000 đ')).toBeInTheDocument()
    expect(screen.getByText('Chênh lệch 250.000 đ')).toBeInTheDocument()
  })

  it('claim-tracking.timeline.amounts: shows only the requested amount before an outcome', () => {
    const claim = claimOf({ status: 'submitted', totalClaimed: 750000, approvedAmount: null })
    render(<Timeline claim={claim} events={[]} />)

    expect(screen.getByText('Yêu cầu 750.000 đ')).toBeInTheDocument()
    expect(screen.queryByText(/Được duyệt/)).toBeNull()
    expect(screen.queryByText(/Chênh lệch/)).toBeNull()
  })

  it('claim-tracking.timeline.order: says so when there are no events yet', () => {
    render(<Timeline claim={claimOf({ status: 'draft' })} events={[]} />)

    expect(screen.getByText('Chưa có sự kiện nào.')).toBeInTheDocument()
  })
})
