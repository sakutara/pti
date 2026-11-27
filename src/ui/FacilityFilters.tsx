import { SERVICES, type Service } from '../domain/facilities-schema'
import { t } from '../i18n'

export interface FacilityFacets {
  /** Province code, or null for every province. */
  province: string | null
  /** Every selected service must be offered. */
  services: Service[]
}

const CHIP =
  'min-h-11 rounded-xl px-3 text-fluid-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent bg-surface-2 text-ink aria-pressed:bg-accent aria-pressed:text-surface'

const FIELD =
  'min-h-11 w-full min-w-0 rounded-xl border border-surface-2 bg-surface px-3 text-fluid-base text-ink focus-visible:outline-2 focus-visible:outline-accent'

/** Province and service facets. The excluded view and the search text live elsewhere on the page. */
export function FacilityFilters({
  provinces,
  value,
  onChange,
}: {
  provinces: { code: string; name: string }[]
  value: FacilityFacets
  onChange: (next: FacilityFacets) => void
}) {
  const toggleService = (service: Service) => {
    const on = value.services.includes(service)
    onChange({
      ...value,
      services: SERVICES.filter((s) => (s === service ? !on : value.services.includes(s))),
    })
  }

  return (
    <>
      <div class="grid gap-1">
        <label for="facility-province" class="text-fluid-sm font-medium text-ink">
          {t('facilities.filters.province')}
        </label>
        <select
          id="facility-province"
          class={FIELD}
          value={value.province ?? ''}
          onChange={(e) => onChange({ ...value, province: e.currentTarget.value || null })}
        >
          <option value="">{t('facilities.filters.provinceAll')}</option>
          {provinces.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div class="grid gap-1">
        <p id="facility-services-label" class="text-fluid-sm font-medium text-ink">
          {t('facilities.filters.services')}
        </p>
        <div role="group" aria-labelledby="facility-services-label" class="flex flex-wrap gap-2">
          {SERVICES.map((service) => (
            <button
              key={service}
              type="button"
              aria-pressed={value.services.includes(service)}
              class={CHIP}
              onClick={() => toggleService(service)}
            >
              {t(`facilities.service.${service}`)}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
