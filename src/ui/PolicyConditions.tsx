import type { BenefitsDataset, MemberType } from '../domain/benefits-schema'
import { t } from '../i18n'
import { formatDateVi } from '../lib/format-date'
import { formatVnd } from '../lib/money'

const CARD = 'grid gap-2 rounded-xl bg-surface-2 p-4'
const HEADING = 'text-fluid-lg font-semibold text-ink'
const LIST = 'grid gap-3 text-fluid-base text-ink'

/** Policy year, effective dates, claim deadline and the insurer hotline as a tel: link. */
export function PolicyYearInfo({ dataset }: { dataset: BenefitsDataset }) {
  return (
    <section aria-labelledby="policy-year-heading" class={CARD}>
      <h3 id="policy-year-heading" class={HEADING}>
        {t('benefits.policyYear', { year: dataset.policyYear })}
      </h3>
      <p class="text-fluid-sm text-ink-muted">
        {t('benefits.effective', { from: formatDateVi(dataset.effectiveFrom), to: formatDateVi(dataset.effectiveTo) })}
      </p>
      <p class="text-fluid-base text-ink">{t('benefits.claimDeadline', { days: dataset.claimDeadlineDays })}</p>
      <p class="text-fluid-base text-ink">
        {t('benefits.hotline')}{' '}
        <a
          href={`tel:${dataset.hotline.replace(/\s+/g, '')}`}
          class="inline-flex min-h-11 items-center font-semibold text-accent underline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {dataset.hotline}
        </a>
      </p>
    </section>
  )
}

/** Extensions, waiting periods of the member type, and exclusions with the extension that overrides each. */
export function PolicyConditions({ dataset, memberType }: { dataset: BenefitsDataset; memberType: MemberType }) {
  const titleOf = (id: string): string =>
    dataset.extensions.find((e) => e.id === id)?.title ??
    dataset.benefits.find((b) => b.id === id)?.title ??
    id

  return (
    <div class="grid gap-4">
      <section aria-labelledby="extensions-heading" class={CARD}>
        <h3 id="extensions-heading" class={HEADING}>
          {t('benefits.extensions')}
        </h3>
        <ul class={LIST}>
          {dataset.extensions.map((ext) => (
            <li key={ext.id} class="grid gap-0.5">
              <p>{ext.title}</p>
              {ext.limitPerYear !== undefined && (
                <p class="text-fluid-sm text-ink-muted">
                  {t('benefits.extensionLimit', { amount: formatVnd(ext.limitPerYear) })}
                </p>
              )}
              {ext.notes !== undefined && <p class="text-fluid-sm text-ink-muted">{ext.notes}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="waiting-heading" class={CARD}>
        <h3 id="waiting-heading" class={HEADING}>
          {t('benefits.waiting')}
        </h3>
        <ul class={LIST}>
          {dataset.waitingPeriods[memberType].map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="exclusions-heading" class={CARD}>
        <h3 id="exclusions-heading" class={HEADING}>
          {t('benefits.exclusions')}
        </h3>
        <ul class={LIST}>
          {dataset.exclusions.map((ex) => (
            <li key={ex.id} class="grid gap-0.5">
              <p>{ex.text}</p>
              {ex.extensionIds.map((target) => (
                <p key={target} class="text-fluid-sm font-medium text-accent">
                  {t('benefits.exception', { title: titleOf(target) })}
                </p>
              ))}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
