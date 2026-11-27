import { describe, expect, it } from 'vitest'
import { buildClaimFormData, missingFields } from '../../src/domain/claim-form'
import type { Claim } from '../../src/domain/claim-types'
import type { DocumentRecord } from '../../src/domain/document-types'
import type { BankAccount, Person } from '../../src/domain/types'

// Fake data only.
const holder: Person = {
  id: 'p-holder', accountId: 'a1', role: 'holder', relation: 'self', memberType: 'employee',
  fullName: 'Nguyễn Văn A', dateOfBirth: '1990-01-02', idNumber: null, phone: '0900000001', email: 'holder@example.com',
  address: null, employeeCode: 'NV-001', jobTitle: 'Kỹ sư phần mềm', tier: 3, policyholderName: 'Công ty Mẫu',
  contractCode: 'HD-001', cardNumber: null, cardValidFrom: null, cardValidTo: null, cardFrontFileId: null,
  cardBackFileId: null, bank: null, updatedAt: 1, deleted: 0,
}

const dependent: Person = {
  ...holder, id: 'p-dep', role: 'dependent', relation: 'child', memberType: 'sponsored', fullName: 'Nguyễn Thị B',
  dateOfBirth: '2015-05-06', phone: null, email: null, employeeCode: null, jobTitle: null, tier: 2,
}

const defaultBank: BankAccount = { bankName: 'Ngân hàng Mẫu', accountName: 'NGUYEN VAN A', accountNumber: '000111222333' }

const claim: Claim = {
  id: 'c1', personId: 'p-dep', type: 'outpatient', status: 'draft', treatmentDate: '2026-11-18', facilityId: null,
  facilityName: 'Phòng khám Mẫu', reason: 'khám mắt', originalsSubmittedAt: null, daysOff: 0, admissionDate: null,
  dischargeDate: null, bank: null, notApplicable: [], diagnosis: 'Tật khúc xạ, cận thị', flags: {}, totalClaimed: 0,
  approvedAmount: null, rejectionReason: null, submittedAt: null, bundleFileIds: [], wizardStep: 5, sentVia: null,
  gmailThreadId: null, lastSubmittedFileIds: [], updatedAt: 1, deleted: 0,
}

function invoice(id: string, docDate: string | null, amount: number | null, overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id, personId: 'p-dep', claimId: 'c1', category: 'invoice', fileIds: [`f-${id}`], docDate, amount,
    amountSource: 'manual', amountConfirmed: true, ocrStatus: 'none', ocrText: null, ocrCandidates: [],
    lowResolution: false, createdAt: 1, updatedAt: 1, deleted: 0, ...overrides,
  }
}

function build(overrides: { claim?: Partial<Claim>; patient?: Person; documents?: DocumentRecord[] } = {}) {
  return buildClaimFormData({
    claim: { ...claim, ...overrides.claim },
    patient: overrides.patient ?? dependent,
    holder,
    defaultBank,
    documents: overrides.documents ?? [invoice('i1', '2026-11-18', 300000), invoice('i2', '2026-11-20', 450000)],
  })
}

describe('buildClaimFormData', () => {
  it('claim-submission.form.fields: patient fields come from the dependent, employee fields from the holder', () => {
    const data = build()
    expect(data.patientName).toBe('Nguyễn Thị B')
    expect(data.patientDob).toBe('06/05/2015')
    expect(data.patientTier).toBe('2')
    expect(data.employeeName).toBe('Nguyễn Văn A')
    expect(data.employeeCode).toBe('NV-001')
    expect(data.jobTitle).toBe('Kỹ sư phần mềm')
    expect(data.employeeEmail).toBe('holder@example.com')
  })

  it('claim-submission.form.fields: policyholder, contract, payout bank, days off, visit, diagnosis and facility keep their diacritics', () => {
    const data = build()
    expect(data.policyholderName).toBe('Công ty Mẫu')
    expect(data.contractCode).toBe('HD-001')
    expect(data.accountNumber).toBe('000111222333')
    expect(data.bankName).toBe('Ngân hàng Mẫu')
    expect(data.beneficiary).toBe('NGUYEN VAN A')
    expect(data.daysOff).toBe(0)
    expect(data.visitDate).toBe('18/11/2026')
    expect(data.diagnosis).toBe('Tật khúc xạ, cận thị')
    expect(data.facilityName).toBe('Phòng khám Mẫu')
    expect(data.patientPhone).toBe('0900000001')
  })

  it('claim-submission.form.fields: the claim bank overrides the person bank, which overrides the account default', () => {
    const claimBank: BankAccount = { bankName: 'Ngân hàng Claim', accountName: 'CLAIM', accountNumber: '999' }
    const personBank: BankAccount = { bankName: 'Ngân hàng Người', accountName: 'PERSON', accountNumber: '888' }
    expect(build({ claim: { bank: claimBank }, patient: { ...dependent, bank: personBank } }).accountNumber).toBe('999')
    expect(build({ patient: { ...dependent, bank: personBank } }).accountNumber).toBe('888')
    expect(build().accountNumber).toBe('000111222333')
  })

  it('claim-submission.form.fields: the patient phone falls back to the holder phone when empty', () => {
    expect(build({ patient: { ...dependent, phone: null } }).patientPhone).toBe('0900000001')
  })

  it('claim-submission.form.expenses: invoices are listed by date with the total in figures and words', () => {
    const data = build()
    expect(data.expenses).toEqual([
      { date: '18/11/2026', amount: 300000 },
      { date: '20/11/2026', amount: 450000 },
    ])
    expect(data.totalAmount).toBe(750000)
    expect(data.totalWords).toBe('bảy trăm năm mươi nghìn đồng chẵn')
    expect(data.unconfirmedInvoices).toBe(0)
  })

  it('claim-submission.form.words: total 2718900 gives "hai triệu bảy trăm mười tám nghìn chín trăm đồng chẵn"', () => {
    const data = build({ documents: [invoice('i1', '2026-11-20', 2718900)] })
    expect(data.totalWords).toBe('hai triệu bảy trăm mười tám nghìn chín trăm đồng chẵn')
  })

  it('claim-submission.form.expenses: only live, confirmed invoices of this claim count', () => {
    const data = build({
      documents: [
        invoice('ok', '2026-11-18', 100000),
        invoice('deleted', '2026-11-18', 900000, { deleted: 1 }),
        invoice('other-claim', '2026-11-18', 800000, { claimId: 'c2' }),
        invoice('not-invoice', '2026-11-18', 700000, { category: 'prescription' }),
        invoice('unconfirmed', '2026-11-18', 600000, { amountConfirmed: false }),
      ],
    })
    expect(data.expenses).toEqual([{ date: '18/11/2026', amount: 100000 }])
    expect(data.totalAmount).toBe(100000)
    expect(data.unconfirmedInvoices).toBe(1)
  })
})

