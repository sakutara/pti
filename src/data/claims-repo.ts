import type { AppDB } from '../db/db'
import { newId, now } from '../db/db'
import { enqueue } from '../sync/outbox'
import {
  CLAIM_TYPES,
  type Claim,
  type ClaimEvent,
  type ClaimStatus,
  type ClaimType,
} from '../domain/claim-types'
import type { DocumentRecord } from '../domain/document-types'
import { canTransition, validateOutcome } from '../domain/claim-status'
import { recomputeClaimTotal } from './claim-totals'

export type ClaimResult = { ok: true; claim: Claim } | { ok: false; errors: Record<string, string> }
export type RepoResult = { ok: true } | { ok: false; errors: Record<string, string> }

/** Status groups of the claim list (claims.list.filter). */
export const STATUS_GROUPS = {
  drafting: ['draft', 'ready'],
  inProgress: ['submitted', 'need_info'],
  done: ['approved', 'partially_approved', 'rejected', 'paid'],
} as const satisfies Record<string, readonly ClaimStatus[]>
export type StatusGroup = keyof typeof STATUS_GROUPS

export interface ClaimInput {
  personId: string
  type: ClaimType
}

/** Fields the wizard and the detail may change. Status changes go through setStatus. */
export type ClaimPatch = Partial<
  Pick<
    Claim,
    | 'type'
    | 'treatmentDate'
    | 'facilityId'
    | 'facilityName'
    | 'reason'
    | 'daysOff'
    | 'admissionDate'
    | 'dischargeDate'
    | 'bank'
    | 'notApplicable'
    | 'diagnosis'
    | 'flags'
    | 'wizardStep'
  >
>

/** Columns written together with a status change (submission, outcome, originals). */
export type StatusFields = Partial<
  Pick<
    Claim,
    | 'submittedAt'
    | 'sentVia'
    | 'gmailThreadId'
    | 'approvedAmount'
    | 'rejectionReason'
    | 'originalsSubmittedAt'
    | 'bundleFileIds'
    | 'lastSubmittedFileIds'
  >
>

export interface EventInput {
  note?: string
  amount?: number | null
  /** Epoch ms of the event; defaults to now. */
  at?: number
}

export interface ClaimFilter {
  group?: StatusGroup
  status?: ClaimStatus
  personId?: string
}

const notFound = { id: 'error.claimNotFound' }
const locked = { status: 'error.claimLocked' }

/** Statuses in which the claim's own fields may change (draft and ready; a ready claim goes back to draft). */
const FIELDS_EDITABLE: readonly ClaimStatus[] = ['draft', 'ready']
/** Statuses in which documents may be attached or returned. need_info allows adding photos for the supplement. */
const DOCUMENTS_EDITABLE: readonly ClaimStatus[] = ['draft', 'ready', 'need_info']

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

const definedOnly = <T extends object>(value: T): Partial<T> =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>

async function liveClaim(db: AppDB, id: string): Promise<Claim | undefined> {
  const claim = await db.claims.get(id)
  return claim && claim.deleted === 0 ? claim : undefined
}

function validatePatch(patch: ClaimPatch): Record<string, string> {
  const errors: Record<string, string> = {}
  if (patch.type !== undefined && !(CLAIM_TYPES as readonly string[]).includes(patch.type)) {
    errors.type = 'error.claimTypeInvalid'
  }
  if (patch.treatmentDate !== undefined && !isIsoDate(patch.treatmentDate)) errors.treatmentDate = 'error.dateInvalid'
  if (patch.admissionDate !== undefined && patch.admissionDate !== null && !isIsoDate(patch.admissionDate)) {
    errors.admissionDate = 'error.dateInvalid'
  }
  if (patch.dischargeDate !== undefined && patch.dischargeDate !== null && !isIsoDate(patch.dischargeDate)) {
    errors.dischargeDate = 'error.dateInvalid'
  }
  if (patch.daysOff !== undefined && (!Number.isInteger(patch.daysOff) || patch.daysOff < 0)) {
    errors.daysOff = 'error.daysOffInvalid'
  }
  if (patch.wizardStep !== undefined && ![0, 1, 2, 3, 4, 5].includes(patch.wizardStep)) {
    errors.wizardStep = 'error.wizardStepInvalid'
  }
  return errors
}

