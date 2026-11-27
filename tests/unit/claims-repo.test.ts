import { describe, it, expect, afterEach, afterAll, beforeEach, vi } from 'vitest'
import Dexie from 'dexie'
import { Blob as NodeBlob } from 'node:buffer'
import { AppDB } from '../../src/db/db'
import type { Person } from '../../src/domain/types'
import type { DocumentRecord } from '../../src/domain/document-types'
import type { StoredFile } from '../../src/domain/types'
import type { Claim } from '../../src/domain/claim-types'
import {
  createDraft,
  getClaim,
  updateClaim,
  listClaims,
  attachDocuments,
  detachDocuments,
  listClaimDocuments,
  pickableDocuments,
  deleteDraft,
  setStatus,
  listClaimEvents,
  recordOriginals,
} from '../../src/data/claims-repo'
import { updateDocument, confirmAmount } from '../../src/data/documents-repo'
import { createSyncEngine } from '../../src/sync/sync-engine'
import type { SyncAdapter } from '../../src/sync/adapters'
import type { OutboxOp } from '../../src/sync/outbox'
import { setOnline } from '../setup'

// fake-indexeddb keeps Node's native Blob intact (same swap as the other repo tests).
vi.stubGlobal('Blob', NodeBlob)
afterAll(() => vi.unstubAllGlobals())

const TODAY = '2026-11-26'
const HOLDER = 'person-holder'
const CHILD = 'person-child'

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
})

beforeEach(() => setOnline(true))

function person(id: string, overrides: Partial<Person> = {}): Person {
  return {
    id,
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

async function seedPersons(db: AppDB) {
  await db.persons.put(person(HOLDER))
  await db.persons.put(
    person(CHILD, { role: 'dependent', relation: 'child', memberType: 'sponsored', fullName: 'Nguyen Thi B' }),
  )
}

function invoice(id: string, overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id,
    personId: HOLDER,
    claimId: null,
    category: 'invoice',
    fileIds: [],
    docDate: '2026-11-20',
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
    ...overrides,
  }
}

function fileRecord(id: string, docId: string): StoredFile {
  return {
    id,
    ownerType: 'document',
    ownerId: docId,
    kind: 'document',
    mime: 'image/jpeg',
    blob: new NodeBlob(['x'], { type: 'image/jpeg' }) as unknown as Blob,
    bytes: 1,
    sha256: 'abc',
    createdAt: 1,
    updatedAt: 1,
    deleted: 0,
  }
}

async function outboxTypes(db: AppDB): Promise<string[]> {
  return (await db.outbox.orderBy('createdAt').toArray()).map((op) => op.type)
}

async function newDraft(db: AppDB, personId = HOLDER, type: 'outpatient' | 'optical' = 'outpatient'): Promise<Claim> {
  const result = await createDraft(db, { personId, type }, TODAY)
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.claim
}

describe('claims.wizard.create-draft: draft claims', () => {
  it('claims.wizard.create-draft: stores a draft with the holder personId and type outpatient', async () => {
    const db = freshDb()
    await seedPersons(db)

    const result = await createDraft(db, { personId: HOLDER, type: 'outpatient' }, TODAY)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.claim).toMatchObject({
      personId: HOLDER,
      type: 'outpatient',
      status: 'draft',
      wizardStep: 0,
      totalClaimed: 0,
      treatmentDate: TODAY,
      deleted: 0,
    })
    expect(await db.claims.get(result.claim.id)).toEqual(result.claim)
    expect(await outboxTypes(db)).toEqual(['claim.upsert'])
  })

  it('claims.check.optical-dependent: optical is refused when the person is a dependent', async () => {
    const db = freshDb()
    await seedPersons(db)

    const result = await createDraft(db, { personId: CHILD, type: 'optical' }, TODAY)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.type).toBeDefined()
    expect(await db.claims.count()).toBe(0)
  })

  it('claims.wizard.create-draft: a person that does not exist is refused', async () => {
    const db = freshDb()
    const result = await createDraft(db, { personId: 'nobody', type: 'outpatient' }, TODAY)
    expect(result.ok).toBe(false)
    expect(await db.claims.count()).toBe(0)
  })
})

