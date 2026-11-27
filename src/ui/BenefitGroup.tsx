import type { CategoryGroup } from '../domain/benefits'
import { t } from '../i18n'

/** Categories the app does not process claims for; they point the reader to PTI. */
const CONTACT_PTI = new Set<string>(['accident', 'life'])

/** One category: copay, each benefit with its value, day limit and notes, or "not covered". */
export function BenefitGroup({ group, hotline }: { group: CategoryGroup; hotline: string }) {
  const headingId = `benefit-group-${group.category}`
  return (
    <section aria-labelledby={headingId} class="grid gap-2 rounded-xl bg-surface-2 p-4">
      <h3 id={headingId} class="text-fluid-lg font-semibold text-ink">
        {t(`benefits.category.${group.category}`)}
      </h3>
      {group.copayPercent !== null && (
        <p class="text-fluid-sm font-medium text-ink-muted">
          {t('benefits.copay', { percent: group.copayPercent })}
        </p>
      )}
      {group.covered ? (
        <ul class="grid gap-3">
          {group.benefits.map(({ benefit, text }) => (
            <li key={benefit.id} class="grid gap-0.5">
              <p class="text-fluid-base text-ink">{benefit.title}</p>
              <p class="text-fluid-base font-semibold text-ink">{text}</p>
              {benefit.maxDaysPerYear !== undefined && (
                <p class="text-fluid-sm text-ink-muted">
                  {t('benefits.maxDays', { days: benefit.maxDaysPerYear })}
                </p>
              )}
              {benefit.notes !== undefined && <p class="text-fluid-sm text-ink-muted">{benefit.notes}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p class="text-fluid-base text-ink-muted">{t('benefits.notCovered')}</p>
      )}
      {CONTACT_PTI.has(group.category) && (
        <p class="text-fluid-sm text-ink-muted">
          <span>{t('benefits.accidentNote')}</span> <span>{hotline}</span>
        </p>
      )}
    </section>
  )
}
