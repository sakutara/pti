import type { BankAccount } from './types'

/** Claim types that go through the app. Accident and death claims are handled directly with PTI. */
export const CLAIM_TYPES = ['outpatient', 'dental', 'optical', 'inpatient', 'maternity'] as const
export type ClaimType = (typeof CLAIM_TYPES)[number]

/** Life cycle: draft -> ready -> submitted -> (need_info -> submitted)* -> outcome -> paid. */
export const CLAIM_STATUSES = [
  'draft',
  'ready',
  'submitted',
  'need_info',
  'approved',
  'partially_approved',
  'rejected',
  'paid',
] as const
export type ClaimStatus = (typeof CLAIM_STATUSES)[number]

/** Wizard steps: person, type, treatment, invoices, documents, review. */
export type WizardStep = 0 | 1 | 2 | 3 | 4 | 5

/** Conditions for the document checklist (claims.docs.*). */
export interface ClaimFlags {
  multiDayTreatment?: boolean
  surgery?: boolean
  transfer?: boolean
  publicFacility?: boolean
  rootCanalOrExtraction?: boolean
}

export interface Claim {
  id: string
  personId: string
  type: ClaimType
  status: ClaimStatus
  /** YYYY-MM-DD: examination date, or admission date for inpatient and maternity. */
  treatmentDate: string
  /** Id in the facilities dataset; null when the facility was typed in by hand. */
  facilityId: string | null
  facilityName: string
  /** Short reason; used in the email subject and in file names. */
  reason: string
  /** Epoch ms when the originals were handed in (inpatient and maternity). */
  originalsSubmittedAt: number | null
  daysOff: number
  /** YYYY-MM-DD, inpatient and maternity only. */
  admissionDate: string | null
  dischargeDate: string | null
  /** Payout account chosen for this claim; null means the person or account default. */
  bank: BankAccount | null
  /** Optional requirement ids the user marked as not applicable. */
  notApplicable: string[]
  diagnosis: string | null
  flags: ClaimFlags
  /** Whole VND: sum of the confirmed amounts of the claim's live invoices. */
  totalClaimed: number
  approvedAmount: number | null
  rejectionReason: string | null
  submittedAt: number | null
  /** Ids of the form PDF and the attachment PDF (kind 'bundle'). */
  bundleFileIds: string[]
  wizardStep: WizardStep
  sentVia: 'gmail' | 'mailto' | null
  gmailThreadId: string | null
  /** Photos sent with the last submission, used by a supplementary submission. */
  lastSubmittedFileIds: string[]
  updatedAt: number
  deleted: 0 | 1
}

export interface ClaimEvent {
  id: string
  claimId: string
  /** Epoch ms. */
  at: number
  status: ClaimStatus
  note: string
  /** Whole VND, or null when the event has no amount. */
  amount: number | null
  updatedAt: number
  deleted: 0 | 1
}
