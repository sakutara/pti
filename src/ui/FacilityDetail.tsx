import { SERVICES, type Facility } from '../domain/facilities-schema'
import { mapUrl, splitPhones } from '../domain/facility-search'
import { t } from '../i18n'
import { Icon } from './Icon'

// Icon-only call and map actions are links (role link, see facilities.detail.a11y), styled like IconButton.
const ACTION =
  'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-accent transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

/** Everything a visitor needs before going to a facility. Names are shown as PTI spells them. */
export function FacilityDetail({ facility }: { facility: Facility }) {
  const phones = splitPhones(facility.phone)
  const services = SERVICES.filter((s) => facility[s])

  return (
    <article class="grid gap-5 rounded-xl bg-surface-2 p-4">
      <header class="grid gap-1">
        <h2 class="text-fluid-lg font-semibold text-ink">{facility.name}</h2>
        {facility.nameEn && <p class="text-fluid-sm text-ink-muted">{facility.nameEn}</p>}
      </header>

      <dl class="grid gap-4">
        <div class="grid gap-1">
          <dt class="text-fluid-sm font-medium text-ink-muted">{t('facilities.detail.address')}</dt>
          <dd class="flex items-start justify-between gap-2 text-fluid-base text-ink">
            <span>{facility.address}</span>
            <a href={mapUrl(facility)} target="_blank" rel="noopener noreferrer" aria-label={t('facilities.detail.map')} class={ACTION}>
              <Icon name="map-pin" />
            </a>
          </dd>
        </div>

        <div class="grid gap-1">
          <dt class="text-fluid-sm font-medium text-ink-muted">{t('facilities.detail.phone')}</dt>
          <dd class="text-fluid-base text-ink">
            {phones.length === 0 ? (
              t('facilities.detail.noPhone')
            ) : (
              <ul class="grid gap-1">
                {phones.map((phone) => (
                  <li key={phone} class="flex items-center justify-between gap-2">
                    <span class="tabular-nums">{phone}</span>
                    <a href={`tel:${phone}`} aria-label={t('facilities.detail.call', { phone })} class={ACTION}>
                      <Icon name="phone" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>

        {facility.specialty && (
          <div class="grid gap-1">
            <dt class="text-fluid-sm font-medium text-ink-muted">{t('facilities.detail.specialty')}</dt>
            <dd class="text-fluid-base text-ink">{facility.specialty}</dd>
          </div>
        )}

        <div class="grid gap-1">
          <dt class="text-fluid-sm font-medium text-ink-muted">{t('facilities.detail.services')}</dt>
          <dd>
            <ul aria-label={t('facilities.detail.services')} class="flex flex-wrap gap-2">
              {services.map((s) => (
                <li key={s} class="rounded-lg bg-surface px-2.5 py-1 text-fluid-sm text-ink">
                  {t(`facilities.service.${s}`)}
                </li>
              ))}
            </ul>
          </dd>
        </div>

        <div class="grid gap-1">
          <dt class="text-fluid-sm font-medium text-ink-muted">{t('facilities.detail.hours')}</dt>
          <dd class="whitespace-pre-line text-fluid-base text-ink">
            {facility.hours ?? t('facilities.detail.noHours')}
          </dd>
        </div>
      </dl>

      <p class="flex items-start gap-2 text-fluid-sm text-ink">
        <Icon name="info" class="mt-0.5 size-5" />
        <span>{t('facilities.detail.bring')}</span>
      </p>
    </article>
  )
}