describe('claims.wizard.offline: saving a step offline', () => {
  it('claims.wizard.offline: updating a claim writes it and queues a claim.upsert op in the same transaction', async () => {
    const db = freshDb()
    await seedPersons(db)
    const claim = await newDraft(db)
    await db.outbox.clear()

    setOnline(false)
    const result = await updateClaim(db, claim.id, {
      wizardStep: 2,
      type: 'outpatient',
      treatmentDate: '2026-11-20',
      reason: 'khám tổng quát',
      facilityId: null,
      facilityName: 'Phòng khám ABC',
    })
    expect(result.ok).toBe(true)

    expect(await db.claims.get(claim.id)).toMatchObject({
      wizardStep: 2,
      treatmentDate: '2026-11-20',
      facilityName: 'Phòng khám ABC',
    })
    const ops = await db.outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ type: 'claim.upsert', entity: 'claim', entityId: claim.id })
  })

  it('claims.wizard.offline: a failing outbox write rolls the claim update back', async () => {
    const db = freshDb()
    await seedPersons(db)
    const claim = await newDraft(db)

    const add = vi.spyOn(db.outbox, 'add').mockRejectedValueOnce(new Error('quota exceeded'))
    await expect(updateClaim(db, claim.id, { wizardStep: 3 })).rejects.toThrow('quota exceeded')
    add.mockRestore()

    expect((await db.claims.get(claim.id))?.wizardStep).toBe(0)
  })

  it('claims.wizard.resync: four offline claim writes queue four ops that one sync flush drains', async () => {
    const db = freshDb()
    await seedPersons(db)
    const claim = await newDraft(db)

    const pushed: OutboxOp[][] = []
    const adapter: SyncAdapter = {
      name: 'test',
      async push(ops) {
        pushed.push(ops)
        return { ok: ops.map((o) => o.id), failed: [] }
      },
    }
    const engine = createSyncEngine(db, adapter)
    await engine.flush()
    expect(await db.outbox.count()).toBe(0)
    pushed.length = 0

    setOnline(false)
    for (const step of [1, 2, 3, 4]) {
      const result = await updateClaim(db, claim.id, { wizardStep: step as 1 | 2 | 3 | 4 })
      expect(result.ok).toBe(true)
    }
    expect(await db.outbox.count()).toBe(4)

    setOnline(true)
    await engine.flush()
    expect(pushed.flat()).toHaveLength(4)
    expect(pushed.flat().every((op) => op.type === 'claim.upsert')).toBe(true)
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('claims.invoices: totals and the invoice list', () => {
  it('claims.invoices.total: totalClaimed is the sum of the confirmed invoices of 300000 and 450000', async () => {
    const db = freshDb()
    await seedPersons(db)
    const claim = await newDraft(db)
    await db.documents.bulkPut([invoice('inv-1', { amount: 300000 }), invoice('inv-2', { amount: 450000 })])

    const result = await attachDocuments(db, claim.id, ['inv-1', 'inv-2'])
    expect(result.ok).toBe(true)
    expect((await getClaim(db, claim.id))?.totalClaimed).toBe(750000)
  })

  it('claims.invoices.total: editing a claimed invoice amount recomputes the total in the same write', async () => {
    const db = freshDb()
    await seedPersons(db)
    const claim = await newDraft(db)
    await db.documents.bulkPut([invoice('inv-1', { amount: 300000 }), invoice('inv-2', { amount: 450000 })])
    await attachDocuments(db, claim.id, ['inv-1', 'inv-2'])
    await db.outbox.clear()

    const edited = await updateDocument(db, 'inv-2', { amount: 500000 })
    expect(edited.ok).toBe(true)

    expect((await getClaim(db, claim.id))?.totalClaimed).toBe(800000)
    expect(await outboxTypes(db)).toEqual(expect.arrayContaining(['document.upsert', 'claim.upsert']))
  })

  it('claims.invoices.unconfirmed: an OCR amount that is not confirmed stays out of the total until confirmed', async () => {
    const db = freshDb()
    await seedPersons(db)
    const claim = await newDraft(db)
    await db.documents.bulkPut([
      invoice('inv-1', { amount: 300000 }),
      invoice('inv-ocr', { amount: 200000, amountSource: 'ocr', amountConfirmed: false }),
    ])

    await attachDocuments(db, claim.id, ['inv-1', 'inv-ocr'])
    expect((await getClaim(db, claim.id))?.totalClaimed).toBe(300000)

    const confirmed = await confirmAmount(db, 'inv-ocr')
    expect(confirmed.ok).toBe(true)
    expect((await getClaim(db, claim.id))?.totalClaimed).toBe(500000)
  })

  it('claims.invoices.remove: removing the 450000 invoice drops the total to 300000 and returns it to the library', async () => {
    const db = freshDb()
    await seedPersons(db)
    const claim = await newDraft(db)
    await db.documents.bulkPut([invoice('inv-1', { amount: 300000 }), invoice('inv-2', { amount: 450000 })])
    await attachDocuments(db, claim.id, ['inv-1', 'inv-2'])

    const result = await detachDocuments(db, claim.id, ['inv-2'])
    expect(result.ok).toBe(true)

    expect((await getClaim(db, claim.id))?.totalClaimed).toBe(300000)
    expect((await db.documents.get('inv-2'))?.claimId).toBeNull()
  })

  it('claims.invoices.pick: a document that belongs to another claim is not offered and cannot be attached', async () => {
    const db = freshDb()
    await seedPersons(db)
    const first = await newDraft(db)
    const second = await newDraft(db)
    await db.documents.bulkPut([
      invoice('free', { amount: 100000 }),
      invoice('taken', { amount: 200000, claimId: first.id }),
    ])

    const offered = (await pickableDocuments(db, second.id)).map((d) => d.id)
    expect(offered).toContain('free')
    expect(offered).not.toContain('taken')

    const result = await attachDocuments(db, second.id, ['taken'])
    expect(result.ok).toBe(false)
    expect((await db.documents.get('taken'))?.claimId).toBe(first.id)
  })
})

describe('claims.docs: checklist documents', () => {
  it('claims.docs.attach: two prescription photos attached make two prescription documents of the claim', async () => {
    const db = freshDb()
    await seedPersons(db)
    const claim = await newDraft(db)
    const rx = (id: string) => invoice(id, { category: 'prescription', amount: null, amountConfirmed: false, amountSource: null })
    await db.documents.bulkPut([rx('rx-1'), rx('rx-2')])

    const result = await attachDocuments(db, claim.id, ['rx-1', 'rx-2'])
    expect(result.ok).toBe(true)

    const attached = await listClaimDocuments(db, claim.id)
    expect(attached.map((d) => d.id).sort()).toEqual(['rx-1', 'rx-2'])
    expect(attached.every((d) => d.category === 'prescription')).toBe(true)
  })

  it('claims.docs.reuse: a prescription already in the library is attached without storing its image again', async () => {
    const db = freshDb()
    await seedPersons(db)
    const claim = await newDraft(db)
    await db.files.put(fileRecord('file-rx', 'rx-old'))
    await db.documents.put(invoice('rx-old', { category: 'prescription', fileIds: ['file-rx'], amount: null, amountConfirmed: false, amountSource: null }))
    const filesBefore = await db.files.count()

    const result = await attachDocuments(db, claim.id, ['rx-old'])
    expect(result.ok).toBe(true)

    const doc = await db.documents.get('rx-old')
    expect(doc).toMatchObject({ claimId: claim.id, fileIds: ['file-rx'] })
    expect(await db.files.count()).toBe(filesBefore)
  })

  it('claims.docs.detach: removing a document returns it to the library with its fields and files', async () => {
    const db = freshDb()
    await seedPersons(db)
    const claim = await newDraft(db)
    await db.files.put(fileRecord('file-rx', 'rx-1'))
    await db.documents.put(invoice('rx-1', { category: 'prescription', fileIds: ['file-rx'], amount: null, amountConfirmed: false, amountSource: null, docDate: '2026-11-19' }))
    await attachDocuments(db, claim.id, ['rx-1'])
    const attachedDoc = await db.documents.get('rx-1')

    const result = await detachDocuments(db, claim.id, ['rx-1'])
    expect(result.ok).toBe(true)

    const after = await db.documents.get('rx-1')
    expect(after).toEqual({ ...attachedDoc, claimId: null, updatedAt: after?.updatedAt })
    expect(after?.fileIds).toEqual(['file-rx'])
    expect(await db.files.get('file-rx')).toMatchObject({ deleted: 0 })
  })
})

describe('claims.list: listing, status and deleting drafts', () => {
  it('claims.list.delete-draft: deleting a draft soft-deletes it, returns its documents and queues an op per change', async () => {
    const db = freshDb()
    await seedPersons(db)
    const claim = await newDraft(db)
    await db.documents.put(invoice('inv-1', { amount: 300000 }))
    await attachDocuments(db, claim.id, ['inv-1'])
    await db.outbox.clear()

    const result = await deleteDraft(db, claim.id)
    expect(result.ok).toBe(true)

    expect((await db.claims.get(claim.id))?.deleted).toBe(1)
    expect(await getClaim(db, claim.id)).toBeUndefined()
    expect((await db.documents.get('inv-1'))?.claimId).toBeNull()
    expect(await outboxTypes(db)).toEqual(expect.arrayContaining(['claim.delete', 'document.upsert']))
  })

  it('claims.list.no-delete-submitted: a submitted claim cannot be deleted', async () => {
    const db = freshDb()
    await seedPersons(db)
    const claim = await newDraft(db)
    await setStatus(db, claim.id, 'ready')
    await setStatus(db, claim.id, 'submitted', { submittedAt: 1, sentVia: 'mailto' })

    const result = await deleteDraft(db, claim.id)
    expect(result.ok).toBe(false)
    expect(await getClaim(db, claim.id)).toMatchObject({ status: 'submitted', deleted: 0 })
  })

  it('claims.list.filter: the in-progress group lists only submitted and need_info claims, newest treatment date first', async () => {
    const db = freshDb()
    await seedPersons(db)
    const draft = await newDraft(db)
    const submitted = await newDraft(db)
    const needInfo = await newDraft(db, CHILD, 'outpatient')
    const paid = await newDraft(db)
    await updateClaim(db, submitted.id, { treatmentDate: '2026-11-01' })
    await updateClaim(db, needInfo.id, { treatmentDate: '2026-11-10' })
    await updateClaim(db, paid.id, { treatmentDate: '2026-11-05' })
    await db.documents.put(invoice('inv-paid', { amount: 300000 }))
    await attachDocuments(db, paid.id, ['inv-paid'])
    for (const id of [submitted.id, needInfo.id, paid.id]) await setStatus(db, id, 'ready')
    await setStatus(db, submitted.id, 'submitted', { submittedAt: 1, sentVia: 'mailto' })
    await setStatus(db, needInfo.id, 'submitted', { submittedAt: 1, sentVia: 'mailto' })
    await setStatus(db, needInfo.id, 'need_info')
    await setStatus(db, paid.id, 'submitted', { submittedAt: 1, sentVia: 'mailto' })
    await setStatus(db, paid.id, 'approved', { approvedAmount: 100000 })
    await setStatus(db, paid.id, 'paid')

    const inProgress = await listClaims(db, { group: 'inProgress' })
    expect(inProgress.map((c) => c.id)).toEqual([needInfo.id, submitted.id])
    expect(inProgress.map((c) => c.status)).toEqual(['need_info', 'submitted'])

    const drafting = await listClaims(db, { group: 'drafting' })
    expect(drafting.map((c) => c.id)).toEqual([draft.id])

    const onlyChild = await listClaims(db, { personId: CHILD })
    expect(onlyChild.map((c) => c.id)).toEqual([needInfo.id])
  })

  it('claim-submission.ready.complete: setStatus to ready stores the claim and a claimEvents entry with status ready', async () => {
    const db = freshDb()
    await seedPersons(db)
    const claim = await newDraft(db)

    const result = await setStatus(db, claim.id, 'ready', {}, { note: 'Đã dựng hai tệp', amount: null, at: 1000 })
    expect(result.ok).toBe(true)

    expect((await getClaim(db, claim.id))?.status).toBe('ready')
    const events = await listClaimEvents(db, claim.id)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ claimId: claim.id, status: 'ready', at: 1000, note: 'Đã dựng hai tệp', amount: null })
  })

  it('claim-tracking.status.offline: a status change stores the claim and the event and queues both ops in one transaction', async () => {
    const db = freshDb()
    await seedPersons(db)
    const claim = await newDraft(db)
    await setStatus(db, claim.id, 'ready')
    await db.outbox.clear()
    const eventsBefore = (await listClaimEvents(db, claim.id)).length

    setOnline(false)
    const result = await setStatus(db, claim.id, 'submitted', { submittedAt: 5, sentVia: 'mailto' })
    expect(result.ok).toBe(true)

    expect(await getClaim(db, claim.id)).toMatchObject({ status: 'submitted', submittedAt: 5, sentVia: 'mailto' })
    expect(await listClaimEvents(db, claim.id)).toHaveLength(eventsBefore + 1)
    expect(await outboxTypes(db)).toEqual(expect.arrayContaining(['claim.upsert', 'claimEvent.upsert']))
  })
})

