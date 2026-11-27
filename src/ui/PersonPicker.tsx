import type { Person } from '../domain/types'
import { t } from '../i18n'

const CHIP =
  'inline-flex min-h-11 items-center rounded-full px-4 text-fluid-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent bg-surface-2 text-ink hover:brightness-95 aria-[pressed=true]:bg-accent aria-[pressed=true]:text-surface'

/** Chips for the holder and dependents; the selected one has aria-pressed. */
export function PersonPicker({
  persons,
  selectedId,
  onSelect,
}: {
  persons: Person[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <div role="group" aria-label={t('benefits.personLabel')} class="flex flex-wrap gap-2">
      {persons.map((person) => {
        const selected = person.id === selectedId
        return (
          <button
            key={person.id}
            type="button"
            aria-pressed={selected}
            class={CHIP}
            onClick={() => onSelect(person.id)}
          >
            {person.fullName}
          </button>
        )
      })}
    </div>
  )
}
