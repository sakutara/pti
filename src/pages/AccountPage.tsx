import { useEffect, useState } from 'preact/hooks'
import { accountState } from '../data/account-state'
import { listPersons } from '../data/persons-repo'
import { db } from '../db/db'
import type { Person } from '../domain/types'
import { t } from '../i18n'
import { navigate } from '../router'
import { BackupSection } from '../ui/BackupSection'
import { ClaimSettingsForm } from '../ui/ClaimSettingsForm'
import { IconButton } from '../ui/IconButton'
import { LegalLinks } from '../ui/LegalLinks'

const ROW =
  'flex min-h-11 flex-col justify-center gap-0.5 rounded-xl bg-surface-2 px-gutter py-3 text-ink transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

/** Holder first, then dependents. Each row opens the person's edit page. */
function PersonList({ accountId }: { accountId: string }) {
  const [persons, setPersons] = useState<Person[] | null>(null)

  useEffect(() => {
    let alive = true
    void listPersons(db, accountId).then((rows) => {
      if (alive) setPersons(rows)
    })
    return () => {
      alive = false
    }
  }, [accountId])

  return (
    <section aria-labelledby="account-people-heading" class="grid gap-3">
      <div class="flex items-center justify-between gap-2">
        <h2 id="account-people-heading" class="text-fluid-lg font-semibold text-ink">
          {t('account.people')}
        </h2>
        <IconButton icon="person-add" label={t('account.addDependent')} onClick={() => navigate('/account/person/new')} />
      </div>

      {persons === null ? (
        <p class="text-fluid-base text-ink-muted">{t('common.loading')}</p>
      ) : (
        <ul class="flex flex-col gap-2">
          {persons.map((person) => {
            const relation = t(`person.relation.${person.relation}`)
            return (
              <li key={person.id}>
                <a href={`#/account/person/${person.id}`} class={ROW}>
                  <span class="text-fluid-base font-medium">{person.fullName}</span>
                  <span class="text-fluid-sm text-ink-muted">{`${relation} · ${t('home.tier', { tier: person.tier })}`}</span>
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** Tài khoản: people on the left (lg), claim settings and backup on the right. One column below lg. */
export function AccountPage() {
  const state = accountState.value
  if (state.status !== 'ready') {
    return <p class="py-4 text-fluid-base text-ink-muted">{t('common.loading')}</p>
  }

  return (
    <>
      <div class="grid gap-6 py-4 lg:grid-cols-[20rem_1fr] lg:items-start">
        <PersonList accountId={state.account.id} />
        <div class="flex flex-col gap-6">
          <ClaimSettingsForm account={state.account} />
          <BackupSection />
        </div>
      </div>
      {/* Hidden at lg: the side nav already carries these links on desktop. */}
      <LegalLinks class="justify-center pb-4 lg:hidden" />
    </>
  )
}
