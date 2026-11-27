import { useEffect, useState } from 'preact/hooks'
import { accountState } from '../data/account-state'
import { countOpenClaims, countOverdue } from '../data/claims-summary'
import { loadReplyWindows } from '../data/reply-windows'
import { listPersons } from '../data/persons-repo'
import { db } from '../db/db'
import type { Person } from '../domain/types'
import { t } from '../i18n'
import { todayIso } from '../lib/dates'
import { Icon } from '../ui/Icon'

const SHORTCUT =
  'flex min-h-11 items-center gap-3 rounded-xl bg-surface-2 px-gutter py-3 text-fluid-base font-medium text-ink transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

export interface HomePageProps {
  /** Local day YYYY-MM-DD for the overdue count. Defaults to today; tests pass a fixed day. */
  today?: string
}

export function HomePage({ today }: HomePageProps = {}) {
  const state = accountState.value
  const account = state.status === 'ready' ? state.account : undefined
  const accountId = account?.id
  const administrator = account?.administrator
  const [holder, setHolder] = useState<Person | undefined>(undefined)
  const [openClaims, setOpenClaims] = useState(0)
  const [overdue, setOverdue] = useState(0)

  useEffect(() => {
    if (!accountId || administrator === undefined) return
    let active = true
    const day = today ?? todayIso()
    void Promise.all([listPersons(db, accountId), countOpenClaims(db), loadReplyWindows(administrator)]).then(
      async ([persons, count, windows]) => {
        const late = windows ? await countOverdue(db, day, windows) : 0
        if (!active) return
        setHolder(persons.find((p) => p.role === 'holder'))
        setOpenClaims(count)
        setOverdue(late)
      },
    )
    return () => {
      active = false
    }
  }, [accountId, administrator, today])

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
        {overdue > 0 && (
          <p class="flex items-center gap-1 text-fluid-sm text-red-600 dark:text-red-400">
            <Icon name="clock-alert" class="size-5" />
            {t('home.overdue', { count: overdue })}
          </p>
        )}
      </div>

      <div class="flex flex-col gap-3">
        <a href="#/wallet" class={SHORTCUT}>
          <Icon name="card" class="size-6" />
          <span>{t('home.cardWallet')}</span>
        </a>
        <a href="#/claims/new" class={SHORTCUT}>
          <Icon name="claim-add" class="size-6" />
          <span>{t('home.newClaim')}</span>
        </a>
        <a href="#/invoice-guide" class={SHORTCUT}>
          <Icon name="receipt" class="size-6" />
          <span>{t('home.invoiceGuide')}</span>
        </a>
        <a href="#/benefits" class={SHORTCUT}>
          <Icon name="shield" class="size-6" />
          <span>{t('benefits.title')}</span>
        </a>
        <a href="#/documents" class={SHORTCUT}>
          <Icon name="documents" class="size-6" />
          <span>{t('home.documents')}</span>
        </a>
      </div>
    </section>
  )
}
