import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import Dexie from 'dexie'
import { AppDB } from '../../src/db/db'
import type { Claim, ClaimStatus } from '../../src/domain/claim-types'
import type { DocumentRecord } from '../../src/domain/document-types'
import type { Person } from '../../src/domain/types'
import { listClaimEvents } from '../../src/data/claims-repo'
import { readUnsavedGmailSend, sendClaimByGmail } from '../../src/data/send-claim'
import { sendMessage, GmailError, TokenExpiredError } from '../../src/lib/gmail'
import { accessToken, gmailSession, invalidateToken } from '../../src/data/gmail-session'
import { setOnline } from '../setup'

vi.mock('../../src/data/gmail-session', () => ({
  gmailSession: { value: { status: 'disconnected' } },
  accessToken: vi.fn(() => null),
  invalidateToken: vi.fn(),
}))

vi.mock('../../src/lib/gmail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/gmail')>()),
  sendMessage: vi.fn(),
}))

const TODAY_MS = 1
const HOLDER = 'person-holder'
const CLAIM = 'claim-1'

const opened: AppDB[] = []
const names: string[] = []

function freshDb() {
  const name = 't-' + crypto.randomUUID()
  names.push(name)
  const db = new AppDB(name)
  opened.push(db)
  return db
}

afterEach(async () => {
  for (const db of opened.splice(0)) db.close()
  for (const name of names.splice(0)) await Dexie.delete(name)
  vi.clearAllMocks()
})

beforeEach(() => {
  setOnline(true)
  vi.mocked(accessToken).mockReturnValue('tok-123')
  gmailSession.value = { status: 'connected', email: 'me@gmail.com', expiresAt: Date.now() + 3600_000 }
})

function person(): Person {
  return {
    id: HOLDER,
    accountId: 'account-1',
    role: 'holder',
    relation: 'self',
    memberType: 'employee',
    fullName: 'Nguyễn Văn A',
    dateOfBirth: '1990-01-01',
    idNumber: null,
    phone: null,
    email: null,
    address: null,
    employeeCode: 'NV-001',
    jobTitle: null,
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

function claim(status: ClaimStatus): Claim {
  return {
    id: CLAIM,
    personId: HOLDER,
    type: 'outpatient',
    status,
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
    diagnosis: null,
    flags: {},
    totalClaimed: 300000,
    approvedAmount: null,
    rejectionReason: null,
    submittedAt: null,
    bundleFileIds: [],
    wizardStep: 5,
    sentVia: null,
    gmailThreadId: null,
    lastSubmittedFileIds: [],
    updatedAt: TODAY_MS,
    deleted: 0,
  }
}

function photo(id: string): DocumentRecord {
  return {
    id,
    personId: HOLDER,
    claimId: CLAIM,
    category: 'prescription',
    fileIds: [`${id}-file`],
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
  }
}

async function seed(db: AppDB, status: ClaimStatus = 'ready') {
  await db.persons.put(person())
  await db.claims.put(claim(status))
  await db.documents.put(photo('photo-1'))
  await db.documents.put(photo('photo-2'))
  await db.outbox.clear()
}

function emailInput() {
  return {
    to: 'nhanhsbt.mn@pti.com.vn',
    cc: ['vietnamMMBclaims@marsh.com'],
    subject: 'HS YCBT – Nguyễn Văn A – HD-001 – Công ty Mẫu',
    body: 'Kính gửi PTI,',
    files: [
      { name: 'GYC bồi thường khám ngoại trú.pdf', bytes: new Uint8Array([37, 80, 68, 70]), mime: 'application/pdf' },
      { name: 'Chứng từ khám ngoại trú.pdf', bytes: new Uint8Array([37, 80, 68, 70]), mime: 'application/pdf' },
    ],
  }
}

async function outboxTypes(db: AppDB): Promise<string[]> {
  return (await db.outbox.orderBy('createdAt').toArray()).map((op) => op.type)
}

describe('claim-submission.gmail.success: sending by Gmail', () => {
  it('claim-submission.gmail.success: a successful send sets submitted with sentVia gmail, the thread id and an event', async () => {
    const db = freshDb()
    await seed(db)
    vi.mocked(sendMessage).mockResolvedValue({ id: 'm1', threadId: 't1' })

    const before = Date.now()
    const result = await sendClaimByGmail(db, CLAIM, emailInput())
    expect(result.ok).toBe(true)

    const saved = await db.claims.get(CLAIM)
    expect(saved).toMatchObject({ status: 'submitted', sentVia: 'gmail', gmailThreadId: 't1' })
    expect(saved?.submittedAt).toBeGreaterThanOrEqual(before)
    expect(saved?.lastSubmittedFileIds).toEqual(['photo-1-file', 'photo-2-file'])

    const events = await listClaimEvents(db, CLAIM)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ claimId: CLAIM, status: 'submitted' })
    expect(await outboxTypes(db)).toEqual(expect.arrayContaining(['claim.upsert', 'claimEvent.upsert']))
  })

  it('claim-submission.gmail.success: the message is sent once with the bearer token and carries the signed-in sender and the recipients', async () => {
    const db = freshDb()
    await seed(db)
    vi.mocked(sendMessage).mockResolvedValue({ id: 'm1', threadId: 't1' })

    await sendClaimByGmail(db, CLAIM, emailInput())

    expect(sendMessage).toHaveBeenCalledTimes(1)
    const [token, mime] = vi.mocked(sendMessage).mock.calls[0]
    expect(token).toBe('tok-123')
    const text = new TextDecoder().decode(mime)
    expect(text).toContain('From: me@gmail.com')
    expect(text).toContain('To: nhanhsbt.mn@pti.com.vn')
    expect(text).toContain('Cc: vietnamMMBclaims@marsh.com')
  })

  it('claim-submission.supplement.subject: a need_info claim can be resubmitted and becomes submitted again', async () => {
    const db = freshDb()
    await seed(db, 'need_info')
    vi.mocked(sendMessage).mockResolvedValue({ id: 'm2', threadId: 't2' })

    const result = await sendClaimByGmail(db, CLAIM, emailInput())
    expect(result.ok).toBe(true)
    expect(await db.claims.get(CLAIM)).toMatchObject({ status: 'submitted', gmailThreadId: 't2' })
  })
})

