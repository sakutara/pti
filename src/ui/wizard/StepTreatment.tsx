import { useMemo } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import type { ClaimPatch } from '../../data/claims-repo'
import type { Claim, ClaimFlags } from '../../domain/claim-types'
import type { Facility } from '../../domain/facilities-schema'
import { searchFacilities } from '../../domain/facility-search'
import { t } from '../../i18n'

export interface StepTreatmentProps {
  /** The claim with the step's pending answers already applied. */
  claim: Claim
  facilities: readonly Facility[]
  readOnly: boolean
  onChange(patch: ClaimPatch): void
}

/** Suggestions shown under the facility field at most. */
export const FACILITY_SUGGESTIONS = 8

const CONTROL =
  'min-h-11 min-w-0 rounded-xl border border-surface-2 bg-surface px-3 text-fluid-base text-ink disabled:opacity-70'

const FLAG_KEYS: ReadonlyArray<keyof ClaimFlags> = [
  'multiDayTreatment',
  'surgery',
  'transfer',
  'publicFacility',
  'rootCanalOrExtraction',
]

function Field({ id, label, children }: { id: string; label: string; children: ComponentChildren }) {
  return (
    <div class="flex min-w-0 flex-col gap-1">
      <label for={id} class="text-fluid-sm text-ink-muted">
        {label}
      </label>
      {children}
    </div>
  )
}

/**
 * Facility suggestions: direct-billing facilities first, then excluded ones so that a warning can be shown. At most
 * FACILITY_SUGGESTIONS rows.
 */
export function facilitySuggestions(facilities: readonly Facility[], query: string): Facility[] {
  if (query.trim() === '') return []
  const direct = searchFacilities([...facilities], { q: query })
  const excluded = searchFacilities([...facilities], { q: query, blacklisted: true })
  return [...direct, ...excluded].slice(0, FACILITY_SUGGESTIONS)
}

/**
 * Step 3: the treatment. A short reason, the date (examination, or admission and discharge for inpatient and maternity),
 * the facility (picked from the dataset, or typed: then facilityId is null), diagnosis, days off and situation flags.
 */
export function StepTreatment({ claim, facilities, readOnly, onChange }: StepTreatmentProps) {
  const longStay = claim.type === 'inpatient' || claim.type === 'maternity'
  const suggestions = useMemo(
    () => (claim.facilityId === null ? facilitySuggestions(facilities, claim.facilityName) : []),
    [facilities, claim.facilityId, claim.facilityName],
  )

  return (
    <section aria-labelledby="claim-step-treatment" class="flex flex-col gap-4">
      <h2 id="claim-step-treatment" class="text-fluid-lg font-semibold text-ink">
        {t('claim.treatment.title')}
      </h2>

      <div class="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
        <Field id="claim-reason" label={t('claim.treatment.reason')}>
          <input
            id="claim-reason"
            type="text"
            value={claim.reason}
            disabled={readOnly}
            placeholder={t('claim.treatment.reasonHint')}
            class={CONTROL}
            onInput={(e) => onChange({ reason: e.currentTarget.value })}
          />
        </Field>

        {longStay ? (
          <>
            <Field id="claim-admission" label={t('claim.treatment.admission')}>
              <input
                id="claim-admission"
                type="date"
                value={claim.admissionDate ?? ''}
                disabled={readOnly}
                class={CONTROL}
                onChange={(e) => {
                  const value = e.currentTarget.value
                  onChange(value === '' ? { admissionDate: null } : { admissionDate: value, treatmentDate: value })
                }}
              />
            </Field>
            <Field id="claim-discharge" label={t('claim.treatment.discharge')}>
              <input
                id="claim-discharge"
                type="date"
                value={claim.dischargeDate ?? ''}
                disabled={readOnly}
                class={CONTROL}
                onChange={(e) => onChange({ dischargeDate: e.currentTarget.value || null })}
              />
            </Field>
          </>
        ) : (
          <Field id="claim-date" label={t('claim.treatment.date')}>
            <input
              id="claim-date"
              type="date"
              value={claim.treatmentDate}
              disabled={readOnly}
              class={CONTROL}
              onChange={(e) => onChange({ treatmentDate: e.currentTarget.value })}
            />
          </Field>
        )}

        <div class="flex min-w-0 flex-col gap-1 min-[480px]:col-span-2">
          <Field id="claim-facility" label={t('claim.treatment.facility')}>
            <input
              id="claim-facility"
              type="text"
              value={claim.facilityName}
              disabled={readOnly}
              class={CONTROL}
              onInput={(e) => onChange({ facilityName: e.currentTarget.value, facilityId: null })}
            />
          </Field>
          {claim.facilityId === null && claim.facilityName.trim() !== '' && (
            <p class="text-fluid-sm text-ink-muted">{t('claim.treatment.facilityTyped')}</p>
          )}
          {suggestions.length > 0 && (
            <div class="flex flex-col gap-1">
              <p class="text-fluid-sm text-ink-muted">{t('claim.facility.suggestions')}</p>
              <ul class="flex flex-col gap-1">
                {suggestions.map((facility) => (
                  <li key={facility.id}>
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => onChange({ facilityId: facility.id, facilityName: facility.name })}
                      class="flex min-h-11 w-full flex-col items-start rounded-lg bg-surface-2 px-3 py-1 text-left text-fluid-sm text-ink hover:brightness-95 focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <span class="font-medium">{facility.name}</span>
                      <span class="text-ink-muted">{facility.address}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <Field id="claim-diagnosis" label={t('claim.treatment.diagnosis')}>
          <input
            id="claim-diagnosis"
            type="text"
            value={claim.diagnosis ?? ''}
            disabled={readOnly}
            class={CONTROL}
            onInput={(e) => onChange({ diagnosis: e.currentTarget.value || null })}
          />
        </Field>
        <Field id="claim-days-off" label={t('claim.treatment.daysOff')}>
          <input
            id="claim-days-off"
            type="text"
            inputMode="numeric"
            value={String(claim.daysOff)}
            disabled={readOnly}
            class={CONTROL}
            onInput={(e) => {
              const raw = e.currentTarget.value.trim()
              onChange({ daysOff: raw === '' ? 0 : /^\d+$/.test(raw) ? Number(raw) : Number.NaN })
            }}
          />
        </Field>
      </div>

      <fieldset class="flex flex-col gap-2">
        <legend class="text-fluid-sm font-medium text-ink">{t('claim.treatment.flags')}</legend>
        {FLAG_KEYS.map((key) => (
          <label key={key} class="flex min-h-11 items-center gap-3 text-fluid-base text-ink">
            <input
              type="checkbox"
              checked={claim.flags[key] === true}
              disabled={readOnly}
              class="size-5 accent-accent"
              onChange={(e) => onChange({ flags: { ...claim.flags, [key]: e.currentTarget.checked } })}
            />
            {t(`claim.flag.${key}`)}
          </label>
        ))}
      </fieldset>
    </section>
  )
}
