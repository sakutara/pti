import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { useCallback, useEffect, useState } from 'preact/hooks'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer'
import { PDFDocument } from 'pdf-lib'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { accountState } from '../../src/data/account-state'
import { gmailSession } from '../../src/data/gmail-session'
import { setStatus } from '../../src/data/claims-repo'
import { readUnsavedGmailSend } from '../../src/data/send-claim'
import { sendMessage } from '../../src/lib/gmail'
import { db } from '../../src/db/db'
import type { Claim } from '../../src/domain/claim-types'
import type { DocumentRecord } from '../../src/domain/document-types'
import {
  parseAdministrator,
  parseClaimRequirements,
  type AdministratorConfig,
  type ClaimRequirements,
} from '../../src/domain/requirements-schema'
import type { Account, Person, StoredFile } from '../../src/domain/types'
import { fileSaver, mailtoOpener, SendSteps } from '../../src/ui/SendSteps'
import { OriginalsStep } from '../../src/ui/OriginalsStep'
import { StepReview } from '../../src/ui/wizard/StepReview'
import { createSyncEngine } from '../../src/sync/sync-engine'
import type { SyncAdapter } from '../../src/sync/adapters'
import type { OutboxOp } from '../../src/sync/outbox'
import { setOnline } from '../setup'

const flags = vi.hoisted(() => ({ gmailOn: false }))

vi.mock('../../src/config', () => ({ GOOGLE_CLIENT_ID: '', gmailEnabled: () => flags.gmailOn }))

// Gmail is never reached: sendMessage is a stub and setStatus passes through unless a test fails it once.
vi.mock('../../src/lib/gmail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/gmail')>()),
  sendMessage: vi.fn(),
}))

vi.mock('../../src/data/gmail-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/data/gmail-session')>()),
  accessToken: vi.fn(() => 'tok-123'),
  invalidateToken: vi.fn(),
}))

vi.mock('../../src/data/claims-repo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/data/claims-repo')>()
  return { ...actual, setStatus: vi.fn(actual.setStatus) }
})

// The form template and fonts are read from public/ instead of fetched.
vi.mock('../../src/lib/claim-form-pdf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/claim-form-pdf')>()),
  loadFormAssets: async () => formAssetsFromDisk(),
}))

// No canvas in jsdom: the encoder keeps the bytes, so only the size rule decides.
vi.mock('../../src/lib/attachments-pdf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/attachments-pdf')>()),
  browserEncodeJpeg: async (bytes: Uint8Array) => bytes,
}))

// The administrator and requirements are read from public/ through the manifest loader.
vi.mock('../../src/data/datasets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/data/datasets')>()),
  loadManifest: async () => ({
    ok: true,
    data: {
      schema: 1,
      datasets: { administrators: { files: ['data/administrators/marsh.json'], updatedAt: '', version: '' } },
    },
  }),
  loadDataset: async (path: string, parse: (json: unknown) => unknown) =>
    parse(JSON.parse(readFileSync(join(process.cwd(), 'public', path), 'utf8'))),
}))

function formAssetsFromDisk() {
  const read = (path: string) => new Uint8Array(readFileSync(join(process.cwd(), path)))
  return {
    template: read('public/forms/gyc-template.pdf'),
    layout: JSON.parse(readFileSync(join(process.cwd(), 'public/forms/gyc-fields.json'), 'utf8')),
    regularFont: read('public/fonts/NotoSans-Regular.ttf'),
    boldFont: read('public/fonts/NotoSans-Bold.ttf'),
  }
}

function unwrap<T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(String(result.error))
  return result.data
}

const REQUIREMENTS: ClaimRequirements = unwrap(
  parseClaimRequirements(JSON.parse(readFileSync(join(process.cwd(), 'public/data/claim-requirements.json'), 'utf8'))),
)
const ADMINISTRATOR: AdministratorConfig = unwrap(
  parseAdministrator(JSON.parse(readFileSync(join(process.cwd(), 'public/data/administrators/marsh.json'), 'utf8'))),
)

