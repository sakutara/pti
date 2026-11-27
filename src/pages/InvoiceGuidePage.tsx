import { useEffect, useState } from 'preact/hooks'
import { accountState } from '../data/account-state'
import { loadDataset, loadManifest } from '../data/datasets'
import { listPersons } from '../data/persons-repo'
import { db } from '../db/db'
import { parseClaimRequirements, type InvoiceGuidance } from '../domain/requirements-schema'
import type { Person } from '../domain/types'
import { t } from '../i18n'
import { route } from '../router'
import { InvoiceGuide } from '../ui/InvoiceGuide'
import { useLive } from '../ui/DocumentCard'

/** The invoice guidance of the claim requirements dataset. Null when the dataset cannot be read. */
async function loadGuidance(): Promise<InvoiceGuidance | null> {
  const manifest = await loadManifest()
  if (!manifest.ok) return null
  const file = manifest.data.datasets.claimRequirements?.files[0]
  if (!file) return null
  const loaded = await loadDataset(file, parseClaimRequirements)
  return loaded.ok ? loaded.data.invoiceGuidance : null
}

/**
 * `#/invoice-guide` for the holder, `#/invoice-guide/:personId` for a dependent. Everything comes from the device, so the
 * card works offline.
 */
export function InvoiceGuidePage() {
  const personId = route.value.params.personId ?? null
  const state = accountState.value
  const accountId = state.status === 'ready' ? state.account.id : undefined
  const persons = useLive<Person[]>(() => (accountId ? listPersons(db, accountId) : Promise.resolve([])), [accountId])
  const [guidance, setGuidance] = useState<InvoiceGuidance | null | undefined>(undefined)

  useEffect(() => {
    let active = true
    void loadGuidance().then((loaded) => {
      if (active) setGuidance(loaded)
    })
    return () => {
      active = false
    }
  }, [])

  if (accountId === undefined || persons === undefined || guidance === undefined) {
    return <p class="py-4 text-fluid-base text-ink-muted">{t('common.loading')}</p>
  }
  const person = personId === null ? persons.find((p) => p.role === 'holder') : persons.find((p) => p.id === personId)
  if (!person) return <p class="py-4 text-fluid-base text-ink-muted">{t('error.personNotFound')}</p>
  if (guidance === null) return <p class="py-4 text-fluid-base text-red-600 dark:text-red-400">{t('claim.datasetError')}</p>

  return (
    <section class="py-4">
      <InvoiceGuide person={person} guidance={guidance} />
    </section>
  )
}
