import { t } from '../i18n'

// Temporary placeholders for destinations that later tasks replace with real pages.

export function ClaimsStub() {
  return (
    <section>
      <h2 class="text-fluid-lg">{t('placeholder.claims')}</h2>
    </section>
  )
}

export function FacilitiesStub() {
  return (
    <section>
      <h2 class="text-fluid-lg">{t('placeholder.facilities')}</h2>
    </section>
  )
}
