import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { useCallback, useEffect, useState } from 'preact/hooks'
import { Blob as NodeBlob } from 'node:buffer'
import { PDFDocument } from 'pdf-lib'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/db/db'
import type { Claim } from '../../src/domain/claim-types'
import type { DocumentRecord } from '../../src/domain/document-types'
import type { Account, Person, StoredFile } from '../../src/domain/types'
import type { AdministratorConfig } from '../../src/domain/requirements-schema'
import { gmailSession } from '../../src/data/gmail-session'
import { setOnline } from '../setup'
import { setStatus } from '../../src/data/claims-repo'
import { composeClaimEmail, loadBundleFiles, threadUrl, type BundleFile } from '../../src/data/send-claim'
import { GmailConfirm } from '../../src/ui/GmailConfirm'
import { sendMessage, GmailError } from '../../src/lib/gmail'
import type { ComposedEmail } from '../../src/domain/email'
import { parseAdministrator } from '../../src/domain/requirements-schema'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('../../src/lib/gmail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/gmail')>()),
  sendMessage: vi.fn(),
}))

vi.mock('../../src/data/gmail-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/data/gmail-session')>()),
  accessToken: vi.fn(() => 'tok-123'),
  invalidateToken: vi.fn(),
}))

// The status write can be made to fail once to test the "mail was sent" branch.
vi.mock('../../src/data/claims-repo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/data/claims-repo')>()
  return { ...actual, setStatus: vi.fn(actual.setStatus) }
})

vi.stubGlobal('Blob', NodeBlob)
afterAll(() => vi.unstubAllGlobals())

const HOLDER = 'person-holder'
const CLAIM = 'claim-1'
const ACCOUNT: Account = {
  id: 'account-1',
  displayName: 'Tài khoản mẫu',
  administrator: 'marsh',
  claimEmail: null,
  claimCc: ['vietnamMMBclaims@marsh.com', 'me@example.com'],
  defaultBank: null,
  onboardedAt: 1,
  updatedAt: 1,
  deleted: 0,
}
const ADMINISTRATOR: AdministratorConfig = (() => {
  const parsed = parseAdministrator(JSON.parse(readFileSync(join(process.cwd(), 'public/data/administrators/marsh.json'), 'utf8')))
  if (!parsed.ok) throw new Error('marsh.json does not parse')
  return parsed.data
})()

function holder(): Person {
  return {
    id: HOLDER,
    accountId: 'account-1',
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
  }
}

function claim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: CLAIM,
    personId: HOLDER,
    type: 'outpatient',
    status: 'ready',
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
    bundleFileIds: ['bundle-form', 'bundle-doc'],
    wizardStep: 5,
    sentVia: null,
    gmailThreadId: null,
    lastSubmittedFileIds: [],
    updatedAt: 1,
    deleted: 0,
    ...overrides,
  }
}

