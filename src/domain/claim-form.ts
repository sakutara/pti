/*
 * Dữ liệu điền vào giấy yêu cầu bồi thường (mẫu trong public/forms). Ánh xạ theo knowledge/domain/claim-form.md:
 * NĐBH của claim cho tên, ngày sinh, hạng, chủ hợp đồng, số hợp đồng; điện thoại lấy của nhân viên khi trống;
 * nhân viên (NĐBH chính) cho tên, mã số, chức danh, email; tài khoản nhận tiền: claim.bank > NĐBH.bank > mặc định.
 * Chỉ hóa đơn (category 'invoice'), chưa xóa, thuộc claim này được đưa vào bảng kê; hóa đơn chưa xác nhận số tiền
 * không vào tổng mà được đếm riêng để chặn trạng thái sẵn sàng.
 */
import type { Claim } from './claim-types'
import type { DocumentRecord } from './document-types'
import type { BankAccount, Person } from './types'
import { amountInWords } from './vn-number-words'

export interface ExpenseRow {
  /** DD/MM/YYYY */
  date: string
  /** Whole VND */
  amount: number
}

export interface ClaimFormData {
  reason: string | null
  policyholderName: string | null
  contractCode: string | null
  patientName: string | null
  /** DD/MM/YYYY */
  patientDob: string | null
  patientTier: string | null
  patientPhone: string | null
  employeeName: string | null
  employeeCode: string | null
  jobTitle: string | null
  employeeEmail: string | null
  accountNumber: string | null
  bankName: string | null
  bankAddress: string | null
  beneficiary: string | null
  daysOff: number
  /** DD/MM/YYYY */
  visitDate: string | null
  diagnosis: string | null
  facilityName: string | null
  /** DD/MM/YYYY */
  admissionDate: string | null
  dischargeDate: string | null
  /** Table rows in date order (oldest first). */
  expenses: ExpenseRow[]
  /** Sum of the confirmed invoices, whole VND. */
  totalAmount: number
  /** "2.718.900" */
  totalAmountText: string
  /** Null when the total is zero. */
  totalWords: string | null
  /** Live invoices of the claim whose amount is not confirmed yet; they are left out of the table and the total. */
  unconfirmedInvoices: number
}

/** Field keys reported by `missingFields`; the UI maps them to labels. */
export type FormFieldKey =
  | 'reason'
  | 'visitDate'
  | 'facilityName'
  | 'diagnosis'
  | 'patientName'
  | 'patientDob'
  | 'patientTier'
  | 'policyholderName'
  | 'contractCode'
  | 'patientPhone'
  | 'employeeName'
  | 'employeeCode'
  | 'jobTitle'
  | 'employeeEmail'
  | 'bank'
  | 'invoices'
  | 'unconfirmedInvoices'

export interface BuildClaimFormInput {
  claim: Claim
  /** The insured person of the claim (holder or dependent). */
  patient: Person
  /** The employee: the account's holder. */
  holder: Person
  /** Account default payout bank, used when neither the claim nor the person sets one. */
  defaultBank: BankAccount | null
  /** Documents of the account; only this claim's live invoices are used. */
  documents: ReadonlyArray<DocumentRecord>
}

/** Trả về null với chuỗi rỗng hoặc chỉ khoảng trắng. */
function text(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** YYYY-MM-DD → DD/MM/YYYY; giá trị khác định dạng trả về null. */
export function formatDmy(iso: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '')
  return match ? `${match[3]}/${match[2]}/${match[1]}` : null
}

/** 2718900 → "2.718.900". */
export function formatAmountText(amount: number): string {
  return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function invoicesOf(claimId: string, documents: ReadonlyArray<DocumentRecord>): DocumentRecord[] {
  return documents.filter((d) => d.claimId === claimId && d.deleted === 0 && d.category === 'invoice')
}

export function buildClaimFormData(input: BuildClaimFormInput): ClaimFormData {
  const { claim, patient, holder, defaultBank, documents } = input
  const bank = claim.bank ?? patient.bank ?? defaultBank

  const invoices = invoicesOf(claim.id, documents)
  const confirmed = invoices.filter((d) => d.amountConfirmed && d.amount !== null)
  const unconfirmed = invoices.length - confirmed.length

  const sorted = [...confirmed].sort((a, b) => {
    if (a.docDate === b.docDate) return a.createdAt - b.createdAt || a.id.localeCompare(b.id)
    if (a.docDate === null) return 1
    if (b.docDate === null) return -1
    return a.docDate < b.docDate ? -1 : 1
  })
  const expenses = sorted.map((d) => ({ date: formatDmy(d.docDate) ?? '', amount: d.amount ?? 0 }))
  const totalAmount = expenses.reduce((sum, row) => sum + row.amount, 0)

  return {
    reason: text(claim.reason),
    policyholderName: text(patient.policyholderName),
    contractCode: text(patient.contractCode),
    patientName: text(patient.fullName),
    patientDob: formatDmy(patient.dateOfBirth),
    patientTier: patient.tier === undefined || patient.tier === null ? null : String(patient.tier),
    patientPhone: text(patient.phone) ?? text(holder.phone),
    employeeName: text(holder.fullName),
    employeeCode: text(holder.employeeCode),
    jobTitle: text(holder.jobTitle),
    employeeEmail: text(holder.email),
    accountNumber: text(bank?.accountNumber),
    bankName: text(bank?.bankName),
    bankAddress: text(bank?.bankAddress),
    beneficiary: text(bank?.accountName),
    daysOff: claim.daysOff,
    visitDate: formatDmy(claim.treatmentDate),
    diagnosis: text(claim.diagnosis),
    facilityName: text(claim.facilityName),
    admissionDate: formatDmy(claim.admissionDate),
    dischargeDate: formatDmy(claim.dischargeDate),
    expenses,
    totalAmount,
    totalAmountText: formatAmountText(totalAmount),
    totalWords: totalAmount > 0 ? amountInWords(totalAmount) : null,
    unconfirmedInvoices: unconfirmed,
  }
}

/** Các mục bắt buộc của giấy yêu cầu còn trống, theo thứ tự trên mẫu. Rỗng nghĩa là đủ. */
export function missingFields(data: ClaimFormData): FormFieldKey[] {
  const missing: FormFieldKey[] = []
  const need = (key: FormFieldKey, value: unknown) => {
    if (value === null || value === undefined || value === '') missing.push(key)
  }
  need('reason', data.reason)
  need('visitDate', data.visitDate)
  need('facilityName', data.facilityName)
  need('diagnosis', data.diagnosis)
  need('patientName', data.patientName)
  need('patientDob', data.patientDob)
  need('patientTier', data.patientTier)
  need('policyholderName', data.policyholderName)
  need('contractCode', data.contractCode)
  need('patientPhone', data.patientPhone)
  need('employeeName', data.employeeName)
  need('employeeCode', data.employeeCode)
  need('jobTitle', data.jobTitle)
  need('employeeEmail', data.employeeEmail)
  if (data.accountNumber === null || data.bankName === null || data.beneficiary === null) missing.push('bank')
  if (data.expenses.length === 0) missing.push('invoices')
  if (data.unconfirmedInvoices > 0) missing.push('unconfirmedInvoices')
  return missing
}
