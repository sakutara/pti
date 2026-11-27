import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import { readFileSync } from 'node:fs'
import { Blob as NodeBlob } from 'node:buffer'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAccount } from '../../src/data/account-repo'
import { accountState, loadAccount } from '../../src/data/account-state'
import { resetDatasetCache } from '../../src/data/datasets'
import { startOcrQueue } from '../../src/data/ocr-queue'
import { db, newId, now } from '../../src/db/db'
import type { Claim, ClaimFlags, ClaimType } from '../../src/domain/claim-types'
import type { DocumentRecord } from '../../src/domain/document-types'
import type { Person, PersonInput } from '../../src/domain/types'
import { ClaimWizard } from '../../src/pages/ClaimWizard'
import { ChecksPanel } from '../../src/ui/ChecksPanel'
import { parseBenefits, type BenefitsDataset } from '../../src/domain/benefits-schema'
import type { Facility } from '../../src/domain/facilities-schema'
import { refreshRoute, route } from '../../src/router'
import { MISSING } from '../../src/i18n'

// fake-indexeddb keeps Node's native Blob intact but drops jsdom Blob bytes (same as documents-page.test.tsx).
vi.stubGlobal('Blob', NodeBlob)
afterAll(() => vi.unstubAllGlobals())

const { fakeDownscale, fakePdf } = vi.hoisted(() => ({
  fakeDownscale: async (file: Blob & { name?: string }) => ({
    blob: new Blob([await file.text()], { type: 'image/jpeg' }),
    width: 2000,
    height: 1500,
  }),
  fakePdf: async () => ({ pages: 1, encrypted: false, textLines: [] as string[] }),
}))

// Files are added through the real repo; only the browser-only decoders are replaced.
vi.mock('../../src/data/documents-repo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/data/documents-repo')>()
  return {
    ...actual,
    addFiles: (...args: Parameters<typeof actual.addFiles>) =>
      actual.addFiles(args[0], args[1], args[2], { downscale: fakeDownscale, readPdf: fakePdf }),
  }
})
vi.mock('../../src/data/ocr-queue', () => ({ startOcrQueue: vi.fn(async () => {}) }))

const PUBLIC = join(process.cwd(), 'public')
const TODAY = '2026-11-26'

/** The wizard loads the bundled datasets over fetch; serve them from public/ (the app precaches the same files). */
function serveFromPublic(input: string | URL | Request): Promise<Response> {
  const path = new URL(String(input), 'http://localhost').pathname
  const body = readFileSync(join(PUBLIC, path))
  return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }))
}

let holder: Person
let accountId: string

const holderInput = (): PersonInput => ({
  role: 'holder',
  relation: 'self',
  memberType: 'employee',
  fullName: 'Nguyễn Văn A',
  dateOfBirth: '1990-05-01',
  idNumber: null,
  phone: null,
  email: null,
  address: 'Số 1 Đường Lê Lợi, Quận 1',
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

function personOf(over: Partial<Person> = {}): Person {
  return {
    id: newId(),
    accountId,
    role: 'dependent',
    relation: 'spouse',
    memberType: 'sponsored',
    fullName: 'Nguyễn Thị B',
    dateOfBirth: '1992-03-03',
    idNumber: '079192000123',
    phone: null,
    email: null,
    address: 'Số 1 Đường Lê Lợi, Quận 1',
    employeeCode: null,
    jobTitle: null,
    tier: 2,
    policyholderName: null,
    contractCode: null,
    cardNumber: null,
    cardValidFrom: null,
    cardValidTo: null,
    cardFrontFileId: null,
    cardBackFileId: null,
    bank: null,
    updatedAt: now(),
    deleted: 0,
    ...over,
  }
}

function claimOf(over: Partial<Claim> = {}): Claim {
  return {
    id: newId(),
    personId: holder.id,
    type: 'outpatient',
    status: 'draft',
    treatmentDate: '2026-11-20',
    facilityId: null,
    facilityName: '',
    reason: '',
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
    updatedAt: now(),
    deleted: 0,
    ...over,
  }
}

function docOf(over: Partial<DocumentRecord> = {}): DocumentRecord {
  const t = now()
  return {
    id: newId(),
    personId: holder.id,
    claimId: null,
    category: 'invoice',
    fileIds: [],
    docDate: null,
    amount: null,
    amountSource: null,
    amountConfirmed: false,
    ocrStatus: 'none',
    ocrText: null,
    ocrCandidates: [],
    lowResolution: false,
    createdAt: t,
    updatedAt: t,
    deleted: 0,
    ...over,
  }
}

function setRoute(path: string) {
  history.replaceState(null, '', `#${path}`)
  refreshRoute()
}

async function seedClaim(over: Partial<Claim> = {}): Promise<Claim> {
  const claim = claimOf(over)
  await db.claims.put(claim)
  return claim
}

async function seedDoc(over: Partial<DocumentRecord> = {}): Promise<DocumentRecord> {
  const doc = docOf(over)
  await db.documents.put(doc)
  return doc
}

beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn(serveFromPublic))
})