describe('claim-submission.gmail.failure: failed sends keep the claim ready', () => {
  it('claim-submission.gmail.failure: a Gmail error leaves the claim ready with no event and reports the status', async () => {
    const db = freshDb()
    await seed(db)
    vi.mocked(sendMessage).mockRejectedValue(new GmailError(500, 'Gmail answered 500'))

    const result = await sendClaimByGmail(db, CLAIM, emailInput())
    expect(result).toEqual({ ok: false, error: 'send.failed', status: 500 })
    expect(await db.claims.get(CLAIM)).toMatchObject({ status: 'ready', sentVia: null, gmailThreadId: null })
    expect(await listClaimEvents(db, CLAIM)).toEqual([])
  })

  it('claim-submission.gmail.failure: an expired token is dropped and the claim stays ready', async () => {
    const db = freshDb()
    await seed(db)
    vi.mocked(sendMessage).mockRejectedValue(new TokenExpiredError())

    const result = await sendClaimByGmail(db, CLAIM, emailInput())
    expect(result).toEqual({ ok: false, error: 'send.tokenExpired' })
    expect(invalidateToken).toHaveBeenCalledTimes(1)
    expect((await db.claims.get(CLAIM))?.status).toBe('ready')
  })

  it('claim-submission.gmail.failure: after a failure the user can try again', async () => {
    const db = freshDb()
    await seed(db)
    vi.mocked(sendMessage)
      .mockRejectedValueOnce(new GmailError(0, 'network error while sending'))
      .mockResolvedValueOnce({ id: 'm3', threadId: 't3' })

    expect((await sendClaimByGmail(db, CLAIM, emailInput())).ok).toBe(false)
    expect((await sendClaimByGmail(db, CLAIM, emailInput())).ok).toBe(true)
    expect(sendMessage).toHaveBeenCalledTimes(2)
  })
})

