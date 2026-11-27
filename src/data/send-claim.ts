// Sends a ready claim by Gmail. Runs only when called from the user's "Gửi" tap; nothing here is scheduled and
// nothing listens to the network state. The claim moves to `submitted` only after Gmail answers with success.
import type { AppDB } from '../db/db'
import { now } from '../db/db'
import { buildMime, MimeError, type MimeAttachment } from '../lib/mime'
import { GmailError, sendMessage, TokenExpiredError } from '../lib/gmail'
import { accessToken, gmailSession, invalidateToken } from './gmail-session'
import { getClaim, listClaimDocuments, setStatus, type ClaimResult } from './claims-repo'
import { getStoredFile, storeClaimBundle } from './files-repo'
import { applicableRequirements, missingRequired } from '../domain/requirements'
import { buildClaimFormData, missingFields, type ClaimFormData, type FormFieldKey } from '../domain/claim-form'
import { composeEmail, type ComposeResult } from '../domain/email'
import { docsFileName, formFileName } from '../domain/file-names'
import type { Claim } from '../domain/claim-types'
import type { DocumentRecord } from '../domain/document-types'
import type { Account, Person } from '../domain/types'
import type { AdministratorConfig, ClaimRequirements, Requirement } from '../domain/requirements-schema'
import { t } from '../i18n'
// Type-only imports: the PDF and attachment modules are loaded lazily inside buildClaimFiles.
import type { FormAssets } from '../lib/claim-form-pdf'
import type { AttachmentItem, ImageEncoder, TooLarge } from '../lib/attachments-pdf'

export interface GmailSendInput {
  to: string
  cc: string[]
  subject: string
  body: string
  files: MimeAttachment[]
}

export type SendErrorCode =
  | 'send.offline'
  | 'send.notConnected'
  | 'send.tokenExpired'
  | 'send.failed'
  | 'send.invalidMessage'
  | 'send.inProgress'
  | 'send.notReady'
  | 'send.saveFailed'
  | 'send.alreadySent'

export type SendResult =
  | { ok: true; claimId: string; threadId: string }
  | { ok: false; error: SendErrorCode; status?: number; threadId?: string }

/**
 * Device-only record that Gmail accepted a claim's mail but the status write failed. Kept in settings (no outbox op)
 * so a reload does not offer sending the same mail again; the send step only offers to record the submission.
 */
export interface UnsavedGmailSend {
  threadId: string
  at: number
}

const unsavedKey = (claimId: string) => `gmailSentUnsaved:${claimId}`

function isUnsavedGmailSend(value: unknown): value is UnsavedGmailSend {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.threadId === 'string' && typeof v.at === 'number'
}

/** The unsaved Gmail send of a claim on this device, or null when there is none. */
export async function readUnsavedGmailSend(db: AppDB, claimId: string): Promise<UnsavedGmailSend | null> {
  const row = await db.settings.get(unsavedKey(claimId))
  return row && isUnsavedGmailSend(row.value) ? row.value : null
}

async function rememberUnsavedGmailSend(db: AppDB, claimId: string, threadId: string): Promise<void> {
  const value: UnsavedGmailSend = { threadId, at: now() }
  await db.settings.put({ key: unsavedKey(claimId), value, updatedAt: value.at })
}

/** Writes the submitted status after Gmail accepted the mail. A thrown write counts as a failed one. */
async function saveSubmitted(db: AppDB, claimId: string, threadId: string): Promise<boolean> {
  try {
    const saved = await setStatus(
      db,
      claimId,
      'submitted',
      { submittedAt: now(), sentVia: 'gmail', gmailThreadId: threadId, lastSubmittedFileIds: await submittedFileIds(db, claimId) },
      { note: '' },
    )
    return saved.ok
  } catch {
    return false
  }
}

/**
 * Records a submission whose Gmail send succeeded but whose status write failed. Retries the status write only; the
 * mail is never sent again. The device marker is removed once the status is saved.
 */
export async function markSubmittedAfterSend(db: AppDB, claimId: string): Promise<SendResult> {
  const unsaved = await readUnsavedGmailSend(db, claimId)
  if (unsaved === null) return { ok: false, error: 'send.notReady' }
  const saved = await saveSubmitted(db, claimId, unsaved.threadId)
  if (!saved) return { ok: false, error: 'send.saveFailed', threadId: unsaved.threadId }
  await db.settings.delete(unsavedKey(claimId))
  return { ok: true, claimId, threadId: unsaved.threadId }
}

/** Claims with a send in progress in this page session. Checked and set before the first await. */
const inFlight = new Set<string>()

/**
 * Builds one email and sends it from the connected Gmail account. On success the claim becomes `submitted` with
 * sentVia "gmail", the thread id and submittedAt, and lastSubmittedFileIds lists the photos now on the claim.
 * On any failure the claim is left as it was. A second call for the same claim while a send is in flight returns
 * `send.inProgress` and sends nothing.
 */