beforeEach(async () => {
  resetDatasetCache()
  await Promise.all([
    db.account.clear(),
    db.persons.clear(),
    db.claims.clear(),
    db.claimEvents.clear(),
    db.documents.clear(),
    db.files.clear(),
    db.outbox.clear(),
  ])
  const created = await createAccount(db, holderInput(), TODAY)
  if (!created.ok) throw new Error('account setup failed')
  holder = created.holder
  accountId = created.account.id
  await loadAccount(db)
  vi.mocked(startOcrQueue).mockClear()
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() })
  expect(accountState.value.status).toBe('ready')
})

const button = (name: string | RegExp) => screen.getByRole('button', { name })

describe('claims.wizard.create-draft: the first two steps', () => {
  it('claims.wizard.create-draft: picking the holder and outpatient and continuing stores a draft claim', async () => {
    setRoute('/claims/new')
    render(<ClaimWizard />)

    fireEvent.click(await screen.findByRole('button', { name: /Nguyễn Văn A/ }))
    fireEvent.click(button('Tiếp'))
    fireEvent.click(await screen.findByRole('button', { name: 'Ngoại trú' }))
    fireEvent.click(button('Tiếp'))

    await waitFor(async () => {
      const rows = await db.claims.toArray()
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ status: 'draft', personId: holder.id, type: 'outpatient' })
    })
    await waitFor(() => expect(route.value.path).toMatch(/^\/claims\/[^/]+\/edit$/))
  })

  it('claims.wizard.create-draft: no draft is stored until the type is chosen', async () => {
    setRoute('/claims/new')
    render(<ClaimWizard />)

    fireEvent.click(await screen.findByRole('button', { name: /Nguyễn Văn A/ }))
    fireEvent.click(button('Tiếp'))
    await screen.findByRole('button', { name: 'Ngoại trú' })

    expect(await db.claims.count()).toBe(0)
  })

  it('claims.wizard.fields: the type step offers outpatient, dental, optical, inpatient and maternity to an employee', async () => {
    setRoute('/claims/new')
    render(<ClaimWizard />)
    fireEvent.click(await screen.findByRole('button', { name: /Nguyễn Văn A/ }))
    fireEvent.click(button('Tiếp'))

    for (const label of ['Ngoại trú', 'Răng', 'Kính mắt', 'Nội trú', 'Thai sản']) {
      expect(await screen.findByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('claims.check.optical-dependent: a dependent is not offered the optical claim type', async () => {
    const child = personOf({ relation: 'child', memberType: 'sponsored', fullName: 'Trần Văn C', dateOfBirth: '2015-01-01' })
    await db.persons.put(child)
    setRoute('/claims/new')
    render(<ClaimWizard />)
    fireEvent.click(await screen.findByRole('button', { name: /Trần Văn C/ }))
    fireEvent.click(button('Tiếp'))

    await screen.findByRole('button', { name: 'Ngoại trú' })
    expect(screen.queryByRole('button', { name: 'Kính mắt' })).toBeNull()
  })

  it('claims.wizard.accident-excluded: no accident type is offered and the PTI hotline is shown', async () => {
    setRoute('/claims/new')
    render(<ClaimWizard />)
    fireEvent.click(await screen.findByRole('button', { name: /Nguyễn Văn A/ }))
    fireEvent.click(button('Tiếp'))

    expect(await screen.findByText(/Tai nạn và tử vong không làm qua app/)).toBeInTheDocument()
    expect(screen.getByText(/1900 5454 75/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Tai nạn/ })).toBeNull()
    expect(document.body.textContent ?? '').not.toContain(MISSING)
  })
})

describe('claims.wizard.fields: treatment step and resume', () => {
  it('claims.wizard.fields: the treatment step asks reason, date, facility, diagnosis, days off and situation flags', async () => {
    const claim = await seedClaim({ wizardStep: 2 })
    setRoute(`/claims/${claim.id}/edit`)
    render(<ClaimWizard />)

    expect(await screen.findByLabelText('Lý do (ngắn gọn)')).toBeInTheDocument()
    expect(screen.getByLabelText('Ngày khám')).toBeInTheDocument()
    expect(screen.getByLabelText('Cơ sở y tế')).toBeInTheDocument()
    expect(screen.getByLabelText('Chẩn đoán')).toBeInTheDocument()
    expect(screen.getByLabelText('Số ngày nghỉ làm')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Chuyển viện' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Ngày nhập viện')).toBeNull()
  })

  it('claims.wizard.fields: inpatient asks admission and discharge dates instead of the examination date', async () => {
    const claim = await seedClaim({ type: 'inpatient', wizardStep: 2, admissionDate: '2026-11-01', treatmentDate: '2026-11-01' })
    setRoute(`/claims/${claim.id}/edit`)
    render(<ClaimWizard />)

    expect(await screen.findByLabelText('Ngày nhập viện')).toBeInTheDocument()
    expect(screen.getByLabelText('Ngày ra viện')).toBeInTheDocument()
    expect(screen.queryByLabelText('Ngày khám')).toBeNull()
  })

  it('claims.wizard.facility-manual: a typed facility not in the dataset stores a null facilityId and the typed name', async () => {
    const claim = await seedClaim({ wizardStep: 2, reason: 'Đau họng' })
    setRoute(`/claims/${claim.id}/edit`)
    render(<ClaimWizard />)

    const facility = await screen.findByLabelText('Cơ sở y tế')
    fireEvent.input(facility, { target: { value: 'Phòng khám Gia Đình Mới' } })
    fireEvent.click(button('Tiếp'))

    await waitFor(async () => {
      const stored = await db.claims.get(claim.id)
      expect(stored).toMatchObject({ facilityId: null, facilityName: 'Phòng khám Gia Đình Mới' })
    })
  })

  it('claims.wizard.facility-manual: a suggestion from the dataset stores its id and name', async () => {
    const claim = await seedClaim({ wizardStep: 2 })
    setRoute(`/claims/${claim.id}/edit`)
    render(<ClaimWizard />)

    fireEvent.input(await screen.findByLabelText('Cơ sở y tế'), { target: { value: 'Bạch Mai' } })
    const suggestions = await screen.findAllByRole('button', { name: /Bạch Mai/ })
    expect(suggestions.length).toBeLessThanOrEqual(8)
    fireEvent.click(suggestions[0])
    fireEvent.click(button('Tiếp'))

    await waitFor(async () => {
      const stored = await db.claims.get(claim.id)
      expect(stored?.facilityId).not.toBeNull()
      expect(stored?.facilityName).toContain('Bạch Mai')
    })
  })

  it('claims.wizard.resume: a draft whose treatment step is done opens at the invoices step with earlier answers', async () => {
    const claim = await seedClaim({ wizardStep: 3, reason: 'Đau họng', diagnosis: 'Viêm họng cấp' })
    setRoute(`/claims/${claim.id}/edit`)
    render(<ClaimWizard />)

    expect(await screen.findByText('Bước 4 / 6: Hóa đơn')).toBeInTheDocument()
    fireEvent.click(button('Quay lại'))
    expect(await screen.findByDisplayValue('Đau họng')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Viêm họng cấp')).toBeInTheDocument()
  })

  it('claims.wizard.offline: saving a treatment step queues a claim.upsert op in the same write', async () => {
    const claim = await seedClaim({ wizardStep: 2 })
    setRoute(`/claims/${claim.id}/edit`)
    render(<ClaimWizard />)

    fireEvent.input(await screen.findByLabelText('Lý do (ngắn gọn)'), { target: { value: 'Đau bụng' } })
    fireEvent.click(button('Tiếp'))

    await waitFor(async () => {
      const ops = await db.outbox.toArray()
      expect(ops.some((op) => op.type === 'claim.upsert' && op.entityId === claim.id)).toBe(true)
    })
    expect((await db.claims.get(claim.id))?.reason).toBe('Đau bụng')
  })

  it('claims.wizard.fields: editing a ready claim in the treatment step moves it back to draft', async () => {
    const claim = await seedClaim({ wizardStep: 2, status: 'ready', reason: 'Đau họng' })
    setRoute(`/claims/${claim.id}/edit`)
    render(<ClaimWizard />)

    fireEvent.input(await screen.findByLabelText('Lý do (ngắn gọn)'), { target: { value: 'Viêm họng' } })
    fireEvent.click(button('Tiếp'))

    await waitFor(async () => {
      expect(await db.claims.get(claim.id)).toMatchObject({ status: 'draft', reason: 'Viêm họng' })
    })
  })

  it('claims.wizard.fields: a submitted claim is read-only in the wizard', async () => {
    const claim = await seedClaim({ wizardStep: 2, status: 'submitted', reason: 'Đau họng' })
    setRoute(`/claims/${claim.id}/edit`)
    render(<ClaimWizard />)

    expect(await screen.findByText('Hồ sơ đã gửi nên không sửa được. Xem ở danh sách hồ sơ.')).toBeInTheDocument()
    expect(await screen.findByLabelText('Lý do (ngắn gọn)')).toBeDisabled()
  })

  it('claims.docs.attach: a need_info claim only accepts documents, so its treatment fields stay read-only', async () => {
    const claim = await seedClaim({ wizardStep: 2, status: 'need_info', reason: 'Đau họng' })
    setRoute(`/claims/${claim.id}/edit`)
    render(<ClaimWizard />)

    expect(await screen.findByLabelText('Lý do (ngắn gọn)')).toBeDisabled()
  })
})

describe('claims.check.deadline: pre-submission checks panel', () => {
  let benefits: BenefitsDataset

  beforeAll(async () => {
    const raw = JSON.parse(readFileSync(join(PUBLIC, 'data/benefits/2026.json'), 'utf8'))
    const parsed = parseBenefits(raw)
    if (!parsed.ok) throw new Error(parsed.error)
    benefits = parsed.data
  })

  it('claims.check.deadline: shows the days left and the deadline date', () => {
    const claim = claimOf({ treatmentDate: '2026-01-10' })
    render(
      <ChecksPanel claim={claim} person={holder} benefits={benefits} facility={null} documents={[]} today="2026-11-26" />,
    )
    expect(screen.getByText('Còn 45 ngày để nộp hồ sơ (hạn 10/01/2027)')).toBeInTheDocument()
  })

  it('claims.check.deadline-passed: shows the passed deadline date', () => {
    const claim = claimOf({ treatmentDate: '2025-10-01' })
    render(
      <ChecksPanel claim={claim} person={holder} benefits={benefits} facility={null} documents={[]} today="2026-11-26" />,
    )
    expect(screen.getByText('Đã quá hạn nộp hồ sơ vào 01/10/2026')).toBeInTheDocument()
  })

  it('claims.check.blacklisted: a blacklisted facility shows the warning', () => {
    const claim = claimOf({ facilityId: 'x', facilityName: 'Cơ sở X' })
    const facility = {
      id: 'x',
      name: 'Cơ sở X',
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
      blacklisted: true,
      network: 'pti' as const,
    }
    render(
      <ChecksPanel claim={claim} person={holder} benefits={benefits} facility={facility} documents={[]} today="2026-11-26" />,
    )
    expect(screen.getByText('PTI không chi trả chi phí khám, điều trị tại cơ sở này.')).toBeInTheDocument()
  })
})

describe('claims.check: panel messages from runChecks', () => {
  const facilityOf = (over: Partial<Facility>): Facility => ({
    id: 'fac',
    name: 'Phòng khám Y',
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
    ...over,
  })

  it('claims.check.not-covered: a tier without the maternity benefit warns with the tier and the benefit name', async () => {
    const raw = JSON.parse(readFileSync(join(PUBLIC, 'data/benefits/2026.json'), 'utf8'))
    const parsed = parseBenefits(raw)
    if (!parsed.ok) throw new Error(parsed.error)
    // The shipped data covers maternity for every member type; this copy removes it for sponsored members only.
    const withoutMaternity: BenefitsDataset = {
      ...parsed.data,
      benefits: parsed.data.benefits.map((b) =>
        b.category === 'maternity' ? { ...b, values: { ...b.values, sponsored: null } } : b,
      ),
    }
    const claim = claimOf({ type: 'maternity', treatmentDate: '2026-11-01', admissionDate: '2026-11-01' })
    render(
      <ChecksPanel
        claim={claim}
        person={personOf({ memberType: 'sponsored', tier: 2 })}
        benefits={withoutMaternity}
        facility={null}
        documents={[]}
        today="2026-11-26"
      />,
    )
    expect(screen.getByText('Hạng 2 không có quyền lợi thai sản')).toBeInTheDocument()
  })

  it('claims.check.direct-billing-hint: an outpatient claim at a direct-billing facility suggests bringing the card and ID', () => {
    const claim = claimOf({ facilityId: 'fac', facilityName: 'Phòng khám Y' })
    render(
      <ChecksPanel
        claim={claim}
        person={holder}
        benefits={null}
        facility={facilityOf({ outpatient: true })}
        documents={[]}
        today="2026-11-26"
      />,
    )
    expect(screen.getByText(/bảo lãnh viện phí ngoại trú/)).toBeInTheDocument()
    expect(screen.getByText(/mang thẻ và giấy tờ tùy thân/)).toBeInTheDocument()
  })
})

describe('claims.invoices: invoices step totals and actions', () => {
  async function openInvoices(over: Partial<Claim> = {}) {
    const claim = await seedClaim({ wizardStep: 3, ...over })
    setRoute(`/claims/${claim.id}/edit`)
    render(<ClaimWizard />)
    await screen.findByText('Bước 4 / 6: Hóa đơn')
    return claim
  }

  it('document-ocr.review.layout: an invoice opens its image large in place and keeps the wizard state', async () => {
    const claim = await openInvoices()
    await seedDoc({ claimId: claim.id, amount: 200000, amountConfirmed: false, amountSource: 'ocr', fileIds: ['file-1'] })

    const toggle = await screen.findByRole('button', { name: 'Xem ảnh lớn' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)

    expect(screen.getByRole('button', { name: 'Xem ảnh lớn' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Số tiền hóa đơn 1')).toHaveValue('200000')
    expect(route.value.path).toBe(`/claims/${claim.id}/edit`)
  })

  it('document-ocr.review.confirm: an unconfirmed proposal is labelled and its confirm button marks it confirmed', async () => {
    const claim = await openInvoices()
    const doc = await seedDoc({ claimId: claim.id, amount: 200000, amountConfirmed: false, amountSource: 'ocr' })

    expect(await screen.findByText('Cần xác nhận')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận 200.000 đ' }))

    await waitFor(async () => expect((await db.documents.get(doc.id))?.amountConfirmed).toBe(true))
  })

  it('claims.wizard.next-icon: the Tiếp button puts its chevron after the label', async () => {
    await openInvoices()
    const next = screen.getByRole('button', { name: 'Tiếp' })
    expect(next.className).toContain('flex-row-reverse')
  })

  it('claims.invoices.total: two confirmed invoices of 300000 and 450000 total 750.000 đ', async () => {
    const claim = await openInvoices()
    await seedDoc({ claimId: claim.id, amount: 300000, amountConfirmed: true, amountSource: 'manual' })
    await seedDoc({ claimId: claim.id, amount: 450000, amountConfirmed: true, amountSource: 'manual' })
    await db.claims.update(claim.id, { totalClaimed: 750000 })

    expect(await screen.findByText('750.000 đ')).toBeInTheDocument()
  })

  it('claims.invoices.unconfirmed: an OCR amount not yet confirmed is marked and kept out of the total', async () => {
    const claim = await openInvoices()
    await seedDoc({ claimId: claim.id, amount: 300000, amountConfirmed: true, amountSource: 'manual' })
    await seedDoc({ claimId: claim.id, amount: 200000, amountConfirmed: false, amountSource: 'ocr' })
    await db.claims.update(claim.id, { totalClaimed: 300000 })

    expect(await screen.findByText('Cần xác nhận')).toBeInTheDocument()
    expect(await screen.findByText('300.000 đ', { selector: '[data-total]' })).toBeInTheDocument()
  })

  it('claims.invoices.remove: removing the 450000 invoice drops the total to 300.000 đ and returns it to the library', async () => {
    const claim = await openInvoices()
    await seedDoc({ claimId: claim.id, amount: 300000, amountConfirmed: true, amountSource: 'manual' })
    const removable = await seedDoc({ claimId: claim.id, amount: 450000, amountConfirmed: true, amountSource: 'manual' })
    await db.claims.update(claim.id, { totalClaimed: 750000 })

    const row = (await screen.findByText('450.000 đ')).closest('li') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Gỡ về kho' }))

    await waitFor(async () => {
      expect((await db.documents.get(removable.id))?.claimId).toBeNull()
      expect((await db.claims.get(claim.id))?.totalClaimed).toBe(300000)
    })
    expect(await screen.findByText('300.000 đ', { selector: '[data-total]' })).toBeInTheDocument()
  })

  it('claims.invoices.pick: a library invoice is added to the claim and the total follows, other claims are not offered', async () => {
    const claim = await openInvoices()
    await seedDoc({ claimId: claim.id, amount: 300000, amountConfirmed: true, amountSource: 'manual' })
    await db.claims.update(claim.id, { totalClaimed: 300000 })
    const other = await seedClaim({ type: 'dental' })
    await seedDoc({ claimId: other.id, amount: 999000, amountConfirmed: true, amountSource: 'manual' })
    const library = await seedDoc({ claimId: null, amount: 120000, amountConfirmed: true, amountSource: 'manual' })

    fireEvent.click(button('Chọn từ kho'))
    expect(await screen.findByRole('button', { name: /120\.000 đ/ })).toBeInTheDocument()
    expect(screen.queryByText('999.000 đ')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /120\.000 đ/ }))
    fireEvent.click(button('Thêm vào hồ sơ'))

    await waitFor(async () => {
      expect((await db.documents.get(library.id))?.claimId).toBe(claim.id)
    })
    expect(await screen.findByText('420.000 đ', { selector: '[data-total]' })).toBeInTheDocument()
  })

  it('claims.invoices.total: editing a confirmed amount updates the total live', async () => {
    const claim = await openInvoices()
    const invoice = await seedDoc({ claimId: claim.id, amount: 300000, amountConfirmed: true, amountSource: 'manual' })
    await db.claims.update(claim.id, { totalClaimed: 300000 })

    const input = (await screen.findByLabelText('Số tiền hóa đơn 1')) as HTMLInputElement
    fireEvent.change(input, { target: { value: '350000' } })

    await waitFor(async () => {
      expect((await db.documents.get(invoice.id))?.amount).toBe(350000)
    })
    expect(await screen.findByText('350.000 đ', { selector: '[data-total]' })).toBeInTheDocument()
  })
})

describe('claims.docs: documents step', () => {
  async function openDocuments(over: Partial<Claim> = {}) {
    const claim = await seedClaim({ wizardStep: 4, ...over })
    setRoute(`/claims/${claim.id}/edit`)
    render(<ClaimWizard />)
    await screen.findByText(/chứng từ bắt buộc/)
    return claim
  }

  it('claims.docs.outpatient: the required list holds the prescription or medical book and the VAT invoice', async () => {
    await openDocuments()
    expect(await screen.findByText('Đơn thuốc hoặc sổ khám')).toBeInTheDocument()
    expect(screen.getByText('Hóa đơn tài chính (bản gốc hoặc hóa đơn điện tử PDF)')).toBeInTheDocument()
    expect(screen.getAllByText('Bắt buộc').length).toBeGreaterThanOrEqual(3)
  })

  it('claims.docs.public-breakdown: the itemised bill is not required at a public facility below 1000000 but is from 1000000', async () => {
    const flags: ClaimFlags = { publicFacility: true }
    await openDocuments({ flags, totalClaimed: 900000 })
    expect(screen.queryByText('Bảng kê chi tiết')).toBeNull()
  })

  it('claims.docs.public-breakdown: at 1200000 the itemised bill is listed as required', async () => {
    await openDocuments({ flags: { publicFacility: true }, totalClaimed: 1200000 })
    expect(await screen.findByText('Bảng kê chi tiết')).toBeInTheDocument()
  })

  it('claims.docs.optical: the examination record, glasses prescription and invoice are required for an employee', async () => {
    await openDocuments({ type: 'optical' as ClaimType })
    expect(await screen.findByText('Sổ khám hoặc phiếu khám có chẩn đoán')).toBeInTheDocument()
    expect(screen.getByText('Đơn kính')).toBeInTheDocument()
  })

  it('claims.docs.progress: 2 of 3 required documents met shows "2/3 chứng từ bắt buộc"', async () => {
    const claim = await openDocuments()
    await seedDoc({ claimId: claim.id, category: 'invoice', amount: 300000, amountConfirmed: true, amountSource: 'manual' })
    await seedDoc({ claimId: claim.id, category: 'prescription' })
    await db.claims.update(claim.id, { totalClaimed: 300000 })

    expect(await screen.findByText('2/3 chứng từ bắt buộc')).toBeInTheDocument()
  })

  it('claims.docs.attach: a prescription attached to the claim meets its requirement and counts in the progress', async () => {
    const claim = await openDocuments()
    await seedDoc({ claimId: claim.id, category: 'prescription' })
    expect(await screen.findByText('1/3 chứng từ bắt buộc')).toBeInTheDocument()
  })

  it('claims.docs.optional: "Không có" marks an optional requirement as not applicable', async () => {
    const claim = await openDocuments()
    fireEvent.click(await screen.findByRole('button', { name: 'Không có' }))
    await waitFor(async () => {
      expect((await db.claims.get(claim.id))?.notApplicable).toContain('outpatient.lab-result')
    })
  })

  it('claims.invoice.person-name: the invoice card opened from the claim shows the insured person of the claim', async () => {
    const dependent = personOf({ fullName: 'Nguyễn Thị B', idNumber: '079192000123', address: 'Số 9 Phố Huế' })
    await db.persons.put(dependent)
    await openDocuments({ personId: dependent.id })

    fireEvent.click(await screen.findByRole('button', { name: 'Xuất hóa đơn' }))
    expect(await screen.findByText('Nguyễn Thị B')).toBeInTheDocument()
    expect(screen.getByText('Số 9 Phố Huế')).toBeInTheDocument()
    expect(screen.getByText('079192000123')).toBeInTheDocument()
  })

  it('claims.docs.attach: a need_info claim keeps its status when a document is attached', async () => {
    const claim = await openDocuments({ status: 'need_info' })
    const doc = await seedDoc({ category: 'prescription', claimId: null })
    const row = await screen.findByRole('region', { name: 'Đơn thuốc hoặc sổ khám' })
    fireEvent.click(within(row).getByRole('button', { name: 'Chọn từ kho' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Đơn thuốc' }))
    fireEvent.click(button('Thêm vào hồ sơ'))

    await waitFor(async () => {
      expect((await db.documents.get(doc.id))?.claimId).toBe(claim.id)
    })
    expect((await db.claims.get(claim.id))?.status).toBe('need_info')
  })
})
