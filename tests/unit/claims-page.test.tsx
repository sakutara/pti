import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi, afterAll } from 'vitest'
import { createAccount } from '../../src/data/account-repo'
import { accountState, loadAccount } from '../../src/data/account-state'
import { resetDatasetCache } from '../../src/data/datasets'
import { db, newId, now } from '../../src/db/db'
import type { Claim } from '../../src/domain/claim-types'
import type { DocumentRecord } from '../../src/domain/document-types'
import type { Person, PersonInput } from '../../src/domain/types'
import { ClaimsPage } from '../../src/pages/ClaimsPage'
import { KNOWN_PATTERNS, matchRoute, route } from '../../src/router'
import { setOnline } from '../setup'

const PUBLIC = join(process.cwd(), 'public')
const TODAY = '2026-11-26'

/** The page reads the administrator's reply times over fetch; serve them from public/ like the app does. */
function serveFromPublic(input: string | URL | Request): Promise<Response> {
  const path = new URL(String(input), 'http://localhost').pathname
  const body = readFileSync(join(PUBLIC, path))
  return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }))
}

const holderInput = (): PersonInput => ({
  role: 'holder',
  relation: 'self',
  memberType: 'employee',
  fullName: 'Nguyễn Văn A',
  dateOfBirth: '1990-05-01',
  idNumber: null,
  phone: null,
  email: null,
  address: null,
  employeeCode: 'NV-001',
  jobTitle: null,
  tier: 2,
  policyholderName: 'Công ty Mẫu',
  contractCode: 'HD-001',
  cardNumber: null,
  cardValidFrom: null,
  cardValidTo: null,
  bank: null,
})

let holder: Person

/** Local noon on the given day, so the date does not shift with the time zone. */
const at = (year: number, month: number, day: number) => new Date(year, month - 1, day, 12).getTime()

function claimOf(over: Partial<Claim> = {}): Claim {
  return {
    id: newId(),
    personId: holder.id,
    type: 'outpatient',
    status: 'draft',
    treatmentDate: '2026-11-20',
    facilityId: null,
    facilityName: 'Bệnh viện Mẫu',
    reason: 'Đau họng',
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
    wizardStep: 5,
    sentVia: null,
    gmailThreadId: null,
    lastSubmittedFileIds: [],
    updatedAt: now(),
    deleted: 0,
    ...over,
  }
}

async function seed() {
  await db.transaction('rw', db.account, db.persons, db.claims, db.claimEvents, db.documents, db.outbox, async () => {
    await db.account.clear()
    await db.persons.clear()
    await db.claims.clear()
    await db.claimEvents.clear()
    await db.documents.clear()
    await db.outbox.clear()
  })
  const created = await createAccount(db, holderInput(), TODAY)
  if (!created.ok) throw new Error('seed failed')
  holder = created.holder
  await loadAccount(db)
}

function openDetail(id: string) {
  route.value = { path: `/claims/${id}`, params: { id }, query: {} }
}

beforeEach(async () => {
  setOnline(true)
  resetDatasetCache()
  vi.stubGlobal('fetch', vi.fn(serveFromPublic))
  route.value = { path: '/claims', params: {}, query: {} }
  await seed()
})

afterAll(() => vi.unstubAllGlobals())