const HOLDER = 'person-holder'
const CLAIM = 'claim-1'
const ACCOUNT_ID = 'account-1'
const PNG = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
)

const ACCOUNT: Account = {
  id: ACCOUNT_ID,
  displayName: 'Tài khoản mẫu',
  administrator: 'marsh',
  claimEmail: null,
  claimCc: ['me@example.com'],
  defaultBank: { bankName: 'Vietcombank', accountName: 'NGUYEN VAN A', accountNumber: '0123456789' },
  onboardedAt: 1,
  updatedAt: 1,
  deleted: 0,
}

vi.stubGlobal('Blob', NodeBlob)
vi.stubGlobal('File', NodeFile)
beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:mock')
  URL.revokeObjectURL = vi.fn()
})
afterAll(() => vi.unstubAllGlobals())

function holder(overrides: Partial<Person> = {}): Person {
  return {
    id: HOLDER,
    accountId: ACCOUNT_ID,
    role: 'holder',
    relation: 'self',
    memberType: 'employee',
    fullName: 'Nguyễn Văn A',
    dateOfBirth: '1990-01-01',
    idNumber: null,
    phone: '0900000000',
    email: 'a@example.com',
    address: null,
    employeeCode: 'NV-001',
    jobTitle: 'Kỹ sư',
    tier: 1,
    policyholderName: 'Công ty Mẫu',
    contractCode: 'HD-001',
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

function claim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: CLAIM,
    personId: HOLDER,
    type: 'outpatient',
    status: 'draft',
    treatmentDate: '2026-11-20',
    facilityId: null,
    facilityName: 'Phòng khám mẫu',
    reason: 'khám ngoại trú',
    originalsSubmittedAt: null,
    daysOff: 0,
    admissionDate: null,
    dischargeDate: null,
    bank: null,
    notApplicable: [],
    diagnosis: 'Viêm họng',
    flags: {},
    totalClaimed: 450000,
    approvedAmount: null,
    rejectionReason: null,
    submittedAt: null,
    bundleFileIds: [],
    wizardStep: 5,
    sentVia: null,
    gmailThreadId: null,
    lastSubmittedFileIds: [],
    updatedAt: 1,
    deleted: 0,
    ...overrides,
  }
}

function doc(id: string, category: DocumentRecord['category'], fileIds: string[], overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id,
    personId: HOLDER,
    claimId: CLAIM,
    category,
    fileIds,
    docDate: '2026-11-20',
    amount: category === 'invoice' ? 450000 : null,
    amountSource: 'manual',
    amountConfirmed: category === 'invoice',
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

async function storePhoto(id: string, docId: string): Promise<void> {
  const file: StoredFile = {
    id,
    ownerType: 'document',
    ownerId: docId,
    kind: 'document',
    mime: 'image/png',
    blob: new NodeBlob([PNG], { type: 'image/png' }) as unknown as Blob,
    bytes: PNG.byteLength,
    sha256: 'x',
    createdAt: 1,
    updatedAt: 1,
    deleted: 0,
  }
  await db.files.put(file)
}

/** An invoice, a breakdown and a prescription: every required outpatient document. */
async function seedComplete(overrides: Partial<Claim> = {}, docOverrides: Partial<DocumentRecord> = {}) {
  await db.persons.put(holder())
  await db.claims.put(claim(overrides))
  await db.documents.bulkPut([
    doc('inv', 'invoice', ['f-inv'], docOverrides),
    doc('bd', 'invoice-breakdown', ['f-bd']),
    doc('rx', 'prescription', ['f-rx']),
  ])
  for (const id of ['f-inv', 'f-bd', 'f-rx']) await storePhoto(id, id)
}

async function pdfWithPages(pages: number): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  for (let i = 0; i < pages; i++) out.addPage()
  return out.save()
}

