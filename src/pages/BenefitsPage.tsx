import { useEffect, useState } from 'preact/hooks'
import { accountState } from '../data/account-state'
import { loadDataset, loadManifest } from '../data/datasets'
import { listPersons } from '../data/persons-repo'
import { db } from '../db/db'
import { benefitsFor, pickPolicyYear } from '../domain/benefits'
import { parseBenefits, type BenefitsDataset, type Result } from '../domain/benefits-schema'
import type { Person } from '../domain/types'
import { t } from '../i18n'
import { formatDateVi } from '../lib/format-date'
import { todayIso } from '../lib/dates'
import { navigate, route } from '../router'
import { BenefitGroup } from '../ui/BenefitGroup'
import { Icon } from '../ui/Icon'
import { PersonPicker } from '../ui/PersonPicker'
import { PolicyConditions, PolicyYearInfo } from '../ui/PolicyConditions'
import { TierCompare } from '../ui/TierCompare'

type DataState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; datasets: BenefitsDataset[] }

/** Reads the manifest, then every benefits file it lists. Any failure fails the whole load. */
async function loadBenefitsDatasets(): Promise<Result<BenefitsDataset[]>> {
  const manifest = await loadManifest()
  if (!manifest.ok) return manifest
  const entry = manifest.data.datasets.benefits
  if (!entry) return { ok: false, error: 'manifest thiếu benefits' }
  const datasets: BenefitsDataset[] = []
  for (const file of entry.files) {
    const loaded = await loadDataset(file, parseBenefits)
    if (!loaded.ok) return loaded
    datasets.push(loaded.data)
  }
  return { ok: true, data: datasets }
}

const BANNER = 'grid gap-1 rounded-xl border border-red-600 bg-red-50 p-4 text-ink dark:bg-red-950'

/** Shown above the benefits when the dataset has not been checked against the policy documents. */
function VerificationBanner() {
  return (
    <section aria-labelledby="verification-heading" class={BANNER}>
      <h3 id="verification-heading" class="flex items-center gap-2 text-fluid-base font-semibold">
        <Icon name="info" class="size-5" />
        {t('benefits.unverified')}
      </h3>
      <p class="text-fluid-sm text-ink-muted">{t('benefits.unverifiedExplain')}</p>
    </section>
  )
}

/** Benefits of one person (holder by default) for the policy year that covers `today`. */
export function BenefitsPage({ today = todayIso() }: { today?: string }) {
  const state = accountState.value
  const accountId = state.status === 'ready' ? state.account.id : null
  const personId = route.value.params.personId
  const [data, setData] = useState<DataState>({ status: 'loading' })
  const [persons, setPersons] = useState<Person[] | null>(null)

  useEffect(() => {
    let alive = true
    void loadBenefitsDatasets().then((result) => {
      if (!alive) return
      setData(result.ok ? { status: 'ready', datasets: result.data } : { status: 'error' })
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (accountId === null) return
    let alive = true
    void listPersons(db, accountId).then((rows) => {
      if (alive) setPersons(rows)
    })
    return () => {
      alive = false
    }
  }, [accountId])

  if (data.status === 'error') {
    return (
      <p role="alert" class="py-4 text-fluid-base text-red-600 dark:text-red-400">
        {t('benefits.error')}
      </p>
    )
  }
  if (data.status === 'loading' || persons === null) {
    return <p class="py-4 text-fluid-base text-ink-muted">{t('common.loading')}</p>
  }

  const dataset = pickPolicyYear(data.datasets, today)
  if (!dataset) {
    return <p class="py-4 text-fluid-base text-ink-muted">{t('benefits.noYear', { date: formatDateVi(today) })}</p>
  }

  const holder = persons.find((p) => p.role === 'holder')
  const person = persons.find((p) => p.id === personId) ?? holder
  if (!person) {
    return <p class="py-4 text-fluid-base text-ink-muted">{t('benefits.noPerson')}</p>
  }

  const groups = benefitsFor(dataset, person.tier, person.memberType)

  return (
    <section class="grid gap-6 py-4 lg:grid-cols-2 lg:items-start">
      <div class="order-1 grid min-w-0 gap-6">
        <PersonPicker
          persons={persons}
          selectedId={person.id}
          onSelect={(id) => navigate(`/benefits/${id}`)}
        />

        <header class="grid gap-1">
          <h2 class="text-fluid-xl font-semibold text-ink">{person.fullName}</h2>
          <p class="text-fluid-base font-medium text-ink">{t('home.tier', { tier: person.tier })}</p>
          <p class="text-fluid-sm text-ink-muted">{dataset.memberTypes[person.memberType]}</p>
        </header>

        {!dataset.verified && <VerificationBanner />}

        <div class="grid gap-4">
          {groups.map((group) => (
            <BenefitGroup key={group.category} group={group} hotline={dataset.hotline} />
          ))}
        </div>
      </div>

      <div class="order-3 grid min-w-0 gap-6 lg:order-2">
        <PolicyYearInfo dataset={dataset} />
        <PolicyConditions dataset={dataset} memberType={person.memberType} />
      </div>

      {/* Full content width at lg: the table spans both columns instead of sitting in the left one. */}
      <div class="order-2 grid min-w-0 gap-4 lg:order-3 lg:col-span-2">
        <TierCompare dataset={dataset} memberType={person.memberType} tier={person.tier} />
      </div>
    </section>
  )
}
