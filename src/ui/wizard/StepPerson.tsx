import type { Person } from '../../domain/types'
import { t } from '../../i18n'

export interface StepPersonProps {
  persons: readonly Person[]
  selectedId: string | null
  /** Once the draft exists the person is fixed: documents and totals belong to them. */
  readOnly: boolean
  onSelect(personId: string): void
}

/** Step 1: who the claim is for, the holder or a dependent. */
export function StepPerson({ persons, selectedId, readOnly, onSelect }: StepPersonProps) {
  return (
    <section aria-labelledby="claim-step-person" class="flex flex-col gap-3">
      <h2 id="claim-step-person" class="text-fluid-lg font-semibold text-ink">
        {t('claim.person.title')}
      </h2>
      {persons.length === 0 ? (
        <p class="text-fluid-base text-ink-muted">{t('claim.person.empty')}</p>
      ) : (
        <ul class="flex flex-col gap-2">
          {persons.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                disabled={readOnly}
                aria-pressed={selectedId === person.id}
                onClick={() => onSelect(person.id)}
                class="flex min-h-11 w-full flex-col items-start gap-0.5 rounded-xl bg-surface-2 px-4 py-3 text-left text-ink transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-70 aria-pressed:ring-2 aria-pressed:ring-accent"
              >
                <span class="text-fluid-base font-medium">{person.fullName}</span>
                <span class="text-fluid-sm text-ink-muted">
                  {person.role === 'holder' ? t('claim.person.holder') : t('claim.person.dependent')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