describe('claims.list', () => {
  it('claims.list.filter: "Đang xử lý" lists only the submitted and need_info claims', async () => {
    await db.claims.bulkPut([
      claimOf({ status: 'draft', treatmentDate: '2026-11-21' }),
      claimOf({ status: 'submitted', treatmentDate: '2026-11-02', totalClaimed: 750000, submittedAt: at(2026, 11, 2) }),
      claimOf({ status: 'need_info', treatmentDate: '2026-10-30', totalClaimed: 300000, submittedAt: at(2026, 10, 30) }),
      claimOf({ status: 'paid', treatmentDate: '2026-09-10', totalClaimed: 400000, approvedAmount: 400000 }),
    ])
    render(<ClaimsPage today={TODAY} />)
    await screen.findByRole('link', { name: /Đã chi trả/ })

    fireEvent.click(screen.getByRole('button', { name: 'Đang xử lý' }))

    await waitFor(() => expect(screen.queryByRole('link', { name: /Đã chi trả/ })).toBeNull())
    expect(screen.queryByRole('link', { name: /Đang soạn/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Đã gửi/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Cần bổ sung/ })).toBeInTheDocument()
  })

  it('claims.list.filter-toggle: status chips are text toggles with aria-pressed, no icon, and a pressed style', async () => {
    render(<ClaimsPage today={TODAY} />)
    const all = await screen.findByRole('button', { name: 'Tất cả' })
    const drafting = screen.getByRole('button', { name: 'Đang soạn' })
    expect(all).toHaveAttribute('aria-pressed', 'true')
    expect(drafting).toHaveAttribute('aria-pressed', 'false')
    expect(drafting.querySelector('svg')).toBeNull()
    expect(drafting.className).toContain('aria-pressed:bg-accent')

    fireEvent.click(drafting)

    expect(drafting).toHaveAttribute('aria-pressed', 'true')
    expect(all).toHaveAttribute('aria-pressed', 'false')
  })

  it('claims.list.delete-draft: deleting a draft after confirmation soft-deletes it and returns its documents', async () => {
    const draft = claimOf({ status: 'draft' })
    await db.claims.put(draft)
    const doc: DocumentRecord = {
      id: newId(),
      personId: holder.id,
      claimId: draft.id,
      category: 'prescription',
      fileIds: [],
      docDate: null,
      amount: null,
      amountSource: null,
      amountConfirmed: false,
      ocrStatus: 'none',
      ocrText: null,
      ocrCandidates: [],
      lowResolution: false,
      createdAt: now(),
      updatedAt: now(),
      deleted: 0,
    }
    await db.documents.put(doc)
    openDetail(draft.id)
    render(<ClaimsPage today={TODAY} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Xóa hồ sơ nháp' }))
    expect(screen.getByText('Xóa hồ sơ nháp này? Chứng từ sẽ trở về kho.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Xóa hồ sơ' }))

    await vi.waitFor(async () => {
      const row = await db.claims.get(draft.id)
      expect(row?.deleted).toBe(1)
    })
    const returned = await db.documents.get(doc.id)
    expect(returned?.claimId).toBeNull()
    const ops = await db.outbox.toArray()
    expect(ops.map((op) => op.type)).toEqual(expect.arrayContaining(['claim.delete', 'document.upsert']))
  })

  it('claims.list.no-delete-submitted: a submitted claim offers no delete action', async () => {
    const sent = claimOf({ status: 'submitted', totalClaimed: 750000, submittedAt: at(2026, 11, 2) })
    await db.claims.put(sent)
    openDetail(sent.id)
    render(<ClaimsPage today={TODAY} />)

    await screen.findByRole('heading', { name: 'Ngoại trú' })
    expect(screen.queryByRole('button', { name: 'Xóa hồ sơ nháp' })).toBeNull()
  })

  it('claim-tracking.overdue.mark: a submitted claim past its reply time is marked in the list', async () => {
    await db.claims.put(claimOf({ status: 'submitted', totalClaimed: 750000, submittedAt: at(2026, 11, 2) }))
    render(<ClaimsPage today="2026-11-12" />)

    expect(await screen.findByText('Quá thời hạn phản hồi 7 ngày làm việc')).toBeInTheDocument()
  })

  it('claim-tracking.overdue.mark: a claim within its reply time is not marked', async () => {
    await db.claims.put(claimOf({ status: 'submitted', totalClaimed: 750000, submittedAt: at(2026, 11, 2) }))
    render(<ClaimsPage today="2026-11-11" />)

    await screen.findByRole('link', { name: /Đã gửi/ })
    expect(screen.queryByText(/Quá thời hạn phản hồi/)).toBeNull()
  })

  it('claims.wizard.create-draft: /claims/new and /claims/:id/edit match before /claims/:id', () => {
    expect(matchRoute('/claims/new', KNOWN_PATTERNS)?.pattern).toBe('/claims/new')
    expect(matchRoute('/claims/c-1/edit', KNOWN_PATTERNS)?.pattern).toBe('/claims/:id/edit')
    expect(matchRoute('/claims/c-1', KNOWN_PATTERNS)).toEqual({ pattern: '/claims/:id', params: { id: 'c-1' } })
  })
})

