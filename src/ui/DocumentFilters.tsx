import { DOC_CATEGORIES } from '../domain/document-types'
import type { Person } from '../domain/types'
import { t } from '../i18n'

export interface DocumentFilterValues {
  /** '' means every category. */
  category: string
  /** '' means every person. */
  personId: string
  notInClaim: boolean
}

export interface DocumentFiltersProps {
  value: DocumentFilterValues
  persons: Person[]
  /** Receives the changed hash-query keys: c (category), p (person), n ("1" = not in a claim). */
  onChange(patch: Record<string, string>): void
}

const CONTROL = 'min-h-11 min-w-0 rounded-xl border border-surface-2 bg-surface px-3 text-fluid-base text-ink'

/** Category, person and "not in a claim" filters. The values live in the hash query, so they survive reloads. */
export function DocumentFilters({ value, persons, onChange }: DocumentFiltersProps) {
  return (
    <fieldset class="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2">
      <legend class="sr-only">{t('documents.filter.label')}</legend>
      <label class="flex flex-col gap-1 text-fluid-sm text-ink-muted" for="doc-filter-category">
        {t('documents.filter.category')}
      </label>
      <select
        id="doc-filter-category"
        value={value.category}
        onChange={(e) => onChange({ c: e.currentTarget.value })}
        class={CONTROL}
      >
        <option value="">{t('documents.category.all')}</option>
        {DOC_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {t(`documents.category.${c}`)}
          </option>
        ))}
      </select>
      <label class="flex flex-col gap-1 text-fluid-sm text-ink-muted" for="doc-filter-person">
        {t('documents.person.label')}
      </label>
      <select
        id="doc-filter-person"
        value={value.personId}
        onChange={(e) => onChange({ p: e.currentTarget.value })}
        class={CONTROL}
      >
        <option value="">{t('documents.person.all')}</option>
        {persons.map((p) => (
          <option key={p.id} value={p.id}>
            {p.fullName}
          </option>
        ))}
      </select>
      <label class="flex min-h-11 items-center gap-3 text-fluid-base text-ink">
        <input
          type="checkbox"
          checked={value.notInClaim}
          onChange={(e) => onChange({ n: e.currentTarget.checked ? '1' : '' })}
          class="size-5 accent-accent"
        />
        <span>{t('documents.filter.notInClaim')}</span>
      </label>
    </fieldset>
  )
}
