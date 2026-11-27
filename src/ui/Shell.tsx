import type { ComponentChildren } from 'preact'
import { syncStatus } from '../sync/sync-engine'
import { route } from '../router'
import { t, type MessageKey } from '../i18n'
import { Icon } from './Icon'
import { DataNotice } from './DataNotice'
import { LegalLinks } from './LegalLinks'

// One list drives both the side nav (lg+) and the bottom tabs (below lg).
const NAV: { href: string; path: string; key: MessageKey; icon: string }[] = [
  { href: '#/', path: '/', key: 'nav.home', icon: 'home' },
  { href: '#/claims', path: '/claims', key: 'nav.claims', icon: 'claims' },
  { href: '#/facilities', path: '/facilities', key: 'nav.facilities', icon: 'facility' },
  { href: '#/account', path: '/account', key: 'nav.account', icon: 'account' },
]

/** Home is active only on exact '/'; other destinations also cover their nested paths. */
function isActive(destination: string, path: string): boolean {
  if (destination === '/') return path === '/'
  return path === destination || path.startsWith(`${destination}/`)
}

export function SyncBadge() {
  const s = syncStatus.value
  const [icon, text] = !s.online
    ? ['cloud-off', s.pending ? t('sync.offlinePending', { count: s.pending }) : t('sync.offline')]
    : s.pending
      ? ['sync', t('sync.syncing', { count: s.pending })]
      : ['cloud-check', t('sync.upToDate')]
  return (
    <span role="status" aria-label={t('sync.label')} title={text} class="inline-flex min-h-11 items-center gap-1 text-ink-muted">
      <Icon name={icon} class="size-5" />
      {s.pending > 0 && <span aria-hidden="true" class="text-fluid-sm tabular-nums">{s.pending}</span>}
      <span class="sr-only">{text}</span>
    </span>
  )
}

export function Shell({ children }: { children?: ComponentChildren }) {
  const path = route.value.path
  return (
    <div class="min-h-dvh overflow-x-clip lg:grid lg:grid-cols-[16rem_1fr]">
      <div class="hidden lg:flex lg:flex-col lg:gap-1 lg:border-r lg:border-surface-2 lg:p-gutter">
        <nav aria-label={t('nav.primary')} class="flex flex-col gap-1">
          {NAV.map((n) => (
            <a
              href={n.href}
              aria-current={isActive(n.path, path) ? 'page' : undefined}
              class="flex min-h-11 items-center gap-3 rounded-lg px-3 text-fluid-base hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent aria-[current=page]:font-semibold aria-[current=page]:text-accent"
            >
              <Icon name={n.icon} />
              {t(n.key)}
            </a>
          ))}
        </nav>
        <LegalLinks class="mt-auto border-t border-surface-2 pt-2" />
      </div>

      <div class="flex min-h-dvh flex-col">
        <header class="sticky top-0 z-10 flex items-center justify-between bg-surface/90 px-gutter pt-[env(safe-area-inset-top)] backdrop-blur">
          <h1 class="py-3 text-fluid-lg font-semibold">{t('app.name')}</h1>
          <SyncBadge />
        </header>

        <main class="mx-auto w-full max-w-3xl flex-1 px-gutter pb-24 lg:max-w-7xl lg:pb-8">
          <DataNotice />
          {children}
        </main>

        <nav aria-label={t('nav.tabs')} class="fixed inset-x-0 bottom-0 z-10 flex border-t border-surface-2 bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
          {NAV.map((n) => (
            <a
              href={n.href}
              aria-current={isActive(n.path, path) ? 'page' : undefined}
              class="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 focus-visible:outline-2 focus-visible:outline-accent aria-[current=page]:text-accent"
            >
              <Icon name={n.icon} />
              <span class="text-[0.6875rem] leading-none">{t(n.key)}</span>
            </a>
          ))}
        </nav>
      </div>
    </div>
  )
}
