import { useEffect, useState } from 'preact/hooks'
import { accountState } from '../data/account-state'
import { countOpenClaims } from '../data/claims-summary'
import { listPersons } from '../data/persons-repo'
import { db } from '../db/db'
import type { Person } from '../domain/types'
import { t } from '../i18n'
import { Icon } from '../ui/Icon'

const SHORTCUT =
  'flex min-h-11 items-center gap-3 rounded-xl bg-surface-2 px-gutter py-3 text-fluid-base font-medium text-ink transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

export function HomePage() {
  const state = accountState.value
  const accountId = state.status === 'ready' ? state.account.id : undefined
  const [holder, setHolder] = useState<Person | undefined>(undefined)
  const [openClaims, setOpenClaims] = useState(0)

  useEffect(() => {
    if (!accountId) return
    let active = true
    Promise.all([listPersons(db, accountId), countOpenClaims(db)]).then(([persons, count]) => {
      if (!active) return
      setHolder(persons.find((p) => p.role === 'holder'))
      setOpenClaims(count)
    })
    return () => {
      active = false
    }
  }, [accountId])

  if (!accountId) {
    return <p class="px-gutter py-4 text-fluid-base text-ink-muted">{t('common.loading')}</p>
  }

  return (
    <section class="flex flex-col gap-4 px-gutter py-4">
      <div class="flex flex-col gap-1 rounded-xl bg-surface-2 px-gutter py-4">
        {holder && (
          <>
            <h2 class="text-fluid-xl font-semibold text-ink">{holder.fullName}</h2>
            <p class="text-fluid-sm text-ink-muted">{t('home.tier', { tier: holder.tier })}</p>
          </>
        )}
        <p class="text-fluid-sm text-ink-muted">{t('home.openClaims', { count: openClaims })}</p>
      </div>

      <div class="flex flex-col gap-3">
        <a href="#/wallet" class={SHORTCUT}>
          <Icon name="card" class="size-6" />
          <span>{t('home.cardWallet')}</span>
        </a>
        <a href="#/claims" class={SHORTCUT}>
          <Icon name="claims" class="size-6" />
          <span>{t('home.newClaim')}</span>
        </a>
      </div>
    </section>
  )
}
