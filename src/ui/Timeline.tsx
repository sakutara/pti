import type { Claim, ClaimEvent } from '../domain/claim-types'
import { t } from '../i18n'
import { todayIso } from '../lib/dates'
import { formatDateVi } from '../lib/format-date'
import { formatVnd } from '../lib/money'

/** A VND amount that may be negative (the difference after an outcome can be, once invoices change). */
export const signedVnd = (amount: number): string => (amount < 0 ? `-${formatVnd(-amount)}` : formatVnd(amount))

/** Local calendar day of an epoch time, shown as DD/MM/YYYY. */
const dayOf = (epochMs: number): string => formatDateVi(todayIso(new Date(epochMs)))

export interface TimelineProps {
  claim: Claim
  /** Status history of the claim, in any order; shown oldest first. */
  events: ReadonlyArray<ClaimEvent>
}

/**
 * The claim's status history, oldest first, with the claimed total and, once an outcome exists, the approved amount and
 * the difference between them.
 */
export function Timeline({ claim, events }: TimelineProps) {
  const ordered = [...events].sort((a, b) => a.at - b.at || a.updatedAt - b.updatedAt)
  const approved = claim.approvedAmount

  return (
    <section aria-labelledby="timeline-title" class="flex flex-col gap-3">
      <h3 id="timeline-title" class="text-fluid-base font-semibold text-ink">
        {t('claim.timeline.title')}
      </h3>

      <ul class="flex flex-col gap-1 text-fluid-sm text-ink">
        <li>{t('claim.amount.claimed', { amount: signedVnd(claim.totalClaimed) })}</li>
        {approved !== null && (
          <>
            <li>{t('claim.amount.approved', { amount: signedVnd(approved) })}</li>
            <li>{t('claim.amount.difference', { amount: signedVnd(claim.totalClaimed - approved) })}</li>
          </>
        )}
      </ul>

      {ordered.length === 0 ? (
        <p class="text-fluid-sm text-ink-muted">{t('claim.timeline.empty')}</p>
      ) : (
        <ol aria-label={t('claim.timeline.title')} class="flex flex-col gap-2">
          {ordered.map((event) => (
            <li key={event.id} class="flex flex-col gap-0.5 rounded-lg bg-surface-2 p-3">
              <span class="text-fluid-sm tabular-nums text-ink-muted">{dayOf(event.at)}</span>
              <span class="text-fluid-base font-medium text-ink">{t(`claim.status.${event.status}`)}</span>
              {event.note !== '' && <span class="text-fluid-sm text-ink">{event.note}</span>}
              {event.amount !== null && <span class="text-fluid-sm tabular-nums text-ink">{signedVnd(event.amount)}</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