export async function sendClaimByGmail(db: AppDB, claimId: string, input: GmailSendInput): Promise<SendResult> {
  if (!navigator.onLine) return { ok: false, error: 'send.offline' }
  if (inFlight.has(claimId)) return { ok: false, error: 'send.inProgress' }
  inFlight.add(claimId)
  try {
    const unsaved = await readUnsavedGmailSend(db, claimId)
    if (unsaved !== null) return { ok: false, error: 'send.alreadySent', threadId: unsaved.threadId }
    return await sendOnce(db, claimId, input)
  } finally {
    inFlight.delete(claimId)
  }
}

async function sendOnce(db: AppDB, claimId: string, input: GmailSendInput): Promise<SendResult> {
  const claim = await getClaim(db, claimId)
  if (!claim || (claim.status !== 'ready' && claim.status !== 'need_info')) {
    return { ok: false, error: 'send.notReady' }
  }

  const session = gmailSession.value
  const token = accessToken()
  if (token === null || session.status !== 'connected') return { ok: false, error: 'send.notConnected' }

  let mime: Uint8Array<ArrayBuffer>
  try {
    // buildMime encodes with TextEncoder and base64, so its bytes are always ArrayBuffer-backed.
    mime = buildMime({
      from: session.email,
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      text: input.body,
      attachments: input.files,
    }) as Uint8Array<ArrayBuffer>
  } catch (e) {
    if (e instanceof MimeError) return { ok: false, error: 'send.invalidMessage' }
    throw e
  }

  let sent: { id: string; threadId: string }
  try {
    sent = await sendMessage(token, mime)
  } catch (e) {
    if (e instanceof TokenExpiredError) {
      invalidateToken()
      return { ok: false, error: 'send.tokenExpired' }
    }
    if (e instanceof GmailError) return { ok: false, error: 'send.failed', status: e.status }
    return { ok: false, error: 'send.failed', status: 0 }
  }

  if (!(await saveSubmitted(db, claimId, sent.threadId))) {
    await rememberUnsavedGmailSend(db, claimId, sent.threadId).catch(() => {})
    return { ok: false, error: 'send.saveFailed', threadId: sent.threadId }
  }
  return { ok: true, claimId, threadId: sent.threadId }
}

/** Photo and invoice file ids the claim holds now; these are the ones a submission sends. */
export async function submittedFileIds(db: AppDB, claimId: string): Promise<string[]> {
  return (await listClaimDocuments(db, claimId)).flatMap((d) => d.fileIds)
}

/** Everything the review step reads about a claim. The claim's documents are its own, live or not. */
export interface ClaimContext {
  claim: Claim
  account: Account
  administrator: AdministratorConfig
  requirements: ClaimRequirements
  patient: Person
  holder: Person
  documents: DocumentRecord[]
}

export interface Readiness {
  /** Requirements that apply to the claim, in dataset order. */
  applicable: Requirement[]
  /** Required requirements with no document of their categories. */
  missingDocs: Requirement[]
  form: ClaimFormData
  /** Form fields still empty, and invoices without a confirmed amount. */
  missingFields: FormFieldKey[]
}

/** What is missing before the two PDFs can be built (claim-submission.ready.*). */
export function readiness(ctx: ClaimContext): Readiness {
  const live = ctx.documents.filter((d) => d.deleted === 0)
  const applicable = applicableRequirements(ctx.requirements, ctx.claim, live)
  const form = buildClaimFormData({
    claim: ctx.claim,
    patient: ctx.patient,
    holder: ctx.holder,
    defaultBank: ctx.account.defaultBank,
    documents: live,
  })
  return {
    applicable,
    missingDocs: missingRequired(applicable, live),
    form,
    missingFields: missingFields(form),
  }
}

export const canBuild = (r: Readiness): boolean => r.missingDocs.length === 0 && r.missingFields.length === 0

/** What the claim email reads: no requirements, no form. */
export type EmailContext = Pick<ClaimContext, 'account' | 'administrator' | 'claim' | 'patient' | 'holder' | 'documents'>

/** The claim email for the account and administrator; the subject gets its [Bổ sung] prefix from the status. */
export function composeClaimEmail(ctx: EmailContext): ComposeResult {
  const invoices = ctx.documents
    .filter((d) => d.deleted === 0 && d.category === 'invoice' && d.amountConfirmed && d.amount !== null)
    .map((d) => ({ docDate: d.docDate, amount: d.amount ?? 0 }))
  return composeEmail({
    account: ctx.account,
    administrator: ctx.administrator,
    claim: ctx.claim,
    person: ctx.patient,
    holder: ctx.holder,
    fileNames: [formFileName(ctx.claim.reason), docsFileName(ctx.claim.reason)],
    invoices,
  })
}