/** A ready claim with its two bundle files already stored. */
async function seedReadyBundle(overrides: Partial<Claim> = {}) {
  await seedComplete({ status: 'ready', ...overrides })
  const form = await pdfWithPages(1)
  const document = await pdfWithPages(3)
  const parts: Array<[string, Uint8Array]> = [
    ['bundle-form', form],
    ['bundle-doc', document],
  ]
  for (const [id, bytes] of parts) {
    const file: StoredFile = {
      id,
      ownerType: 'claim',
      ownerId: CLAIM,
      kind: 'bundle',
      mime: 'application/pdf',
      blob: new NodeBlob([bytes], { type: 'application/pdf' }) as unknown as Blob,
      bytes: bytes.byteLength,
      sha256: 'x',
      createdAt: 1,
      updatedAt: 1,
      deleted: 0,
    }
    await db.files.put(file)
  }
  await db.claims.update(CLAIM, { bundleFileIds: ['bundle-form', 'bundle-doc'] })
}

interface Snapshot {
  claim: Claim
  persons: Person[]
  documents: DocumentRecord[]
}

async function snapshot(): Promise<Snapshot> {
  return {
    claim: (await db.claims.get(CLAIM)) as Claim,
    persons: await db.persons.toArray(),
    documents: await db.documents.where('claimId').equals(CLAIM).toArray(),
  }
}

/** The review step with its data read from the database, re-read after every change like the wizard does. */
function Review({ administrator = ADMINISTRATOR }: { administrator?: AdministratorConfig }) {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const load = useCallback(() => {
    void snapshot().then(setSnap)
  }, [])
  useEffect(() => {
    load()
  }, [load])
  if (snap === null) return null
  return (
    <StepReview
      claim={snap.claim}
      account={ACCOUNT}
      administrator={administrator}
      requirements={REQUIREMENTS}
      persons={snap.persons}
      documents={snap.documents}
      onGoTo={() => {}}
      onChanged={load}
    />
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'canShare')
  Reflect.deleteProperty(navigator, 'share')
  Reflect.deleteProperty(navigator, 'clipboard')
})

async function outboxTypes(): Promise<string[]> {
  return (await db.outbox.orderBy('createdAt').toArray()).map((op) => op.type)
}

beforeEach(async () => {
  setOnline(true)
  flags.gmailOn = false
  gmailSession.value = { status: 'disconnected' }
  accountState.value = { status: 'ready', account: ACCOUNT }
  vi.spyOn(fileSaver, 'save').mockImplementation(() => {})
  vi.spyOn(mailtoOpener, 'open').mockImplementation(() => {})
  await Promise.all([
    db.claims.clear(),
    db.claimEvents.clear(),
    db.documents.clear(),
    db.persons.clear(),
    db.files.clear(),
    db.outbox.clear(),
    db.settings.clear(),
  ])
})