function invoice(): DocumentRecord {
  return {
    id: 'inv',
    personId: HOLDER,
    claimId: CLAIM,
    category: 'invoice',
    fileIds: [],
    docDate: '2026-11-20',
    amount: 450000,
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

async function pdfWithPages(pages: number): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  for (let i = 0; i < pages; i++) out.addPage()
  return out.save()
}

async function seed(overrides: Partial<Claim> = {}) {
  await db.persons.put(holder())
  await db.claims.put(claim(overrides))
  await db.documents.put(invoice())
  const parts: Array<[string, Uint8Array]> = [
    ['bundle-form', await pdfWithPages(1)],
    ['bundle-doc', await pdfWithPages(3)],
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
}

interface Data {
  claim: Claim
  composed: ComposedEmail
  files: BundleFile[]
}

async function readData(): Promise<Data | null> {
  const row = await db.claims.get(CLAIM)
  if (row === undefined) return null
  const persons = await db.persons.toArray()
  const documents = await db.documents.where('claimId').equals(CLAIM).toArray()
  const patient = persons.find((p) => p.id === row.personId)
  if (patient === undefined) return null
  const holderRow = persons.find((p) => p.role === 'holder')
  if (holderRow === undefined) return null
  const composed = composeClaimEmail({ account: ACCOUNT, administrator: ADMINISTRATOR, claim: row, patient, holder: holderRow, documents })
  const files = await loadBundleFiles(db, row)
  if (!composed.ok || files === null) return null
  return { claim: row, composed: composed.email, files }
}

/** The confirmation with the data read the way the send step reads it. */
function Confirm({ onUseOther = () => {} }: { onUseOther?: () => void }) {
  const [data, setData] = useState<Data | null>(null)
  const load = useCallback(() => {
    void readData().then(setData)
  }, [])
  useEffect(() => {
    load()
  }, [load])
  if (data === null) return null
  return (
    <GmailConfirm
      claim={data.claim}
      composed={data.composed}
      sender="me@gmail.com"
      files={data.files}
      onChanged={load}
      onUseOther={onUseOther}
    />
  )
}

async function claimRow(): Promise<Claim> {
  return (await db.claims.get(CLAIM)) as Claim
}

beforeEach(async () => {
  setOnline(true)
  gmailSession.value = { status: 'connected', email: 'me@gmail.com', expiresAt: Date.now() + 3_600_000 }
  vi.mocked(sendMessage).mockReset()
  vi.mocked(setStatus).mockClear()
  await Promise.all([db.claims.clear(), db.claimEvents.clear(), db.documents.clear(), db.persons.clear(), db.files.clear(), db.outbox.clear(), db.settings.clear()])
})

describe('claim-submission.gmail: the confirmation before sending', () => {
  it('claim-submission.gmail.confirm: shows sender, recipient, CC, subject and both files, and sends nothing until Gửi', async () => {
    await seed()
    render(<Confirm />)

    expect(await screen.findByText(/me@gmail\.com/)).toBeInTheDocument()
    expect(screen.getByDisplayValue('HS YCBT – Nguyễn Văn A – HD-001 – Công ty Mẫu')).toBeInTheDocument()
    expect(screen.getByText('nhanhsbt.mn@pti.com.vn')).toBeInTheDocument()
    expect(screen.getByText(/vietnamMMBclaims@marsh\.com/)).toBeInTheDocument()
    expect(screen.getByText(/me@example\.com/)).toBeInTheDocument()
    expect(screen.getByText('GYC bồi thường khám ngoại trú.pdf')).toBeInTheDocument()
    expect(screen.getByText('Chứng từ khám ngoại trú.pdf')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gửi' })).toBeEnabled()
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('claim-submission.gmail.success: tapping Gửi sends one message and marks the claim submitted with its thread', async () => {
    await seed()
    vi.mocked(sendMessage).mockResolvedValueOnce({ id: 'm1', threadId: 't1' })
    render(<Confirm />)

    fireEvent.click(await screen.findByRole('button', { name: 'Gửi' }))
    await waitFor(async () => expect((await claimRow()).status).toBe('submitted'))
    expect(sendMessage).toHaveBeenCalledTimes(1)
    const [token, mime] = vi.mocked(sendMessage).mock.calls[0]
    expect(token).toBe('tok-123')
    expect(mime.byteLength).toBeGreaterThan(0)
    expect(await claimRow()).toMatchObject({ sentVia: 'gmail', gmailThreadId: 't1' })
    const events = await db.claimEvents.where('claimId').equals(CLAIM).toArray()
    expect(events.map((e) => e.status)).toEqual(['submitted'])
  })

  it('claim-submission.gmail.failure: a failed send keeps the claim ready, shows the error and offers a retry', async () => {
    await seed()
    vi.mocked(sendMessage).mockRejectedValueOnce(new GmailError(500, 'boom'))
    render(<Confirm />)

    fireEvent.click(await screen.findByRole('button', { name: 'Gửi' }))
    expect(await screen.findByText('Gmail không gửi được thư. Hồ sơ vẫn sẵn sàng, bạn có thể thử lại.')).toBeInTheDocument()
    expect((await claimRow()).status).toBe('ready')
    expect(await db.claimEvents.where('claimId').equals(CLAIM).count()).toBe(0)

    vi.mocked(sendMessage).mockResolvedValueOnce({ id: 'm2', threadId: 't2' })
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    await waitFor(async () => expect((await claimRow()).status).toBe('submitted'))
    expect(sendMessage).toHaveBeenCalledTimes(2)
  })

  it('claim-submission.gmail.offline: offline the send is disabled, and nothing is sent when the device comes back', async () => {
    await seed()
    setOnline(false)
    render(<Confirm />)

    const send = await screen.findByRole('button', { name: 'Gửi' })
    expect(send).toBeDisabled()
    expect(screen.getByText(/Đang ngoại tuyến nên chưa gửi được/)).toBeInTheDocument()

    setOnline(true)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(sendMessage).not.toHaveBeenCalled()
    expect((await claimRow()).status).toBe('ready')
  })

  it('claim-submission.send.saveFailed: when Gmail accepted the mail but the status write failed, the app says so and blocks a resend', async () => {
    await seed()
    vi.mocked(sendMessage).mockResolvedValueOnce({ id: 'm3', threadId: 't3' })
    vi.mocked(setStatus).mockResolvedValueOnce({ ok: false, errors: { status: 'error.claimNotFound' } })
    render(<Confirm />)

    fireEvent.click(await screen.findByRole('button', { name: 'Gửi' }))
    expect(
      await screen.findByText(/Email đã được gửi thành công nhưng chưa lưu được trạng thái hồ sơ/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^(Gửi|Thử lại)$/ })).not.toBeInTheDocument()
    expect(sendMessage).toHaveBeenCalledTimes(1)
  })

  it('claim-submission.gmail.open-thread: a sent claim links to its Gmail thread', async () => {
    await seed()
    vi.mocked(sendMessage).mockResolvedValueOnce({ id: 'm4', threadId: 't1' })
    render(<Confirm />)

    fireEvent.click(await screen.findByRole('button', { name: 'Gửi' }))
    const link = await screen.findByRole('link', { name: 'Mở thư trong Gmail' })
    expect(link.getAttribute('href')).toBe('https://mail.google.com/mail/u/0/#all/t1')
  })

  it('claim-submission.gmail.open-thread: threadUrl builds the Gmail thread link for a thread id', () => {
    expect(threadUrl('t1')).toBe('https://mail.google.com/mail/u/0/#all/t1')
  })

  it('claim-submission.supplement.subject: a need_info claim is sent with the [Bổ sung] subject', async () => {
    await seed({ status: 'need_info' })
    render(<Confirm />)

    const subject = await screen.findByDisplayValue(/HS YCBT – Nguyễn Văn A/)
    expect((subject as HTMLInputElement).value.startsWith('[Bổ sung] HS YCBT – ')).toBe(true)
  })
})
