import { syncStatus } from './sync/sync-engine'
import { updateAvailable, applyUpdate } from './pwa'
import { Icon } from './ui/Icon'
import { IconButton } from './ui/IconButton'

// Labels are in the UI language; icons are drawn per action (references/iconography.md).
const NAV = [
  { href: '#/', label: 'Home', icon: 'home' },
  { href: '#/settings', label: 'Settings', icon: 'settings' },
]

function SyncBadge() {
  const s = syncStatus.value
  const [icon, text] = !s.online
    ? ['cloud-off', `Offline${s.pending ? `, ${s.pending} pending` : ''}`]
    : s.pending
      ? ['sync', `Syncing ${s.pending}`]
      : ['cloud-check', 'Up to date']
  return (
    <span role="status" aria-label="Sync status" title={text} class="inline-flex min-h-11 items-center gap-1 text-ink-muted">
      <Icon name={icon} class="size-5" />
      {s.pending > 0 && <span aria-hidden="true" class="text-fluid-sm tabular-nums">{s.pending}</span>}
      <span class="sr-only">{text}</span>
    </span>
  )
}

export function App() {
  return (
    <div class="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <nav aria-label="Primary" class="hidden lg:flex lg:flex-col lg:gap-1 lg:border-r lg:border-surface-2 lg:p-gutter">
        {NAV.map((n) => (
          <a href={n.href} class="flex min-h-11 items-center gap-3 rounded-lg px-3 text-fluid-base hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent">
            <Icon name={n.icon} />
            {n.label}
          </a>
        ))}
      </nav>

      <div class="flex min-h-dvh flex-col">
        <header class="sticky top-0 z-10 flex items-center justify-between bg-surface/90 px-gutter pt-[env(safe-area-inset-top)] backdrop-blur">
          <h1 class="py-3 text-fluid-lg font-semibold">__APP_NAME__</h1>
          <SyncBadge />
        </header>

        <main class="mx-auto w-full max-w-3xl flex-1 px-gutter pb-24 lg:max-w-7xl lg:pb-8">
          <p class="text-fluid-base">Hello.</p>
        </main>

        {updateAvailable.value && (
          <div role="alert" class="fixed inset-x-gutter bottom-20 z-20 flex items-center justify-between rounded-xl bg-ink p-2 pl-4 text-surface lg:bottom-6 lg:left-auto lg:w-96">
            <span class="text-fluid-sm">New version available</span>
            <IconButton icon="reload" label="Reload" class="text-accent hover:bg-transparent" onClick={() => applyUpdate()} />
          </div>
        )}

        <nav aria-label="Tabs" class="fixed inset-x-0 bottom-0 z-10 flex border-t border-surface-2 bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
          {NAV.map((n) => (
            <a href={n.href} class="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 focus-visible:outline-2 focus-visible:outline-accent">
              <Icon name={n.icon} />
              <span class="text-[0.6875rem] leading-none">{n.label}</span>
            </a>
          ))}
        </nav>
      </div>
    </div>
  )
}
