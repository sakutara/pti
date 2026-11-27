// Status transitions of a claim and the rules for recording an outcome. Used by claims-repo.setStatus.
import type { ClaimStatus } from './claim-types'

/**
 * Allowed moves. draft -> ready and ready -> submitted are the app's own steps; ready -> draft happens when a ready claim
 * is edited in the wizard; the rest follow the insurer's reply.
 */
export const CLAIM_TRANSITIONS: Readonly<Record<ClaimStatus, readonly ClaimStatus[]>> = {
  draft: ['ready'],
  ready: ['submitted', 'draft'],
  submitted: ['need_info', 'approved', 'partially_approved', 'rejected'],
  need_info: ['submitted', 'rejected'],
  approved: ['paid'],
  partially_approved: ['paid'],
  rejected: [],
  paid: [],
}

export function canTransition(from: ClaimStatus, to: ClaimStatus): boolean {
  return CLAIM_TRANSITIONS[from].includes(to)
}

export type OutcomeErrorCode =
  | 'error.amountRequired'
  | 'error.amountInvalid'
  | 'error.amountTooHigh'
  | 'error.reasonRequired'

export interface OutcomeError {
  /** The input field the message belongs to. */
  field: 'approvedAmount' | 'rejectionReason'
  code: OutcomeErrorCode
}

/**
 * Checks the amount and reason recorded with an outcome. approved and partially_approved need a whole-VND amount
 * from 0 up to the claim total; partially_approved and rejected need a reason. Other statuses are not checked.
 * Returns the first problem, or null.
 */
export function validateOutcome(
  status: ClaimStatus,
  amount: number | null,
  total: number,
  reason: string | null,
): OutcomeError | null {
  if (status === 'approved' || status === 'partially_approved') {
    if (amount === null) return { field: 'approvedAmount', code: 'error.amountRequired' }
    if (!Number.isInteger(amount) || amount < 0) return { field: 'approvedAmount', code: 'error.amountInvalid' }
    if (amount > total) return { field: 'approvedAmount', code: 'error.amountTooHigh' }
  }
  if ((status === 'partially_approved' || status === 'rejected') && (reason === null || reason.trim() === '')) {
    return { field: 'rejectionReason', code: 'error.reasonRequired' }
  }
  return null
}