/** A submitted claim whose live invoices total 750000 (300000 + 450000). */
async function submittedClaimWithTotal(db: AppDB): Promise<Claim> {
  const claim = await newDraft(db)
  await db.documents.put(invoice('inv-a', { amount: 300000 }))
  await db.documents.put(invoice('inv-b', { amount: 450000 }))
  await attachDocuments(db, claim.id, ['inv-a', 'inv-b'])
  await setStatus(db, claim.id, 'ready')
  await setStatus(db, claim.id, 'submitted', { submittedAt: 1, sentVia: 'mailto' })
  return (await getClaim(db, claim.id)) as Claim
}

describe('claim-tracking.status: setStatus applies the transition table and the outcome rules', () => {
  it('claim-tracking.status.invalid-transition: a refused transition writes no claim, event or op', async () => {
    const db = freshDb()
    await seedPersons(db)
    const claim = await newDraft(db)
    await db.outbox.clear()

    const result = await setStatus(db, claim.id, 'submitted', { submittedAt: 1, sentVia: 'mailto' })
    expect(result).toEqual({ ok: false, errors: { status: 'error.statusTransitionInvalid' } })
    expect(await getClaim(db, claim.id)).toMatchObject({ status: 'draft', submittedAt: null })
    expect(await listClaimEvents(db, claim.id)).toEqual([])
    expect(await outboxTypes(db)).toEqual([])
  })

  it('claim-tracking.status.invalid-transition: a paid claim accepts no status change', async () => {
    const db = freshDb()
    await seedPersons(db)
    const claim = await submittedClaimWithTotal(db)
    await setStatus(db, claim.id, 'approved', { approvedAmount: 750000 })
    await setStatus(db, claim.id, 'paid')

    const result = await setStatus(db, claim.id, 'submitted', { submittedAt: 2, sentVia: 'mailto' })
    expect(result.ok).toBe(false)
    expect((await getClaim(db, claim.id))?.status).toBe('paid')
  })

  it('claim-tracking.status.amount-too-high: approved above the claimed total is refused and nothing is saved', async () => {
    const db = freshDb()
    await seedPersons(db)
    const claim = await submittedClaimWithTotal(db)
    const eventsBefore = (await listClaimEvents(db, claim.id)).length

    const result = await setStatus(db, claim.id, 'approved', { approvedAmount: 800000 })
    expect(result).toEqual({ ok: false, errors: { approvedAmount: 'error.amountTooHigh' } })
    expect(await getClaim(db, claim.id)).toMatchObject({ status: 'submitted', approvedAmount: null })
    expect(await listClaimEvents(db, claim.id)).toHaveLength(eventsBefore)
  })

  it('claim-tracking.status.partial: partially approved stores the amount, the reason and an event', async () => {
    const db = freshDb()
    await seedPersons(db)
    const claim = await submittedClaimWithTotal(db)

    const result = await setStatus(
      db,
      claim.id,
      'partially_approved',
      { approvedAmount: 500000, rejectionReason: 'Thuốc bổ không được chi trả' },
      { note: 'Email phản hồi', amount: 500000 },
    )
    expect(result.ok).toBe(true)
    expect(await getClaim(db, claim.id)).toMatchObject({
      status: 'partially_approved',
      approvedAmount: 500000,
      rejectionReason: 'Thuốc bổ không được chi trả',
    })
    const outcome = (await listClaimEvents(db, claim.id)).filter((e) => e.status === 'partially_approved')
    expect(outcome).toHaveLength(1)
    expect(outcome[0]).toMatchObject({ amount: 500000, note: 'Email phản hồi' })
  })

  it('claim-tracking.status.partial: partially approved without a reason is refused on rejectionReason', async () => {
    const db = freshDb()
    await seedPersons(db)
    const claim = await submittedClaimWithTotal(db)

    const result = await setStatus(db, claim.id, 'partially_approved', { approvedAmount: 500000 })
    expect(result).toEqual({ ok: false, errors: { rejectionReason: 'error.reasonRequired' } })
    expect((await getClaim(db, claim.id))?.status).toBe('submitted')
  })

  it('claim-submission.supplement.subject: need_info may go back to submitted through setStatus', async () => {
    const db = freshDb()
    await seedPersons(db)
    const claim = await submittedClaimWithTotal(db)
    await setStatus(db, claim.id, 'need_info')

    const result = await setStatus(db, claim.id, 'submitted', { submittedAt: 3, sentVia: 'gmail', gmailThreadId: 't9' })
    expect(result.ok).toBe(true)
    expect(await getClaim(db, claim.id)).toMatchObject({ status: 'submitted', gmailThreadId: 't9' })
  })
})