describe('claim-tracking.status', () => {
  it('claim-tracking.status.partial: records a partial outcome with amount, reason and an event', async () => {
    const sent = claimOf({ status: 'submitted', totalClaimed: 750000, submittedAt: at(2026, 11, 2) })
    await db.claims.put(sent)
    openDetail(sent.id)
    render(<ClaimsPage today={TODAY} />)

    fireEvent.change(await screen.findByRole('combobox', { name: 'Kết quả' }), {
      target: { value: 'partially_approved' },
    })
    fireEvent.input(screen.getByRole('textbox', { name: 'Số tiền được duyệt' }), { target: { value: '500000' } })
    fireEvent.input(screen.getByRole('textbox', { name: 'Lý do' }), {
      target: { value: 'Thuốc bổ không được chi trả' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))

    await vi.waitFor(async () => {
      const row = await db.claims.get(sent.id)
      expect(row?.status).toBe('partially_approved')
    })
    const row = await db.claims.get(sent.id)
    expect(row?.approvedAmount).toBe(500000)
    expect(row?.rejectionReason).toBe('Thuốc bổ không được chi trả')
    const events = await db.claimEvents.where('claimId').equals(sent.id).toArray()
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('partially_approved')
  })

  it('claim-tracking.status.partial: accepts an approved amount of 0 and refuses a number that is not whole', async () => {
    const sent = claimOf({ status: 'submitted', totalClaimed: 750000, submittedAt: at(2026, 11, 2) })
    await db.claims.put(sent)
    openDetail(sent.id)
    render(<ClaimsPage today={TODAY} />)

    fireEvent.change(await screen.findByRole('combobox', { name: 'Kết quả' }), { target: { value: 'approved' } })
    fireEvent.input(screen.getByRole('textbox', { name: 'Số tiền được duyệt' }), { target: { value: '1,5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    expect(await screen.findByText('Số tiền phải là số nguyên từ 0 trở lên.')).toBeInTheDocument()
    expect((await db.claims.get(sent.id))?.status).toBe('submitted')

    fireEvent.input(screen.getByRole('textbox', { name: 'Số tiền được duyệt' }), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))

    await vi.waitFor(async () => {
      expect((await db.claims.get(sent.id))?.status).toBe('approved')
    })
    expect((await db.claims.get(sent.id))?.approvedAmount).toBe(0)
  })

  it('claim-tracking.status.amount-too-high: an approved amount above the total is refused and nothing is saved', async () => {
    const sent = claimOf({ status: 'submitted', totalClaimed: 750000, submittedAt: at(2026, 11, 2) })
    await db.claims.put(sent)
    openDetail(sent.id)
    render(<ClaimsPage today={TODAY} />)

    fireEvent.change(await screen.findByRole('combobox', { name: 'Kết quả' }), { target: { value: 'approved' } })
    fireEvent.input(screen.getByRole('textbox', { name: 'Số tiền được duyệt' }), { target: { value: '800000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Số tiền được duyệt không được lớn hơn tổng yêu cầu.',
    )
    const row = await db.claims.get(sent.id)
    expect(row?.status).toBe('submitted')
    expect(await db.claimEvents.where('claimId').equals(sent.id).count()).toBe(0)
  })

  it('claim-tracking.status.invalid-transition: a paid claim offers no status change', async () => {
    const paid = claimOf({ status: 'paid', totalClaimed: 400000, approvedAmount: 400000 })
    await db.claims.put(paid)
    openDetail(paid.id)
    render(<ClaimsPage today={TODAY} />)

    expect(await screen.findByText('Hồ sơ này không còn chuyển trạng thái nào.')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Kết quả' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Lưu kết quả' })).toBeNull()
  })

  it('claim-tracking.status.invalid-transition: a submitted claim only offers the reply statuses', async () => {
    const sent = claimOf({ status: 'submitted', totalClaimed: 750000, submittedAt: at(2026, 11, 2) })
    await db.claims.put(sent)
    openDetail(sent.id)
    render(<ClaimsPage today={TODAY} />)

    const select = await screen.findByRole('combobox', { name: 'Kết quả' })
    const options = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(options).toEqual(['Cần bổ sung', 'Được duyệt', 'Duyệt một phần', 'Từ chối'])
  })

  it('claim-tracking.status.offline: an outcome recorded offline is stored with its outbox ops', async () => {
    setOnline(false)
    const sent = claimOf({ status: 'submitted', totalClaimed: 750000, submittedAt: at(2026, 11, 2) })
    await db.claims.put(sent)
    openDetail(sent.id)
    render(<ClaimsPage today={TODAY} />)

    fireEvent.change(await screen.findByRole('combobox', { name: 'Kết quả' }), { target: { value: 'rejected' } })
    fireEvent.input(screen.getByRole('textbox', { name: 'Lý do' }), { target: { value: 'Hết hạn' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))

    await vi.waitFor(async () => {
      expect((await db.claims.get(sent.id))?.status).toBe('rejected')
    })
    const ops = await db.outbox.toArray()
    expect(ops.map((op) => op.type)).toEqual(expect.arrayContaining(['claim.upsert', 'claimEvent.upsert']))
  })
})

describe('claim-submission.gmail.open-thread', () => {
  it('claim-submission.gmail.open-thread: a claim sent by Gmail links to its thread', async () => {
    const sent = claimOf({
      status: 'submitted',
      totalClaimed: 750000,
      submittedAt: at(2026, 11, 2),
      sentVia: 'gmail',
      gmailThreadId: 't1',
    })
    await db.claims.put(sent)
    openDetail(sent.id)
    render(<ClaimsPage today={TODAY} />)

    expect(await screen.findByRole('link', { name: 'Mở thư trong Gmail' })).toHaveAttribute(
      'href',
      'https://mail.google.com/mail/u/0/#all/t1',
    )
  })

  it('claim-submission.gmail.open-thread: the thread id is encoded in the link', async () => {
    const sent = claimOf({ status: 'submitted', totalClaimed: 750000, submittedAt: at(2026, 11, 2), gmailThreadId: 'a/b c' })
    await db.claims.put(sent)
    openDetail(sent.id)
    render(<ClaimsPage today={TODAY} />)

    expect(await screen.findByRole('link', { name: 'Mở thư trong Gmail' })).toHaveAttribute(
      'href',
      'https://mail.google.com/mail/u/0/#all/a%2Fb%20c',
    )
  })

  it('claim-submission.gmail.open-thread: a claim without a thread shows no Gmail link', async () => {
    const sent = claimOf({ status: 'submitted', totalClaimed: 750000, submittedAt: at(2026, 11, 2), sentVia: 'mailto' })
    await db.claims.put(sent)
    openDetail(sent.id)
    render(<ClaimsPage today={TODAY} />)

    await screen.findByRole('heading', { name: 'Ngoại trú' })
    expect(screen.queryByRole('link', { name: 'Mở thư trong Gmail' })).toBeNull()
  })
})

describe('claims.wizard.resume', () => {
  it('claims.wizard.resume: a draft detail links to continue editing at #/claims/:id/edit', async () => {
    const draft = claimOf({ status: 'draft' })
    await db.claims.put(draft)
    openDetail(draft.id)
    render(<ClaimsPage today={TODAY} />)

    expect(await screen.findByRole('link', { name: 'Tiếp tục soạn' })).toHaveAttribute('href', `#/claims/${draft.id}/edit`)
  })

  it('claims.wizard.resume: a need_info claim links to add documents and resend', async () => {
    const needInfo = claimOf({ status: 'need_info', totalClaimed: 300000, submittedAt: at(2026, 10, 30) })
    await db.claims.put(needInfo)
    openDetail(needInfo.id)
    render(<ClaimsPage today={TODAY} />)

    expect(await screen.findByRole('link', { name: 'Bổ sung chứng từ và gửi lại' })).toHaveAttribute(
      'href',
      `#/claims/${needInfo.id}/edit`,
    )
  })
})

describe('claim-submission.originals: the detail page', () => {
  it('claim-submission.originals.reminder: a submitted inpatient claim shows the originals step on its detail', async () => {
    const inpatient = claimOf({ type: 'inpatient', status: 'submitted', totalClaimed: 750000, submittedAt: at(2026, 11, 2), admissionDate: '2026-11-01', dischargeDate: '2026-11-02' })
    await db.claims.put(inpatient)
    openDetail(inpatient.id)
    render(<ClaimsPage today={TODAY} />)

    expect(await screen.findByRole('heading', { name: 'Nộp bản gốc' })).toBeInTheDocument()
    expect(screen.getByText(/Tầng 2, Tòa nhà Thủy Lợi 4/)).toBeInTheDocument()
  })

  it('claim-submission.originals.not-needed: a submitted outpatient claim shows no originals step on its detail', async () => {
    const outpatient = claimOf({ status: 'submitted', totalClaimed: 750000, submittedAt: at(2026, 11, 2) })
    await db.claims.put(outpatient)
    openDetail(outpatient.id)
    render(<ClaimsPage today={TODAY} />)

    await screen.findByRole('heading', { name: 'Ngoại trú' })
    expect(screen.queryByText(/Tầng 2, Tòa nhà Thủy Lợi 4/)).toBeNull()
  })
})
