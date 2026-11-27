import { CLAIM_TYPES, type ClaimType } from '../../domain/claim-types'
import type { MemberType } from '../../domain/types'
import { t } from '../../i18n'

export interface StepTypeProps {
  /** Member type of the chosen person: optical claims are for employees only. */
  memberType: MemberType | null
  value: ClaimType | null
  readOnly: boolean
  hotline: string
  onSelect(type: ClaimType): void
}

/** Only types the person may claim are offered. Optical is employee-only (claims.check.optical-dependent). */
export const offeredTypes = (memberType: MemberType | null): ClaimType[] =>
  CLAIM_TYPES.filter((type) => type !== 'optical' || memberType === 'employee')

/** Step 2: the claim type. Accident and death claims are not offered; a note points to PTI. */
export function StepType({ memberType, value, readOnly, hotline, onSelect }: StepTypeProps) {
  return (
    <section aria-labelledby="claim-step-type" class="flex flex-col gap-3">
      <h2 id="claim-step-type" class="text-fluid-lg font-semibold text-ink">
        {t('claim.type.title')}
      </h2>
      <ul class="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2">
        {offeredTypes(memberType).map((type) => (
          <li key={type}>
            <button
              type="button"
              disabled={readOnly}
              aria-pressed={value === type}
              onClick={() => onSelect(type)}
              class="flex min-h-11 w-full items-center rounded-xl bg-surface-2 px-4 py-3 text-left text-fluid-base font-medium text-ink transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-70 aria-pressed:ring-2 aria-pressed:ring-accent"
            >
              {t(`claim.type.${type}`)}
            </button>
          </li>
        ))}
      </ul>
      <p class="text-fluid-sm text-ink-muted">
        {t('claim.type.accident')} {t('claim.type.hotline', { hotline })}
      </p>
    </section>
  )
}
