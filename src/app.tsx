import { useEffect } from 'preact/hooks'
import { db } from './db/db'
import { accountState, loadAccount } from './data/account-state'
import { updateAvailable, applyUpdate } from './pwa'
import { matchRoute, refreshRoute, route, KNOWN_PATTERNS } from './router'
import { ROUTES } from './routes'
import { Onboarding } from './pages/Onboarding'
import { CardWallet } from './pages/CardWallet'
import { t } from './i18n'
import { Shell } from './ui/Shell'
import { IconButton } from './ui/IconButton'

const WALLET_PATTERN = '/wallet/:personId?'

function CurrentPage() {
  const match = matchRoute(route.value.path, KNOWN_PATTERNS)
  const Page = ROUTES[match?.pattern ?? '/']
  return <Page />
}

export function App() {
  useEffect(() => {
    refreshRoute()
    void loadAccount(db)
  }, [])

  const state = accountState.value
  const fullScreen = matchRoute(route.value.path, KNOWN_PATTERNS)?.pattern === WALLET_PATTERN
  let content
  if (state.status === 'loading') {
    content = (
      <main class="mx-auto w-full max-w-3xl px-gutter py-6">
        <p class="text-fluid-base text-ink-muted">{t('common.loading')}</p>
      </main>
    )
  } else if (state.status === 'none') {
    content = (
      <main class="mx-auto w-full max-w-3xl px-gutter py-6">
        <Onboarding />
      </main>
    )
  } else if (fullScreen) {
    content = <CardWallet />
  } else {
    content = (
      <Shell>
        <CurrentPage />
      </Shell>
    )
  }

  return (
    <>
      {content}
      {updateAvailable.value && (
        <div role="alert" class="fixed inset-x-gutter bottom-20 z-20 flex items-center justify-between rounded-xl bg-ink p-2 pl-4 text-surface lg:bottom-6 lg:left-auto lg:w-96">
          <span class="text-fluid-sm">{t('pwa.updateAvailable')}</span>
          <IconButton icon="reload" label={t('pwa.reload')} class="text-accent hover:bg-transparent" onClick={() => applyUpdate()} />
        </div>
      )}
    </>
  )
}