describe('claims.wizard.locked: a sent claim refuses edits, need_info takes only documents', () => {
  it('claims.wizard.locked: updateClaim refuses a submitted claim, leaves it unchanged and queues no op', async () => {
    const db = freshDb()
    await seedPersons(db)
    const claim = await submittedClaimWithTotal(db)
    const before = await outboxTypes(db)

    const result = await updateClaim(db, claim.id, { diagnosis: 'Viêm họng' })
    expect(result).toEqual({ ok: false, errors: { status: 'error.claimLocked' } })
    expect(await getClaim(db, claim.id)).toMatchObject({ diagnosis: null, status: 'submitted' })
    expect(await outboxTypes(db)).toEqual(before)
  })

  it('claims.wizard.locked: updateClaim refuses an approved claim', async () => {
    const db = freshDb()
    await seedPersons(db)
    const claim = await submittedClaimWithTotal(db)
    await setStatus(db, claim.id, 'approved', { approvedAmount: 300000 })

    const result = await updateClaim(db, claim.id, { facilityName: 'Bệnh viện mới' })
    expect(result.ok).toBe(false)
    expect(await getClaim(db, claim.id)).toMatchObject({ facilityName: '', status: 'approved' })
  })

  it('claims.wizard.locked: need_info refuses a field change but accepts a step move', async () => {
    const db = freshDb()
    await seedPersons(db)
    const claim = await submittedClaimWithTotal(db)
    await setStatus(db, claim.id, 'need_info')

    const refused = await updateClaim(db, claim.id, { diagnosis: 'Viêm họng' })
    expect(refused).toEqual({ ok: false, errors: { status: 'error.claimLocked' } })

    const moved = await updateClaim(db, claim.id, { wizardStep: 4 })
    expect(moved.ok).toBe(true)
    expect(await getClaim(db, claim.id)).toMatchObject({ status: 'need_info', wizardStep: 4, diagnosis: null })
  })

  it('claims.docs.locked: attachDocuments refuses a submitted claim and attaches nothing', async () => {
    const db = freshDb()
    await seedPersons(db)
    const claim = await submittedClaimWithTotal(db)
    await db.documents.put(invoice('inv-late', { amount: 100000 }))
    const before = await outboxTypes(db)

    const result = await attachDocuments(db, claim.id, ['inv-late'])
    expect(result).toEqual({ ok: false, errors: { status: 'error.claimLocked' } })
    expect((await db.documents.get('inv-late'))?.claimId).toBeNull()
    expect(await outboxTypes(db)).toEqual(before)
  })

  it('claims.docs.locked: detachDocuments refuses a submitted claim and keeps the document attached', async () => {
    const db = freshDb()
    await seedPersons(db)
    const claim = await submittedClaimWithTotal(db)

    const result = await detachDocuments(db, claim.id, ['inv-a'])
    expect(result).toEqual({ ok: false, errors: { status: 'error.claimLocked' } })
    expect((await db.documents.get('inv-a'))?.claimId).toBe(claim.id)
  })

  it('claims.docs.locked: need_info accepts an added photo for the supplement', async () => {
    const db = freshDb()
    await seedPersons(db)
    const claim = await submittedClaimWithTotal(db)
    await setStatus(db, claim.id, 'need_info')
    await db.documents.put(invoice('photo-new', { category: 'prescription', amount: null, amountConfirmed: false }))

    const result = await attachDocuments(db, claim.id, ['photo-new'])
    expect(result.ok).toBe(true)
    expect((await db.documents.get('photo-new'))?.claimId).toBe(claim.id)
  })
})

describe('claim-submission.originals: recording the handed-in originals', () => {
  it('claim-submission.originals.confirm: recordOriginals stores the date, queues a claim and an event op in one transaction', async () => {
    const db = freshDb()
    await seedPersons(db)
    const claim = await submittedClaimWithTotal(db)
    const before = await outboxTypes(db)

    const result = await recordOriginals(db, claim.id, 1_800_000_000_000, 'Đã nộp bản gốc')
    expect(result.ok).toBe(true)
    expect(await getClaim(db, claim.id)).toMatchObject({ originalsSubmittedAt: 1_800_000_000_000, status: 'submitted' })
    expect((await outboxTypes(db)).slice(before.length)).toEqual(['claim.upsert', 'claimEvent.upsert'])
    const events = await listClaimEvents(db, claim.id)
    expect(events.at(-1)).toMatchObject({ status: 'submitted', note: 'Đã nộp bản gốc' })
  })

  it('claim-submission.originals.confirm: a draft claim cannot record originals', async () => {
    const db = freshDb()
    await seedPersons(db)
    const claim = await newDraft(db)

    const result = await recordOriginals(db, claim.id, 1, 'x')
    expect(result).toEqual({ ok: false, errors: { status: 'error.notSent' } })
  })
})
