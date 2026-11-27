// Composes the claim email: recipients, subject, Vietnamese body and the mailto: fallback URL.
import { formatDateVi } from '../lib/format-date'
import { formatVnd } from '../lib/money'
import type { Claim } from './claim-types'
import type { AdministratorConfig } from './requirements-schema'
import type { Account, Person } from './types'

/** Longest mailto: URL the fallback is allowed to produce. */
export const MAILTO_MAX_LENGTH = 1800

export interface EmailInvoice {
  docDate: string | null
  /** Whole VND. */
  amount: number
}

export interface ComposeInput {
  /** Only the account's claim settings are read. */
  account: Pick<Account, 'claimEmail' | 'claimCc'>
  administrator: AdministratorConfig
  claim: Claim
  /** The insured person the claim is for. */
  person: Person
  /** The employee (holder) of the policy. Defaults to `person` when not given. */
  holder?: Person | null
  /** Attachment names, in the order they are attached. */
  fileNames: readonly string[]
  /** Confirmed invoices of the claim. Listed in the body; shortened when the URL gets too long. */
  invoices?: readonly EmailInvoice[]
}

export interface ComposedEmail {
  to: string
  cc: string[]
  subject: string
  body: string
  /** `mailto:` URL with cc, subject and body, at most MAILTO_MAX_LENGTH characters. */
  mailto: string
}

export type ComposeResult = { ok: true; email: ComposedEmail } | { ok: false; error: 'error.recipientMissing' }

type BodyMode = 'full' | 'summary'

/** Each address once (case-insensitive), trimmed, empties dropped, first spelling kept. */
function uniqueAddresses(list: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const address of list) {
    const key = address.trim().toLowerCase()
    if (key === '' || seen.has(key)) continue
    seen.add(key)
    out.push(address.trim())
  }
  return out
}

/**
 * The recipient and CC a claim goes to. The account's own values win; an unset recipient (null) or an empty CC list
 * means "use the administrator's default", so the settings form always shows what will be used.
 */
export function claimRouting(
  account: Pick<Account, 'claimEmail' | 'claimCc'>,
  administrator: Pick<AdministratorConfig, 'claimEmail' | 'cc'>,
): { to: string; cc: string[] } {
  const own = uniqueAddresses(account.claimCc)
  return {
    to: account.claimEmail?.trim() || administrator.claimEmail.trim(),
    cc: own.length > 0 ? own : uniqueAddresses(administrator.cc),
  }
}

/**
 * What to store for the routing the user typed: a value equal to the administrator default is stored as "unset"
 * (null / []), so a later change of the default reaches the account; anything the user changed is stored as typed.
 */
export function routingToStore(
  typed: { to: string; cc: readonly string[] },
  administrator: Pick<AdministratorConfig, 'claimEmail' | 'cc'>,
): { claimEmail: string | null; claimCc: string[] } {
  const to = typed.to.trim()
  const cc = uniqueAddresses(typed.cc)
  const fold = (list: readonly string[]) => uniqueAddresses(list).map((e) => e.toLowerCase()).join(',')
  return {
    claimEmail: to.toLowerCase() === administrator.claimEmail.trim().toLowerCase() ? null : to,
    claimCc: fold(cc) === fold(administrator.cc) ? [] : cc,
  }
}

function recipientOf(input: ComposeInput): string | null {
  const address = claimRouting(input.account, input.administrator).to
  return address === '' ? null : address
}

function ccOf(input: ComposeInput): string[] {
  return claimRouting(input.account, input.administrator).cc
}

function subjectOf(input: ComposeInput): string {
  const { administrator, claim, person } = input
  const base = administrator.subjectTemplate
    .replaceAll('{patientName}', person.fullName)
    .replaceAll('{contractCode}', person.contractCode ?? '')
    .replaceAll('{policyholderName}', person.policyholderName ?? '')
  return claim.status === 'need_info' ? `[Bổ sung] ${base}` : base
}

function invoiceLines(invoices: readonly EmailInvoice[], mode: BodyMode): string[] {
  if (invoices.length === 0) return []
  if (mode === 'summary') return [`Chi tiết hóa đơn: ${invoices.length} hóa đơn, xem trong tệp đính kèm.`]
  const sorted = [...invoices].sort((a, b) => (a.docDate ?? '￿').localeCompare(b.docDate ?? '￿'))
  return [
    'Chi tiết hóa đơn:',
    ...sorted.map((inv) => `- ${inv.docDate === null ? 'chưa rõ ngày' : formatDateVi(inv.docDate)}: ${formatVnd(inv.amount)}`),
  ]
}

function bodyOf(input: ComposeInput, mode: BodyMode): string {
  const { claim, person, fileNames } = input
  const holder = input.holder ?? person
  const lines = [
    'Kính gửi PTI,',
    '',
    `Gửi hồ sơ yêu cầu bồi thường: ${claim.reason}.`,
    `Người được bảo hiểm: ${person.fullName}`,
    `Nhân viên: ${holder.fullName}`,
    `Ngày điều trị: ${formatDateVi(claim.treatmentDate)}`,
    `Cơ sở y tế: ${claim.facilityName}`,
    `Tổng số tiền yêu cầu: ${formatVnd(claim.totalClaimed)}`,
    ...invoiceLines(input.invoices ?? [], mode),
    'Tệp đính kèm:',
    ...fileNames.map((name) => `- ${name}`),
    '',
    'Trân trọng.',
  ]
  return lines.join('\n')
}

function mailtoOf(to: string, cc: string[], subject: string, body: string): string {
  const params: Array<[string, string]> = [
    ['cc', cc.join(',')],
    ['subject', subject],
    ['body', body],
  ]
  const query = params
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&')
  return `mailto:${encodeURIComponent(to)}${query === '' ? '' : `?${query}`}`
}

/**
 * Composes the claim email. Shortening, in order: the invoice list becomes one summary line; then the body is cut
 * from the end until the mailto: URL fits MAILTO_MAX_LENGTH.
 */
export function composeEmail(input: ComposeInput): ComposeResult {
  const to = recipientOf(input)
  if (to === null) return { ok: false, error: 'error.recipientMissing' }

  const cc = ccOf(input)
  const subject = subjectOf(input)
  const fits = (body: string) => mailtoOf(to, cc, subject, body).length <= MAILTO_MAX_LENGTH

  const modes: BodyMode[] = (input.invoices ?? []).length > 0 ? ['full', 'summary'] : ['full']
  let body = bodyOf(input, modes[0])
  for (const mode of modes) {
    body = bodyOf(input, mode)
    if (fits(body)) return finished(to, cc, subject, body)
  }

  // Last resort: keep the longest prefix (by code point) whose URL fits, with an ellipsis.
  const chars = Array.from(body)
  let lo = 0
  let hi = chars.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (fits(chars.slice(0, mid).join('') + '…')) lo = mid
    else hi = mid - 1
  }
  body = chars.slice(0, lo).join('') + '…'
  return finished(to, cc, subject, body)
}

function finished(to: string, cc: string[], subject: string, body: string): ComposeResult {
  return { ok: true, email: { to, cc, subject, body, mailto: mailtoOf(to, cc, subject, body) } }
}