describe('claim-submission.ready: the review step', () => {
  it('claim-submission.ready.missing: lists the missing required document and form field and disables the build', async () => {
    await db.persons.put(holder({ employeeCode: null }))
    await db.claims.put(claim())
    await db.documents.bulkPut([doc('inv', 'invoice', ['f-inv']), doc('bd', 'invoice-breakdown', ['f-bd'])])
    render(<Review />)

    expect(await screen.findByText('Đơn thuốc hoặc sổ khám')).toBeInTheDocument()
    expect(screen.getByText('Mã số nhân viên')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dựng hai tệp PDF' })).toBeDisabled()
  })

  it('claim-submission.ready.missing: the fix for a missing employee field opens that person page', async () => {
    await db.persons.put(holder({ employeeCode: null }))
    await db.claims.put(claim())
    await db.documents.bulkPut([doc('inv', 'invoice', ['f-inv']), doc('bd', 'invoice-breakdown', ['f-bd'])])
    render(<Review />)

    fireEvent.click(await screen.findByRole('button', { name: 'Sửa: Mã số nhân viên' }))
    expect(location.hash).toBe(`#/account/person/${HOLDER}`)
  })

  it('claim-submission.ready.unconfirmed-amount: an unconfirmed invoice asks for confirmation and disables the build', async () => {
    await seedComplete({}, { amountConfirmed: false, amount: null })
    render(<Review />)

    expect(await screen.findByText('Hóa đơn chưa xác nhận số tiền')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dựng hai tệp PDF' })).toBeDisabled()
  })

  it('claim-submission.ready.complete: building stores the two bundle files and sets the claim ready with an event', async () => {
    await seedComplete()
    render(<Review />)

    const build = await screen.findByRole('button', { name: 'Dựng hai tệp PDF' })
    await waitFor(() => expect(build).toBeEnabled())
    fireEvent.click(build)

    // Building runs pdf-lib and the attachment encoder; under full-suite load it can pass the default 1 s wait.
    await waitFor(async () => expect((await db.claims.get(CLAIM))?.status).toBe('ready'), { timeout: 10_000 })
    const claimNow = (await db.claims.get(CLAIM)) as Claim
    expect(claimNow.bundleFileIds).toHaveLength(2)
    const files = await db.files.bulkGet(claimNow.bundleFileIds)
    expect(files.map((f) => f?.kind)).toEqual(['bundle', 'bundle'])
    expect(files.map((f) => f?.ownerType)).toEqual(['claim', 'claim'])
    const events = await db.claimEvents.where('claimId').equals(CLAIM).toArray()
    expect(events.map((e) => e.status)).toEqual(['ready'])
  })

  it('claim-submission.attachments.two-files: the review names the two files after the reason', async () => {
    await seedReadyBundle()
    render(<Review />)

    expect(await screen.findByText('GYC bồi thường khám ngoại trú.pdf')).toBeInTheDocument()
    expect(screen.getByText('Chứng từ khám ngoại trú.pdf')).toBeInTheDocument()
  })

  it('claim-submission.attachments.order: the attachment PDF holds one page per document in checklist order', async () => {
    await seedComplete()
    render(<Review />)
    const build = await screen.findByRole('button', { name: 'Dựng hai tệp PDF' })
    await waitFor(() => expect(build).toBeEnabled())
    fireEvent.click(build)
    await waitFor(async () => expect((await db.claims.get(CLAIM))?.status).toBe('ready'))

    const [, docFile] = await db.files.bulkGet((await db.claims.get(CLAIM))!.bundleFileIds)
    const pdf = await PDFDocument.load(new Uint8Array(await docFile!.blob.arrayBuffer()))
    expect(pdf.getPageCount()).toBe(3)
  })

  it('claim-submission.attachments.too-large: a bundle above the limit stores nothing and lists the largest documents', async () => {
    await seedComplete()
    render(<Review administrator={{ ...ADMINISTRATOR, maxAttachmentBytes: 1000 }} />)

    const build = await screen.findByRole('button', { name: 'Dựng hai tệp PDF' })
    await waitFor(() => expect(build).toBeEnabled())
    fireEvent.click(build)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('vượt giới hạn')
    expect(alert).toHaveTextContent('Hóa đơn')
    const claimNow = (await db.claims.get(CLAIM)) as Claim
    expect(claimNow.status).toBe('draft')
    expect(claimNow.bundleFileIds).toEqual([])
  })

  it('claim-submission.form.preview: the form preview opens while offline and makes no network request', async () => {
    setOnline(false)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await seedComplete()
    render(<Review />)

    fireEvent.click(await screen.findByRole('button', { name: 'Xem GYC' }))
    const link = await screen.findByRole('link', { name: 'Mở GYC đã dựng' })
    expect(link.getAttribute('href')).toBe('blob:mock')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('claim-submission.supplement.bundle: a need_info build holds only the photo added after the last submission', async () => {
    await seedComplete({ status: 'need_info', lastSubmittedFileIds: ['f-inv', 'f-bd', 'f-rx'] })
    await db.documents.put(doc('photo-new', 'prescription', ['f-new']))
    await storePhoto('f-new', 'photo-new')
    render(<Review />)

    const build = await screen.findByRole('button', { name: 'Dựng hai tệp PDF' })
    await waitFor(() => expect(build).toBeEnabled())
    fireEvent.click(build)
    await waitFor(async () => expect((await db.claims.get(CLAIM))?.bundleFileIds).toHaveLength(2))

    const [formFile, docFile] = await db.files.bulkGet((await db.claims.get(CLAIM))!.bundleFileIds)
    expect(formFile?.kind).toBe('bundle')
    const pdf = await PDFDocument.load(new Uint8Array(await docFile!.blob.arrayBuffer()))
    expect(pdf.getPageCount()).toBe(1)
    expect((await db.claims.get(CLAIM))?.status).toBe('need_info')
  })
})

describe('claim-submission.send: the mailto flow and the review actions', () => {
  it('claim-submission.email.no-recipient: without a claim email the send step explains and links to the settings', async () => {
    await seedReadyBundle()
    render(<Review administrator={{ ...ADMINISTRATOR, claimEmail: '' }} />)

    expect(await screen.findByText('Chưa có email nhận hồ sơ. Thêm email trong Cài đặt nhận hồ sơ.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mở cài đặt nhận hồ sơ' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tôi đã gửi email' })).not.toBeInTheDocument()
  })

  it('claim-submission.send.flow: saving the files, opening the email and confirming stores submitted with sentVia mailto', async () => {
    await seedReadyBundle()
    const open = vi.mocked(mailtoOpener.open)
    render(<Review />)

    fireEvent.click(await screen.findByRole('button', { name: 'Lưu hai tệp PDF' }))
    expect(fileSaver.save).toHaveBeenCalledTimes(2)
    expect(vi.mocked(fileSaver.save).mock.calls.map((c) => c[0])).toEqual([
      'GYC bồi thường khám ngoại trú.pdf',
      'Chứng từ khám ngoại trú.pdf',
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Mở email đã điền' }))
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^mailto:nhanhsbt\.mn%40pti\.com\.vn\?/))

    fireEvent.click(screen.getByRole('button', { name: 'Tôi đã gửi email' }))
    await waitFor(async () => expect((await db.claims.get(CLAIM))?.status).toBe('submitted'))
    const claimNow = (await db.claims.get(CLAIM)) as Claim
    expect(claimNow).toMatchObject({ sentVia: 'mailto' })
    expect([...claimNow.lastSubmittedFileIds].sort()).toEqual(['f-bd', 'f-inv', 'f-rx'])
    expect(typeof claimNow.submittedAt).toBe('number')
    const events = await db.claimEvents.where('claimId').equals(CLAIM).toArray()
    expect(events.map((e) => e.status)).toEqual(['submitted'])
  })

  it('claim-submission.send.not-confirmed: opening the email and leaving without confirming keeps the claim ready', async () => {
    await seedReadyBundle()
    const { unmount } = render(<Review />)

    fireEvent.click(await screen.findByRole('button', { name: 'Mở email đã điền' }))
    unmount()
    expect((await db.claims.get(CLAIM))?.status).toBe('ready')
    expect(mailtoOpener.open).toHaveBeenCalledTimes(1)
  })

  it('claim-submission.send.choose-mailto: with Gmail connected, choosing another mail app shows the three mailto steps', async () => {
    flags.gmailOn = true
    gmailSession.value = { status: 'connected', email: 'me@gmail.com', expiresAt: Date.now() + 3_600_000 }
    await seedReadyBundle()
    render(<Review />)

    expect(await screen.findByRole('button', { name: 'Gửi' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lưu hai tệp PDF' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dùng ứng dụng email khác' }))
    expect(await screen.findByRole('button', { name: 'Lưu hai tệp PDF' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gửi' })).not.toBeInTheDocument()
  })

  it('claim-submission.send.share: sharing copies the recipient and shares both files with the subject and body', async () => {
    await seedReadyBundle()
    const share = vi.fn(async () => {})
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true })
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<Review />)

    fireEvent.click(await screen.findByRole('button', { name: 'Chia sẻ' }))
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
    expect(writeText).toHaveBeenCalledWith('nhanhsbt.mn@pti.com.vn')
    const payload = share.mock.calls[0][0] as unknown as { files: File[]; title: string; text: string }
    expect(payload.files.map((f) => f.name)).toEqual(['GYC bồi thường khám ngoại trú.pdf', 'Chứng từ khám ngoại trú.pdf'])
    expect(payload.title).toContain('HS YCBT – Nguyễn Văn A')
    expect(payload.text).toContain('Kính gửi PTI')
  })

  it('claim-submission.send.no-share: without navigator.canShare for files no share action is shown', async () => {
    await seedReadyBundle()
    Reflect.deleteProperty(navigator, 'canShare')
    render(<Review />)

    await screen.findByRole('button', { name: 'Lưu hai tệp PDF' })
    expect(screen.queryByRole('button', { name: 'Chia sẻ' })).not.toBeInTheDocument()
  })

  it('claim-submission.send.offline: confirming a mailto send offline stores the status and queues a claim.upsert op', async () => {
    await seedReadyBundle()
    setOnline(false)
    render(<Review />)

    fireEvent.click(await screen.findByRole('button', { name: 'Tôi đã gửi email' }))
    await waitFor(async () => expect((await db.claims.get(CLAIM))?.status).toBe('submitted'))
    expect(await outboxTypes()).toContain('claim.upsert')
  })

  it('claim-submission.send.resync: the offline status change is flushed once the device is back online', async () => {
    await seedReadyBundle()
    setOnline(false)
    render(<Review />)
    fireEvent.click(await screen.findByRole('button', { name: 'Tôi đã gửi email' }))
    await waitFor(async () => expect((await db.claims.get(CLAIM))?.status).toBe('submitted'))

    const pushed: OutboxOp[][] = []
    const adapter: SyncAdapter = {
      name: 'test',
      async push(ops) {
        pushed.push(ops)
        return { ok: ops.map((o) => o.id), failed: [] }
      },
    }
    setOnline(true)
    await createSyncEngine(db, adapter).flush()
    expect(pushed.flat().map((op) => op.type)).toContain('claim.upsert')
    expect(await db.outbox.count()).toBe(0)
  })

  it('claim-submission.send.mailto-survives: the saved bundle is still there after leaving and coming back', async () => {
    await seedReadyBundle()
    const { unmount } = render(<Review />)
    unmount()
    render(<Review />)

    expect(await screen.findByRole('button', { name: 'Lưu hai tệp PDF' })).toBeInTheDocument()
    expect(screen.getByText('Chứng từ khám ngoại trú.pdf')).toBeInTheDocument()
  })
})

describe('claim-submission.originals: the originals step', () => {
  async function renderOriginals(type: Claim['type'], status: Claim['status'] = 'submitted') {
    await db.persons.put(holder())
    const row = claim({ type, status, treatmentDate: '2026-11-20', dischargeDate: '2026-11-25' })
    await db.claims.put(row)
    return render(<OriginalsStep claim={row} />)
  }

  it('claim-submission.originals.reminder: an inpatient claim says the originals are required and lists both addresses', async () => {
    await renderOriginals('inpatient', 'ready')

    expect(await screen.findByText(/Hồ sơ này phải nộp bản gốc/)).toBeInTheDocument()
    expect(screen.getByText(/Tầng 2, Tòa nhà Thủy Lợi 4/)).toBeInTheDocument()
    expect(screen.getByText(/Zone 2B, Tầng 2, CT1/)).toBeInTheDocument()
  })

  it('claim-submission.originals.not-needed: an outpatient claim shows no originals step', async () => {
    const { container } = await renderOriginals('outpatient')
    await waitFor(() => expect(container.textContent).toBe(''))
    expect(screen.queryByText(/Hồ sơ này phải nộp bản gốc/)).not.toBeInTheDocument()
  })

  it('claim-submission.originals.confirm: recording the originals today stores the date with an op and a timeline entry', async () => {
    await renderOriginals('inpatient', 'submitted')

    fireEvent.click(await screen.findByRole('button', { name: 'Đã nộp bản gốc hôm nay' }))
    await waitFor(async () => expect(typeof (await db.claims.get(CLAIM))?.originalsSubmittedAt).toBe('number'))
    expect(await outboxTypes()).toEqual(expect.arrayContaining(['claim.upsert', 'claimEvent.upsert']))
    const events = await db.claimEvents.where('claimId').equals(CLAIM).toArray()
    expect(events).toHaveLength(1)
    expect(events[0].note).toBe('Đã nộp bản gốc')
    expect(await screen.findByText(/Đã ghi nhận ngày nộp bản gốc/)).toBeInTheDocument()
  })
})

describe('claim-submission.send.saveFailed: the persisted double-send guard', () => {
  const connected = () => {
    flags.gmailOn = true
    gmailSession.value = { status: 'connected', email: 'me@gmail.com', expiresAt: Date.now() + 3_600_000 }
  }

  it('claim-submission.send.saveFailed: after Gmail accepted the mail but the save failed, a reload offers no send, only "mark as submitted"', async () => {
    connected()
    await seedReadyBundle()
    vi.mocked(sendMessage).mockResolvedValueOnce({ id: 'm1', threadId: 't1' })
    vi.mocked(setStatus).mockResolvedValueOnce({ ok: false, errors: { status: 'error.claimNotFound' } })
    const first = render(<Review />)
    fireEvent.click(await screen.findByRole('button', { name: 'Gửi' }))
    expect(await screen.findByText(/Email đã được gửi thành công/)).toBeInTheDocument()
    first.unmount()

    render(<Review />)
    expect(await screen.findByText('Email đã được gửi qua Gmail nhưng hồ sơ chưa được ghi nhận. Đừng gửi lại email này; bấm “Đánh dấu đã nộp” để ghi nhận.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Đánh dấu đã nộp' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gửi' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lưu hai tệp PDF' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tôi đã gửi email' })).not.toBeInTheDocument()
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect((await db.claims.get(CLAIM))?.status).toBe('ready')
  })

  it('claim-submission.send.saveFailed: the marker lives in settings with the thread id and adds no outbox op', async () => {
    connected()
    await seedReadyBundle()
    vi.mocked(sendMessage).mockResolvedValueOnce({ id: 'm1', threadId: 't1' })
    vi.mocked(setStatus).mockResolvedValueOnce({ ok: false, errors: { status: 'error.claimNotFound' } })
    const before = (await db.outbox.toArray()).length
    render(<Review />)
    fireEvent.click(await screen.findByRole('button', { name: 'Gửi' }))
    await screen.findByText(/Email đã được gửi thành công/)

    expect(await readUnsavedGmailSend(db, CLAIM)).toMatchObject({ threadId: 't1' })
    expect(await db.outbox.count()).toBe(before)
  })

  it('claim-submission.send.saveFailed: "Đánh dấu đã nộp" retries only the status write and clears the marker', async () => {
    connected()
    await seedReadyBundle()
    vi.mocked(sendMessage).mockResolvedValueOnce({ id: 'm1', threadId: 't1' })
    vi.mocked(setStatus).mockResolvedValueOnce({ ok: false, errors: { status: 'error.claimNotFound' } })
    const first = render(<Review />)
    fireEvent.click(await screen.findByRole('button', { name: 'Gửi' }))
    await screen.findByText(/Email đã được gửi thành công/)
    first.unmount()

    render(<Review />)
    fireEvent.click(await screen.findByRole('button', { name: 'Đánh dấu đã nộp' }))
    await waitFor(async () => expect((await db.claims.get(CLAIM))?.status).toBe('submitted'))
    expect(await db.claims.get(CLAIM)).toMatchObject({ sentVia: 'gmail', gmailThreadId: 't1' })
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(await readUnsavedGmailSend(db, CLAIM)).toBeNull()
  })
})
