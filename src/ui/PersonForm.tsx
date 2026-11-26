import type { MemberType, PersonInput, Relation, Tier } from '../domain/types'
import { t } from '../i18n'

type OptionalTextField =
  | 'idNumber'
  | 'phone'
  | 'email'
  | 'address'
  | 'employeeCode'
  | 'jobTitle'
  | 'policyholderName'
  | 'contractCode'
  | 'cardNumber'
  | 'cardValidFrom'
  | 'cardValidTo'

/** Optional fields in display order. Dates use type="date"; everything else is text. */
const OPTIONAL_FIELDS: { field: OptionalTextField; label: string; inputMode?: 'tel' | 'email' }[] = [
  { field: 'idNumber', label: 'person.idNumber' },
  { field: 'phone', label: 'person.phone', inputMode: 'tel' },
  { field: 'email', label: 'person.email', inputMode: 'email' },
  { field: 'address', label: 'person.address' },
  { field: 'employeeCode', label: 'person.employeeCode' },
  { field: 'jobTitle', label: 'person.jobTitle' },
  { field: 'policyholderName', label: 'person.policyholderName' },
  { field: 'contractCode', label: 'person.contractCode' },
  { field: 'cardNumber', label: 'person.cardNumber' },
  { field: 'cardValidFrom', label: 'person.cardValidFrom' },
  { field: 'cardValidTo', label: 'person.cardValidTo' },
]

/** Fields whose value is a YYYY-MM-DD date rather than free text. */
const DATE_FIELDS: ReadonlySet<OptionalTextField> = new Set(['cardValidFrom', 'cardValidTo'])

const TIERS: Tier[] = [1, 2, 3, 4]
const RELATIONS: { value: Exclude<Relation, 'self'>; label: string }[] = [
  { value: 'spouse', label: 'person.relation.spouse' },
  { value: 'child', label: 'person.relation.child' },
  { value: 'parent', label: 'person.relation.parent' },
  { value: 'other', label: 'person.relation.other' },
]
const MEMBER_TYPES: { value: Exclude<MemberType, 'employee'>; label: string }[] = [
  { value: 'sponsored', label: 'person.memberType.sponsored' },
  { value: 'voluntary', label: 'person.memberType.voluntary' },
]

export type PersonFormProps = {
  value: PersonInput
  errors: Record<string, string>
  onChange(v: PersonInput): void
  mode: 'holder' | 'dependent'
  /** Prefix for element ids so several forms can share a page. Defaults to "person". */
  idPrefix?: string
}

const INPUT_CLASS =
  'mt-1 block w-full min-h-11 rounded-xl border border-surface-2 bg-surface px-3 text-fluid-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-[invalid=true]:border-red-600'
const LABEL_CLASS = 'block text-fluid-sm font-medium text-ink'
const ERROR_CLASS = 'mt-1 text-fluid-sm text-red-600 dark:text-red-400'