/** Gmail web link to a thread. The app only opens it; it never replies into it. */
export function threadUrl(threadId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(threadId)}`
}

export interface BundleFile {
  name: string
  mime: 'application/pdf'
  bytes: Uint8Array
  blob: Blob
}

/**
 * The two stored PDFs of the claim with their file names, form first. Null when the bundle is not complete (for
 * example a file was removed). Reads from the database, so the send step works after a reload and offline.
 */
export async function loadBundleFiles(db: AppDB, claim: Pick<Claim, 'bundleFileIds' | 'reason'>): Promise<BundleFile[] | null> {
  if (claim.bundleFileIds.length !== 2) return null
  const records = await Promise.all(claim.bundleFileIds.map((id) => getStoredFile(db, id)))
  const [form, attachments] = records
  if (!form || !attachments) return null
  const names = [formFileName(claim.reason), docsFileName(claim.reason)]
  const out: BundleFile[] = []
  for (const [index, record] of [form, attachments].entries()) {
    out.push({
      name: names[index],
      mime: 'application/pdf',
      bytes: new Uint8Array(await record.blob.arrayBuffer()),
      blob: record.blob,
    })
  }
  return out
}

/** Records that the user sent the mail themselves (mailto). Only this call marks a mailto claim submitted. */
export async function markSentByMailto(db: AppDB, claimId: string): Promise<ClaimResult> {
  const fileIds = await submittedFileIds(db, claimId)
  return setStatus(db, claimId, 'submitted', { submittedAt: now(), sentVia: 'mailto', lastSubmittedFileIds: fileIds }, { note: '' })
}

export type BuildError =
  | 'build.notReady'
  | 'build.noNewPhotos'
  | 'build.fileMissing'
  | 'build.storeFailed'
  | 'build.statusFailed'

export type BuildOutcome = { ok: true } | { ok: false; error: BuildError } | { ok: false; error: 'build.tooLarge'; tooLarge: TooLarge }

export interface BuildOptions {
  /** Loads the template and fonts. Defaults to the bundled files. */
  loadAssets?: () => Promise<FormAssets>
  /** Image encoder for the size steps. Defaults to the browser encoder. */
  encode?: ImageEncoder
}

const mimeOf = (mime: string): AttachmentItem['mime'] =>
  mime === 'image/png' ? 'image/png' : mime === 'application/pdf' ? 'application/pdf' : 'image/jpeg'

/** Documents in checklist order: the first requirement whose categories include the document's category wins. */
function checklistOrder(applicable: Requirement[], documents: DocumentRecord[]): DocumentRecord[] {
  const rank = (d: DocumentRecord) => {
    const index = applicable.findIndex((r) => r.categories.includes(d.category))
    return index === -1 ? applicable.length : index
  }
  return documents
    .filter((d) => d.deleted === 0 && d.fileIds.length > 0)
    .sort((a, b) => rank(a) - rank(b) || a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

/**
 * Builds the claim form and the attachment PDF and stores them as the claim's bundle. A draft becomes ready. A
 * need_info claim gets a supplement: only the photos not sent with the last submission. Nothing is stored when the
 * bundle is too large. Runs only from the user's tap on the build action.
 */
export async function buildClaimFiles(db: AppDB, ctx: ClaimContext, options: BuildOptions = {}): Promise<BuildOutcome> {
  const r = readiness(ctx)
  if (!canBuild(r)) return { ok: false, error: 'build.notReady' }

  const supplement = ctx.claim.status === 'need_info'
  const sent = new Set(supplement ? ctx.claim.lastSubmittedFileIds : [])
  const items: AttachmentItem[] = []
  for (const doc of checklistOrder(r.applicable, ctx.documents)) {
    const fresh = doc.fileIds.filter((id) => !sent.has(id))
    for (const [index, fileId] of fresh.entries()) {
      const record = await getStoredFile(db, fileId)
      if (!record) return { ok: false, error: 'build.fileMissing' }
      const base = t(`documents.category.${doc.category}`)
      items.push({
        id: fileId,
        label: fresh.length > 1 ? `${base} (${index + 1}/${fresh.length})` : base,
        mime: mimeOf(record.mime),
        bytes: new Uint8Array(await record.blob.arrayBuffer()),
      })
    }
  }
  if (items.length === 0) return { ok: false, error: supplement ? 'build.noNewPhotos' : 'build.notReady' }

  const [forms, attachments] = await Promise.all([import('../lib/claim-form-pdf'), import('../lib/attachments-pdf')])
  const assets = await (options.loadAssets ?? forms.loadFormAssets)()
  const form = await forms.renderClaimForm(r.form, assets)
  const built = await attachments.buildAttachments(
    { form, items },
    {
      maxBytes: ctx.administrator.maxAttachmentBytes,
      labelFont: assets.regularFont,
      encode: options.encode ?? attachments.browserEncodeJpeg,
    },
  )
  if ('tooLarge' in built) return { ok: false, error: 'build.tooLarge', tooLarge: built.tooLarge }

  const stored = await storeClaimBundle(db, ctx.claim.id, [{ bytes: built.files.form }, { bytes: built.files.document }])
  if (!stored.ok) return { ok: false, error: 'build.storeFailed' }
  if (ctx.claim.status === 'draft') {
    const moved = await setStatus(db, ctx.claim.id, 'ready', {}, { note: '' })
    if (!moved.ok) return { ok: false, error: 'build.statusFailed' }
  }
  return { ok: true }
}
