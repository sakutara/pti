import { describe, it, expect } from 'vitest'
import marshJson from '../../public/data/administrators/marsh.json'
import { composeEmail } from '../../src/domain/email'
import { formFileName, docsFileName } from '../../src/domain/file-names'
import { parseAdministrator, type AdministratorConfig } from '../../src/domain/requirements-schema'
import type { Claim, ClaimStatus } from '../../src/domain/claim-types'
import type { Account, Person } from '../../src/domain/types'

const parsed = parseAdministrator(marshJson)
if (!parsed.ok) throw new Error(parsed.error)
const MARSH: AdministratorConfig = parsed.data

function accountOf(overrides: Partial<Account> = {}): Account {
  return {
    id: 'account-1',
    displayName: 'Nguyễn Văn A',
    administrator: 'marsh',
    claimEmail: null,
    claimCc: [],
    defaultBank: null,
    onboardedAt: 1,
    updatedAt: 1,
    deleted: 0,
    ...overrides,
  }
}

function personOf(overrides: Partial<Person> = {}): Person {
  return {
    id: 'person-1',
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
    ...overrides,
  }
}

function claimOf(overrides: Partial<Claim> = {}): Claim {
  return {
    id: 'claim-1',
    personId: 'person-1',
    type: 'optical',
    status: 'ready' as ClaimStatus,
    treatmentDate: '2026-11-20',
    facilityId: null,
    facilityName: 'Phòng khám mẫu',
    reason: 'kính mắt',
    originalsSubmittedAt: null,
    daysOff: 0,
    admissionDate: null,
    dischargeDate: null,
    bank: null,
    notApplicable: [],
    diagnosis: 'Cận thị',
    flags: {},
    totalClaimed: 750000,
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

const FILES = ['GYC bồi thường kính mắt.pdf', 'Chứng từ kính mắt.pdf']

function compose(overrides: Partial<Parameters<typeof composeEmail>[0]> = {}) {
  const result = composeEmail({
    account: accountOf(),
    administrator: MARSH,
    claim: claimOf(),
    person: personOf(),
    fileNames: FILES,
    ...overrides,
  })
  if (!result.ok) throw new Error(result.error)
  return result.email
}

/** Decodes the query of a mailto URL the way a mail client does. */
function mailtoParams(mailto: string): Record<string, string> {
  const query = mailto.slice(mailto.indexOf('?') + 1)
  const out: Record<string, string> = {}
  for (const part of query.split('&')) {
    const eq = part.indexOf('=')
    out[part.slice(0, eq)] = decodeURIComponent(part.slice(eq + 1).replace(/\+/g, ' '))
  }
  return out
}

describe('claim-submission.email: recipients', () => {
  it('claim-submission.email.recipient-default: without an override the recipient is the administrator and CC has Marsh', () => {
    const email = compose()
    expect(email.to).toBe('nhanhsbt.mn@pti.com.vn')
    expect(email.cc).toContain('vietnamMMBclaims@marsh.com')
  })

  it('claim-submission.email.recipient-account: the account claimEmail overrides the recipient, CC holds Marsh and the account CC once each', () => {
    const email = compose({ account: accountOf({ claimEmail: 'claims@example.com', claimCc: ['me@example.com'] }) })
    expect(email.to).toBe('claims@example.com')
    expect(email.cc).toEqual(['vietnamMMBclaims@marsh.com', 'me@example.com'])
  })

  it('claim-submission.email.recipient-account: a CC address given twice is listed once', () => {
    const email = compose({
      account: accountOf({ claimCc: ['vietnamMMBclaims@marsh.com', 'me@example.com', 'me@example.com'] }),
    })
    expect(email.cc).toEqual(['vietnamMMBclaims@marsh.com', 'me@example.com'])
  })

  it('claim-submission.email.no-recipient: with no address on the account or the administrator, composing fails with a code', () => {
    const result = composeEmail({
      account: accountOf({ claimEmail: null }),
      administrator: { ...MARSH, claimEmail: '' },
      claim: claimOf(),
      person: personOf(),
      fileNames: FILES,
    })
    expect(result).toEqual({ ok: false, error: 'error.recipientMissing' })
  })
})

describe('claim-submission.email: subject and body', () => {
  it('claim-submission.email.subject: patient, contract number and policyholder fill the subject template', () => {
    expect(compose().subject).toBe('HS YCBT – Nguyễn Văn A – HD-001 – Công ty Mẫu')
  })

  it('claim-submission.supplement.subject: a need_info claim gets the "[Bổ sung] " prefix', () => {
    const email = compose({ claim: claimOf({ status: 'need_info' }) })
    expect(email.subject.startsWith('[Bổ sung] HS YCBT – ')).toBe(true)
    expect(email.subject).toBe('[Bổ sung] HS YCBT – Nguyễn Văn A – HD-001 – Công ty Mẫu')
  })

  it('claim-submission.email.subject: the body names the patient, the total and the attachments in Vietnamese', () => {
    const email = compose({ holder: personOf({ fullName: 'Nguyễn Văn A' }) })
    expect(email.body).toContain('Nguyễn Văn A')
    expect(email.body).toContain('750.000 đ')
    expect(email.body).toContain('GYC bồi thường kính mắt.pdf')
    expect(email.body).toContain('Chứng từ kính mắt.pdf')
  })

  it('claim-submission.email.length: the mailto URL decodes back to the recipient, subject and body', () => {
    const email = compose()
    expect(email.mailto.startsWith('mailto:')).toBe(true)
    expect(decodeURIComponent(email.mailto.slice('mailto:'.length, email.mailto.indexOf('?')))).toBe(
      'nhanhsbt.mn@pti.com.vn',
    )
    const params = mailtoParams(email.mailto)
    expect(params.subject).toBe(email.subject)
    expect(params.body).toBe(email.body)
    expect(params.cc).toBe('vietnamMMBclaims@marsh.com')
  })
})

describe('claim-submission.email.length: mailto size', () => {
  it('claim-submission.email.length: a claim with 30 invoices keeps the mailto URL at most 1800 characters', () => {
    const invoices = Array.from({ length: 30 }, (_, i) => ({
      docDate: `2026-11-${String((i % 28) + 1).padStart(2, '0')}`,
      amount: 300000 + i * 1000,
    }))
    const email = compose({ invoices, claim: claimOf({ totalClaimed: 30 * 300000 }) })
    expect(email.mailto.length).toBeLessThanOrEqual(1800)
    expect(mailtoParams(email.mailto).subject).toBe(email.subject)
  })

  it('claim-submission.email.length: long invoice lists are shortened to a summary line before anything else', () => {
    const invoices = Array.from({ length: 30 }, () => ({ docDate: '2026-11-18', amount: 300000 }))
    const email = compose({ invoices, claim: claimOf({ totalClaimed: 9000000 }) })
    expect(email.body).toContain('30 hóa đơn')
    expect(email.body).not.toContain('18/11/2026: 300.000 đ')
  })

  it('claim-submission.email.length: a body that is still too long is cut so the URL fits', () => {
    const longFacility = 'Phòng khám rất dài '.repeat(200)
    const email = compose({ claim: claimOf({ facilityName: longFacility }) })
    expect(email.mailto.length).toBeLessThanOrEqual(1800)
  })

  it('claim-submission.email.length: short claims keep the full invoice list', () => {
    const invoices = [{ docDate: '2026-11-18', amount: 300000 }]
    const email = compose({ invoices, claim: claimOf({ totalClaimed: 300000 }) })
    expect(email.body).toContain('18/11/2026: 300.000 đ')
  })
})

describe('claim-submission.email: file names', () => {
  it('claim-submission.attachments.two-files: the form and the document file names follow the pattern', () => {
    expect(formFileName('kính mắt')).toBe('GYC bồi thường kính mắt.pdf')
    expect(docsFileName('kính mắt')).toBe('Chứng từ kính mắt.pdf')
  })

  it('claim-submission.attachments.two-files: characters that are not allowed in file names are removed', () => {
    expect(formFileName('kính/mắt: "đục"?')).toBe('GYC bồi thường kínhmắt đục.pdf')
    expect(docsFileName('a\\b*c<d>e|f')).toBe('Chứng từ abcdef.pdf')
  })

  it('claim-submission.attachments.two-files: a long reason is cut so the whole name is at most 80 characters and keeps .pdf', () => {
    const name = docsFileName('x'.repeat(200))
    expect([...name].length).toBeLessThanOrEqual(80)
    expect(name.endsWith('.pdf')).toBe(true)
    expect(name.startsWith('Chứng từ xxx')).toBe(true)
  })
})