/** Labelled, controlled inputs for one person. Empty optional fields are emitted as null. */
export function PersonForm({ value, errors, onChange, mode, idPrefix = 'person' }: PersonFormProps) {
  const update = (patch: Partial<PersonInput>) => onChange({ ...value, ...patch })
  const setOptional = (field: OptionalTextField, raw: string) =>
    update({ [field]: raw.trim() === '' ? null : raw })

  /** Shared a11y wiring: aria-invalid + aria-describedby point at the error text under the field. */
  const a11y = (field: string) => ({
    'aria-invalid': errors[field] === undefined ? undefined : ('true' as const),
    'aria-describedby': errors[field] === undefined ? undefined : `${idPrefix}-${field}-error`,
  })

  const fieldError = (field: string) =>
    errors[field] === undefined ? null : (
      <p id={`${idPrefix}-${field}-error`} class={ERROR_CLASS}>
        {t(errors[field])}
      </p>
    )

  return (
    <div class="grid gap-4">
      <div>
        <label class={LABEL_CLASS} for={`${idPrefix}-fullName`}>
          {t('person.fullName')}
        </label>
        <input
          id={`${idPrefix}-fullName`}
          name="fullName"
          type="text"
          autoComplete="name"
          required
          class={INPUT_CLASS}
          value={value.fullName}
          {...a11y('fullName')}
          onInput={(e) => update({ fullName: e.currentTarget.value })}
        />
        {fieldError('fullName')}
      </div>

      <div>
        <label class={LABEL_CLASS} for={`${idPrefix}-dateOfBirth`}>
          {t('person.dateOfBirth')}
        </label>
        <input
          id={`${idPrefix}-dateOfBirth`}
          name="dateOfBirth"
          type="date"
          required
          class={INPUT_CLASS}
          value={value.dateOfBirth}
          {...a11y('dateOfBirth')}
          onInput={(e) => update({ dateOfBirth: e.currentTarget.value })}
          onChange={(e) => update({ dateOfBirth: e.currentTarget.value })}
        />
        {fieldError('dateOfBirth')}
      </div>

      <div>
        <label class={LABEL_CLASS} for={`${idPrefix}-tier`}>
          {t('person.tier')}
        </label>
        <select
          id={`${idPrefix}-tier`}
          name="tier"
          class={INPUT_CLASS}
          value={String(value.tier)}
          {...a11y('tier')}
          onChange={(e) => update({ tier: Number(e.currentTarget.value) as Tier })}
        >
          {TIERS.map((tier) => (
            <option key={tier} value={String(tier)}>
              {t('home.tier', { tier })}
            </option>
          ))}
        </select>
        {fieldError('tier')}
      </div>

      {mode === 'dependent' && (
        <>
          <div>
            <label class={LABEL_CLASS} for={`${idPrefix}-relation`}>
              {t('person.relation')}
            </label>
            <select
              id={`${idPrefix}-relation`}
              name="relation"
              class={INPUT_CLASS}
              value={value.relation}
              {...a11y('relation')}
              onChange={(e) => update({ relation: e.currentTarget.value as Relation })}
            >
              {RELATIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {t(r.label)}
                </option>
              ))}
            </select>
            {fieldError('relation')}
          </div>

          <div>
            <label class={LABEL_CLASS} for={`${idPrefix}-memberType`}>
              {t('person.memberType')}
            </label>
            <select
              id={`${idPrefix}-memberType`}
              name="memberType"
              class={INPUT_CLASS}
              value={value.memberType}
              {...a11y('memberType')}
              onChange={(e) => update({ memberType: e.currentTarget.value as MemberType })}
            >
              {MEMBER_TYPES.map((m) => (
                <option key={m.value} value={m.value}>
                  {t(m.label)}
                </option>
              ))}
            </select>
            {fieldError('memberType')}
          </div>
        </>
      )}

      <details open class="rounded-xl border border-surface-2 p-3">
        <summary class="min-h-11 cursor-pointer py-2 text-fluid-base font-medium text-ink">{t('person.details')}</summary>
        <div class="grid gap-4 pt-2">
          {OPTIONAL_FIELDS.map(({ field, label, inputMode }) => {
            const onValue = (e: { currentTarget: HTMLInputElement }) => setOptional(field, e.currentTarget.value)
            return (
              <div key={field}>
                <label class={LABEL_CLASS} for={`${idPrefix}-${field}`}>
                  {t(label)}
                </label>
                {DATE_FIELDS.has(field) ? (
                  <input
                    id={`${idPrefix}-${field}`}
                    name={field}
                    type="date"
                    class={INPUT_CLASS}
                    value={value[field] ?? ''}
                    {...a11y(field)}
                    onInput={onValue}
                    onChange={onValue}
                  />
                ) : (
                  <input
                    id={`${idPrefix}-${field}`}
                    name={field}
                    type="text"
                    inputMode={inputMode}
                    class={INPUT_CLASS}
                    value={value[field] ?? ''}
                    {...a11y(field)}
                    onInput={onValue}
                  />
                )}
                {fieldError(field)}
              </div>
            )
          })}
        </div>
      </details>
    </div>
  )
}