describe('missingFields', () => {
  it('claim-submission.ready.missing: a holder without employee number is listed as missing', () => {
    const data = buildClaimFormData({
      claim, patient: holder, holder: { ...holder, employeeCode: null }, defaultBank,
      documents: [invoice('i1', '2026-11-18', 100000)],
    })
    expect(missingFields(data)).toEqual(['employeeCode'])
  })

  it('claim-submission.ready.missing: a complete claim has no missing fields', () => {
    expect(missingFields(build())).toEqual([])
  })

  it('claim-submission.ready.form-fields: each empty required field is reported', () => {
    const cases: Array<[string, Parameters<typeof build>[0]]> = [
      ['reason', { claim: { reason: '' } }],
      ['visitDate', { claim: { treatmentDate: '' } }],
      ['facilityName', { claim: { facilityName: '  ' } }],
      ['diagnosis', { claim: { diagnosis: null } }],
      ['patientName', { patient: { ...dependent, fullName: '' } }],
      ['patientDob', { patient: { ...dependent, dateOfBirth: '' } }],
      ['patientTier', { patient: { ...dependent, tier: undefined as unknown as Person['tier'] } }],
      ['policyholderName', { patient: { ...dependent, policyholderName: null } }],
      ['contractCode', { patient: { ...dependent, contractCode: null } }],
    ]
    for (const [field, overrides] of cases) {
      const data = build(overrides)
      expect(missingFields(data), field).toContain(field)
    }
  })

  it('claim-submission.ready.form-fields: the phone is missing only when neither the person nor the holder has one', () => {
    const noPhones = buildClaimFormData({
      claim, patient: { ...dependent, phone: null }, holder: { ...holder, phone: null }, defaultBank,
      documents: [invoice('i1', '2026-11-18', 1)],
    })
    expect(missingFields(noPhones)).toEqual(['patientPhone'])
  })

  it('claim-submission.ready.form-fields: employee, job, email and bank gaps are reported', () => {
    const noBank = buildClaimFormData({ claim, patient: dependent, holder, defaultBank: null, documents: [invoice('i1', '2026-11-18', 1)] })
    expect(missingFields(noBank)).toContain('bank')
    expect(missingFields(build({ patient: { ...dependent, bank: null } }))).not.toContain('bank')

    const holderGaps = buildClaimFormData({
      claim, patient: dependent, defaultBank,
      holder: { ...holder, fullName: '', jobTitle: null, email: null },
      documents: [invoice('i1', '2026-11-18', 1)],
    })
    expect(missingFields(holderGaps)).toEqual(expect.arrayContaining(['employeeName', 'jobTitle', 'employeeEmail']))
  })

  it('claim-submission.ready.unconfirmed-amount: an unconfirmed invoice is reported and blocks readiness', () => {
    const data = build({ documents: [invoice('i1', '2026-11-18', 100000), invoice('i2', '2026-11-19', 50000, { amountConfirmed: false })] })
    expect(missingFields(data)).toEqual(['unconfirmedInvoices'])
  })

  it('claim-submission.ready.missing: a claim without confirmed invoices reports the invoices gap', () => {
    expect(missingFields(build({ documents: [] }))).toEqual(['invoices'])
  })
})
