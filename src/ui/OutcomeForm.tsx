import { useState } from 'preact/hooks'
import { setStatus, type StatusFields } from '../data/claims-repo'
import { db } from '../db/db'
import { canTransition } from '../domain/claim-status'
import type { Claim, ClaimStatus } from '../domain/claim-types'
import { t } from '../i18n'
import { IconButton } from './IconButton'

/** Statuses the user records from the insurer's reply. Submitting (also after need_info) goes through the send step. */
const OUTCOME_STATUSES = ['need_info', 'approved', 'partially_approved', 'rejected', 'paid'] as const satisfies readonly ClaimStatus[]

/** The outcome statuses this claim may move to now. Empty when no outcome can be recorded (draft, ready, paid, rejected). */
export function outcomeOptions(status: ClaimStatus): ClaimStatus[] {
  return OUTCOME_STATUSES.filter((next) => canTransition(status, next))
}

/** Repo error codes shown with wording for an outcome: 0 is a valid amount here, unlike an invoice amount. */
const messageFor = (code: string): string => t(code === 'error.amountInvalid' ? 'claim.outcome.amountInvalid' : code)

export interface OutcomeFormProps {
  claim: Claim
}

/**
 * Records the insurer's reply: the new status, the approved amount (approved, partially approved) and a reason or note.
 * Only the statuses the claim may move to are offered. Remount it (key by status) after a change.
 */
export function OutcomeForm({ claim }: OutcomeFormProps) {
  const options = outcomeOptions(claim.status)
  const [next, setNext] = useState<ClaimStatus | null>(options[0] ?? null)
  const [amountText, setAmountText] = useState('')
  const [reasonText, setReasonText] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  if (options.length === 0) {
    return <p class="text-fluid-sm text-ink-muted">{t('claim.outcome.none')}</p>
  }

  const chosen: ClaimStatus = next ?? options[0]
  const needsAmount = chosen === 'approved' || chosen === 'partially_approved'
  const needsReason = chosen === 'partially_approved' || chosen === 'rejected'

  async function onSubmit(event: Event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const raw = amountText.trim()
      // A plain run of digits is a whole amount; anything else (a comma, a sign, a decimal) is refused by the repo.
      const amount = raw === '' ? null : /^\d+$/.test(raw) ? Number(raw) : Number.NaN
      const reason = reasonText.trim()
      const fields: StatusFields = {}
      if (needsAmount) fields.approvedAmount = amount
      if (needsReason) fields.rejectionReason = reason === '' ? null : reason
      const eventAmount = needsAmount ? amount : chosen === 'paid' ? claim.approvedAmount : null

      const result = await setStatus(db, claim.id, chosen, fields, {
        note: needsReason ? reason : '',
        amount: eventAmount,
      })
      if (!result.ok) {
        setErrors(Object.values(result.errors).map(messageFor))
        return
      }
      setErrors([])
      setAmountText('')
      setReasonText('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} aria-labelledby="outcome-title" class="flex flex-col gap-3 rounded-xl bg-surface-2 p-4">
      <h3 id="outcome-title" class="text-fluid-base font-semibold text-ink">
        {t('claim.outcome.title')}
      </h3>

      <div class="flex flex-col gap-1">
        <label for="outcome-status" class="text-fluid-sm text-ink-muted">
          {t('claim.outcome.status')}
        </label>
        <select
          id="outcome-status"
          value={chosen}
          onChange={(e) => setNext(e.currentTarget.value as ClaimStatus)}
          class="min-h-11 rounded-lg bg-surface px-3 text-fluid-base text-ink focus-visible:outline-2 focus-visible:outline-accent"
        >
          {options.map((status) => (
            <option key={status} value={status}>
              {t(`claim.status.${status}`)}
            </option>
          ))}
        </select>
      </div>

      {needsAmount && (
        <div class="flex flex-col gap-1">
          <label for="outcome-amount" class="text-fluid-sm text-ink-muted">
            {t('claim.outcome.amount')}
          </label>
          <input
            id="outcome-amount"
            type="text"
            inputMode="numeric"
            value={amountText}
            onInput={(e) => setAmountText(e.currentTarget.value)}
            class="min-h-11 rounded-lg bg-surface px-3 text-fluid-base tabular-nums text-ink focus-visible:outline-2 focus-visible:outline-accent"
          />
        </div>
      )}

      {needsReason && (
        <div class="flex flex-col gap-1">
          <label for="outcome-reason" class="text-fluid-sm text-ink-muted">
            {t('claim.outcome.reason')}
          </label>
          <textarea
            id="outcome-reason"
            rows={2}
            value={reasonText}
            onInput={(e) => setReasonText(e.currentTarget.value)}
            class="rounded-lg bg-surface px-3 py-2 text-fluid-base text-ink focus-visible:outline-2 focus-visible:outline-accent"
          />
        </div>
      )}

      {errors.length > 0 && (
        <div role="alert" class="flex flex-col gap-1 text-fluid-sm text-red-600 dark:text-red-400">
          {errors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}

      <div>
        <IconButton type="submit" icon="status-edit" label={t('claim.outcome.save')} showLabel variant="primary" disabled={busy} />
      </div>
    </form>
  )
}
