import { t } from '../i18n'

const LINK =
  'inline-flex min-h-11 items-center text-fluid-sm text-ink-muted underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

/** Plain full-navigation links to the static About and Privacy pages (not hash routes). */
export function LegalLinks({ class: cls = '' }: { class?: string }) {
  return (
    <nav aria-label={t('legal.nav')} class={`flex flex-wrap gap-x-4 ${cls}`}>
      <a href="/about/" class={LINK}>
        {t('legal.about')}
      </a>
      <a href="/privacy/" class={LINK}>
        {t('legal.privacy')}
      </a>
    </nav>
  )
}
