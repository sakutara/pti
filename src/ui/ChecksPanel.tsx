import { runChecks, type Check, type CheckInput } from '../domain/claim-checks'
import type { Claim } from '../domain/claim-types'
import type { DocumentRecord } from '../domain/document-types'
import type { Facility } from '../domain/facilities-schema'
import type { BenefitsDataset } from '../domain/benefits-schema'
import type { Person } from '../domain/types'
import { t } from '../i18n'
import { formatDateVi } from '../lib/format-date'
import { Icon } from './Icon'

export interface ChecksPanelProps {
  claim: Claim
  person: Person | null
  benefits: BenefitsDataset | null
  facility: Facility | null
  documents: readonly DocumentRecord[]
  /** YYYY-MM-DD. */
  today: string
}

/** Lowercases only the first letter, so "Số CCCD" reads as "số CCCD" in a sentence. */
const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1)

/**
 * The message of one check. Dates read dd/mm/yyyy; the benefit and service names are put into the sentence in lower case.
 */
export function checkMessage(check: Check, claim: Claim): string {
  const params: Record<string, string | number> = { ...check.params }
  if (typeof params.deadline === 'string') params.deadline = formatDateVi(params.deadline)
  if (check.code === 'check.notCovered') params.category = lowerFirst(t(`benefits.category.${claim.type}`))
  if (check.code === 'check.directBillingHint') params.service = lowerFirst(t(`facilities.service.${String(params.service)}`))
  return t(check.code, params)
}

/** Pre-submission warnings for the claim. They never block saving; the list is recomputed on every change. */
export function ChecksPanel({ claim, person, benefits, facility, documents, today }: ChecksPanelProps) {
  const input: CheckInput = { claim, person, benefits, facility, documents, today }
  const checks = runChecks(input)
  return (
    <details open class="flex flex-col gap-2 rounded-xl bg-surface-2 p-3">
      <summary class="flex min-h-11 cursor-pointer items-center gap-2 text-fluid-base font-semibold text-ink">
        <Icon name="info" class="size-5" />
        {t('claim.checks.title')}
      </summary>
      {checks.length === 0 ? (
        <p class="text-fluid-sm text-ink-muted">{t('claim.checks.none')}</p>
      ) : (
        <ul class="flex flex-col gap-2">
          {checks.map((check) => (
            <li
              key={`${check.code}-${JSON.stringify(check.params)}`}
              class={`text-fluid-sm ${check.severity === 'warning' ? 'text-red-600 dark:text-red-400' : 'text-ink-muted'}`}
            >
              {checkMessage(check, claim)}
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}