describe('claim-submission.send.saveFailed: the device guard', () => {
  it('claim-submission.send.saveFailed: after a failed status write a second send is refused and no mail is sent', async () => {
    const db = freshDb()
    await seed(db)
    vi.mocked(sendMessage).mockResolvedValue({ id: 'm5', threadId: 't5' })
    vi.spyOn(db.claims, 'put').mockRejectedValueOnce(new Error('disk full'))

    const first = await sendClaimByGmail(db, CLAIM, emailInput())
    expect(first).toEqual({ ok: false, error: 'send.saveFailed', threadId: 't5' })
    expect(await readUnsavedGmailSend(db, CLAIM)).toMatchObject({ threadId: 't5' })

    const second = await sendClaimByGmail(db, CLAIM, emailInput())
    expect(second).toEqual({ ok: false, error: 'send.alreadySent', threadId: 't5' })
    expect(sendMessage).toHaveBeenCalledTimes(1)
  })
})

describe('claim-submission.gmail.offline: offline and disconnected sends', () => {
  it('claim-submission.gmail.offline: offline never calls sendMessage and the claim stays ready', async () => {
    const db = freshDb()
    await seed(db)
    setOnline(false)

    const result = await sendClaimByGmail(db, CLAIM, emailInput())
    expect(result).toEqual({ ok: false, error: 'send.offline' })
    expect(sendMessage).not.toHaveBeenCalled()
    expect((await db.claims.get(CLAIM))?.status).toBe('ready')
  })

  it('claim-submission.gmail.offline: coming back online does not send the email by itself', async () => {
    const db = freshDb()
    await seed(db)
    setOnline(false)
    await sendClaimByGmail(db, CLAIM, emailInput())

    setOnline(true)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(sendMessage).not.toHaveBeenCalled()
    expect((await db.claims.get(CLAIM))?.status).toBe('ready')
  })

  it('claim-submission.gmail.offline: without a connected session nothing is sent', async () => {
    const db = freshDb()
    await seed(db)
    vi.mocked(accessToken).mockReturnValue(null)
    gmailSession.value = { status: 'disconnected' }

    const result = await sendClaimByGmail(db, CLAIM, emailInput())
    expect(result).toEqual({ ok: false, error: 'send.notConnected' })
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('claim-submission.gmail.confirm: a claim that is not ready or need_info is never sent', async () => {
    const db = freshDb()
    await seed(db, 'submitted')

    const result = await sendClaimByGmail(db, CLAIM, emailInput())
    expect(result).toEqual({ ok: false, error: 'send.notReady' })
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('claim-submission.gmail.message: an address with a line break is refused before anything is sent', async () => {
    const db = freshDb()
    await seed(db)

    const result = await sendClaimByGmail(db, CLAIM, { ...emailInput(), to: 'a@b.c\r\nBcc: x@y.z' })
    expect(result).toEqual({ ok: false, error: 'send.invalidMessage' })
    expect(sendMessage).not.toHaveBeenCalled()
  })
})

describe('claim-submission.gmail.success: no double send', () => {
  it('claim-submission.gmail.success: a second call while the first send is in flight does not send again', async () => {
    const db = freshDb()
    await seed(db)
    let answer!: (value: { id: string; threadId: string }) => void
    vi.mocked(sendMessage).mockReturnValue(new Promise((resolve) => (answer = resolve)))

    const first = sendClaimByGmail(db, CLAIM, emailInput())
    const second = await sendClaimByGmail(db, CLAIM, emailInput())
    expect(second).toEqual({ ok: false, error: 'send.inProgress' })

    answer({ id: 'm1', threadId: 't1' })
    expect((await first).ok).toBe(true)
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(await db.claims.get(CLAIM)).toMatchObject({ status: 'submitted', gmailThreadId: 't1' })
  })

  it('claim-submission.gmail.success: a call after the first send finished sees a submitted claim and sends nothing', async () => {
    const db = freshDb()
    await seed(db)
    vi.mocked(sendMessage).mockResolvedValue({ id: 'm1', threadId: 't1' })

    await sendClaimByGmail(db, CLAIM, emailInput())
    const again = await sendClaimByGmail(db, CLAIM, emailInput())
    expect(again).toEqual({ ok: false, error: 'send.notReady' })
    expect(sendMessage).toHaveBeenCalledTimes(1)
  })
})