/** Only employees can have an optical claim (claims.check.optical-dependent). */
const opticalNeedsEmployee = (type: ClaimType, memberType: string | undefined): boolean =>
  type === 'optical' && memberType !== 'employee'

/** Creates a draft for a live person. The treatment date starts at `today` and is replaced by the wizard. */
export async function createDraft(db: AppDB, input: ClaimInput, today: string): Promise<ClaimResult> {
  return db.transaction('rw', db.claims, db.persons, db.outbox, async (): Promise<ClaimResult> => {
    const errors: Record<string, string> = {}
    if (!(CLAIM_TYPES as readonly string[]).includes(input.type)) errors.type = 'error.claimTypeInvalid'
    const person = await db.persons.get(input.personId)
    if (!person || person.deleted === 1) {
      errors.personId = 'error.personNotFound'
    } else if (opticalNeedsEmployee(input.type, person.memberType)) {
      errors.type = 'error.opticalEmployeeOnly'
    }
    if (!isIsoDate(today)) errors.treatmentDate = 'error.dateInvalid'
    if (Object.keys(errors).length > 0) return { ok: false, errors }

    const t = now()
    const claim: Claim = {
      id: newId(),
      personId: input.personId,
      type: input.type,
      status: 'draft',
      treatmentDate: today,
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
      updatedAt: t,
      deleted: 0,
    }
    await db.claims.put(claim)
    await enqueue(db, { type: 'claim.upsert', entity: 'claim', entityId: claim.id, payload: claim })
    return { ok: true, claim }
  })
}

/** A single live claim, or undefined. */
export async function getClaim(db: AppDB, id: string): Promise<Claim | undefined> {
  return liveClaim(db, id)
}

/** Saves wizard answers. Queues `claim.upsert` in the same transaction as the write. */
export async function updateClaim(db: AppDB, id: string, patch: ClaimPatch): Promise<ClaimResult> {
  const errors = validatePatch(patch)
  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return db.transaction('rw', db.claims, db.persons, db.outbox, async (): Promise<ClaimResult> => {
    const claim = await liveClaim(db, id)
    if (!claim) return { ok: false, errors: notFound }

    const changes = definedOnly(patch)
    // A step move alone is not an edit, so it is allowed in every status.
    const fieldKeys = Object.keys(changes).filter((key) => key !== 'wizardStep')
    if (fieldKeys.length > 0 && !FIELDS_EDITABLE.includes(claim.status)) return { ok: false, errors: locked }

    const type = changes.type ?? claim.type
    const person = await db.persons.get(claim.personId)
    if (opticalNeedsEmployee(type, person?.memberType)) return { ok: false, errors: { type: 'error.opticalEmployeeOnly' } }

    const next: Claim = { ...claim, ...changes, updatedAt: now() }
    await db.claims.put(next)
    await enqueue(db, { type: 'claim.upsert', entity: 'claim', entityId: id, payload: next })
    return { ok: true, claim: next }
  })
}

/** Live claims, newest treatment date first, optionally filtered by status group, status or person. */
export async function listClaims(db: AppDB, filter: ClaimFilter = {}): Promise<Claim[]> {
  const statuses: readonly ClaimStatus[] | undefined = filter.group ? STATUS_GROUPS[filter.group] : undefined
  const rows = await db.claims.filter((c) => c.deleted === 0).toArray()
  return rows
    .filter((c) => statuses === undefined || (statuses as readonly string[]).includes(c.status))
    .filter((c) => filter.status === undefined || c.status === filter.status)
    .filter((c) => filter.personId === undefined || c.personId === filter.personId)
    .sort((a, b) => {
      if (a.treatmentDate !== b.treatmentDate) return a.treatmentDate < b.treatmentDate ? 1 : -1
      return b.updatedAt - a.updatedAt
    })
}

/** Live documents of the claim, oldest first (checklist order follows later). */
export async function listClaimDocuments(db: AppDB, claimId: string): Promise<DocumentRecord[]> {
  const rows = await db.documents.where('claimId').equals(claimId).toArray()
  return rows.filter((d) => d.deleted === 0).sort((a, b) => a.createdAt - b.createdAt)
}

/** Documents the claim can take: not attached to any other claim. Newest first. */
export async function pickableDocuments(db: AppDB, claimId: string): Promise<DocumentRecord[]> {
  const rows = await db.documents.filter((d) => d.deleted === 0 && (d.claimId === null || d.claimId === claimId)).toArray()
  return rows.sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Attaches documents to a live claim. A document of another claim, or of another person, is refused and
 * nothing is attached. Recomputes the total in the same transaction.
 */
export async function attachDocuments(db: AppDB, claimId: string, documentIds: ReadonlyArray<string>): Promise<ClaimResult> {
  return db.transaction('rw', db.claims, db.documents, db.outbox, async (): Promise<ClaimResult> => {
    const claim = await liveClaim(db, claimId)
    if (!claim) return { ok: false, errors: notFound }
    if (!DOCUMENTS_EDITABLE.includes(claim.status)) return { ok: false, errors: locked }

    const docs: DocumentRecord[] = []
    for (const id of new Set(documentIds)) {
      const doc = await db.documents.get(id)
      if (!doc || doc.deleted === 1) return { ok: false, errors: { documentId: 'error.documentNotFound' } }
      if (doc.claimId !== null && doc.claimId !== claimId) return { ok: false, errors: { documentId: 'error.documentInClaim' } }
      if (doc.personId !== null && doc.personId !== claim.personId) {
        return { ok: false, errors: { documentId: 'error.documentOtherPerson' } }
      }
      docs.push(doc)
    }

    const t = now()
    for (const doc of docs) {
      if (doc.claimId === claimId) continue
      const next: DocumentRecord = { ...doc, claimId, updatedAt: t }
      await db.documents.put(next)
      await enqueue(db, { type: 'document.upsert', entity: 'document', entityId: doc.id, payload: next })
    }
    await recomputeClaimTotal(db, claimId)
    return { ok: true, claim: (await liveClaim(db, claimId)) ?? claim }
  })
}

/** Returns documents of the claim to the library. Their fields and files stay as they are. */
export async function detachDocuments(db: AppDB, claimId: string, documentIds: ReadonlyArray<string>): Promise<ClaimResult> {
  return db.transaction('rw', db.claims, db.documents, db.outbox, async (): Promise<ClaimResult> => {
    const claim = await liveClaim(db, claimId)
    if (!claim) return { ok: false, errors: notFound }
    if (!DOCUMENTS_EDITABLE.includes(claim.status)) return { ok: false, errors: locked }

    const docs: DocumentRecord[] = []
    for (const id of new Set(documentIds)) {
      const doc = await db.documents.get(id)
      if (!doc || doc.deleted === 1 || doc.claimId !== claimId) {
        return { ok: false, errors: { documentId: 'error.documentNotInClaim' } }
      }
      docs.push(doc)
    }

    const t = now()
    for (const doc of docs) {
      const next: DocumentRecord = { ...doc, claimId: null, updatedAt: t }
      await db.documents.put(next)
      await enqueue(db, { type: 'document.upsert', entity: 'document', entityId: doc.id, payload: next })
    }
    await recomputeClaimTotal(db, claimId)
    return { ok: true, claim: (await liveClaim(db, claimId)) ?? claim }
  })
}

/**
 * Soft-deletes a draft. Its documents return to the library; one op is queued per change.
 * Only drafts can be deleted.
 */
export async function deleteDraft(db: AppDB, claimId: string): Promise<RepoResult> {
  return db.transaction('rw', db.claims, db.documents, db.outbox, async (): Promise<RepoResult> => {
    const claim = await liveClaim(db, claimId)
    if (!claim) return { ok: false, errors: notFound }
    if (claim.status !== 'draft') return { ok: false, errors: { status: 'error.notDraft' } }

    const t = now()
    const attached = await db.documents.where('claimId').equals(claimId).toArray()
    for (const doc of attached) {
      const next: DocumentRecord = { ...doc, claimId: null, updatedAt: t }
      await db.documents.put(next)
      await enqueue(db, { type: 'document.upsert', entity: 'document', entityId: doc.id, payload: next })
    }

    await db.claims.put({ ...claim, deleted: 1, updatedAt: t })
    await enqueue(db, { type: 'claim.delete', entity: 'claim', entityId: claimId, payload: { id: claimId } })
    return { ok: true }
  })
}

/**
 * Moves a claim to a new status and stores a claimEvents entry, with the claim's fields written
 * together. Queues `claim.upsert` and `claimEvent.upsert` in the same transaction.
 */
export async function setStatus(
  db: AppDB,
  claimId: string,
  status: ClaimStatus,
  fields: StatusFields = {},
  event: EventInput = {},
): Promise<ClaimResult> {
  return db.transaction('rw', db.claims, db.claimEvents, db.outbox, async (): Promise<ClaimResult> => {
    const claim = await liveClaim(db, claimId)
    if (!claim) return { ok: false, errors: notFound }
    if (!canTransition(claim.status, status)) return { ok: false, errors: { status: 'error.statusTransitionInvalid' } }

    const amount = fields.approvedAmount !== undefined ? fields.approvedAmount : claim.approvedAmount
    const reason = fields.rejectionReason !== undefined ? fields.rejectionReason : claim.rejectionReason
    const outcome = validateOutcome(status, amount, claim.totalClaimed, reason)
    if (outcome) return { ok: false, errors: { [outcome.field]: outcome.code } }

    const t = now()
    const next: Claim = { ...claim, ...definedOnly(fields), status, updatedAt: t }
    await db.claims.put(next)
    await enqueue(db, { type: 'claim.upsert', entity: 'claim', entityId: claimId, payload: next })

    const entry: ClaimEvent = {
      id: newId(),
      claimId,
      at: event.at ?? t,
      status,
      note: event.note ?? '',
      amount: event.amount ?? null,
      updatedAt: t,
      deleted: 0,
    }
    await db.claimEvents.put(entry)
    await enqueue(db, { type: 'claimEvent.upsert', entity: 'claimEvent', entityId: entry.id, payload: entry })
    return { ok: true, claim: next }
  })
}

/** Status history of a claim, oldest first. */
export async function listClaimEvents(db: AppDB, claimId: string): Promise<ClaimEvent[]> {
  const rows = await db.claimEvents.where('claimId').equals(claimId).toArray()
  return rows.filter((e) => e.deleted === 0).sort((a, b) => a.at - b.at || a.updatedAt - b.updatedAt)
}

/** Statuses after the claim was sent; the originals can only be recorded for a sent claim. */
const SENT_STATUSES: readonly ClaimStatus[] = ['submitted', 'need_info', 'approved', 'partially_approved', 'rejected', 'paid']

/**
 * Records the day the paper originals were handed in (inpatient and maternity). The status stays as it is; the
 * claim and one claimEvents entry with `note` are written in one transaction with their ops.
 */
export async function recordOriginals(db: AppDB, claimId: string, at: number, note: string): Promise<ClaimResult> {
  return db.transaction('rw', db.claims, db.claimEvents, db.outbox, async (): Promise<ClaimResult> => {
    const claim = await liveClaim(db, claimId)
    if (!claim) return { ok: false, errors: notFound }
    if (!SENT_STATUSES.includes(claim.status)) return { ok: false, errors: { status: 'error.notSent' } }

    const t = now()
    const next: Claim = { ...claim, originalsSubmittedAt: at, updatedAt: t }
    await db.claims.put(next)
    await enqueue(db, { type: 'claim.upsert', entity: 'claim', entityId: claimId, payload: next })

    const entry: ClaimEvent = {
      id: newId(),
      claimId,
      at,
      status: claim.status,
      note,
      amount: null,
      updatedAt: t,
      deleted: 0,
    }
    await db.claimEvents.put(entry)
    await enqueue(db, { type: 'claimEvent.upsert', entity: 'claimEvent', entityId: entry.id, payload: entry })
    return { ok: true, claim: next }
  })
}
