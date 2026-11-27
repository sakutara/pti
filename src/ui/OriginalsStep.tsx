import { useEffect, useState } from 'preact/hooks'
import { accountState } from '../data/account-state'
import { recordOriginals } from '../data/claims-repo'
import { loadDataset, loadManifest } from '../data/datasets'
import { db } from '../db/db'
import type { Claim, ClaimStatus } from '../domain/claim-types'
import { parseAdministrator, type AdministratorConfig } from '../domain/requirements-schema'
import { todayIso } from '../lib/dates'
import { formatDateVi } from '../lib/format-date'
import { t } from '../i18n'
import { IconButton } from './IconButton'

/** Statuses after the claim was sent: the handed-in date can be recorded only then. */
const SENT: readonly ClaimStatus[] = ['submitted', 'need_info', 'approved', 'partially_approved', 'rejected', 'paid']

/** The administrator file of the account, read through the manifest. Null when it cannot be read. */
async function loadAdministrator(id: string): Promise<AdministratorConfig | null> {
  const manifest = await loadManifest()
  if (!manifest.ok) return null
  const file = manifest.data.datasets.administrators?.files.find((f) => f.endsWith(`${id}.json`))
  if (!file) return null
  const loaded = await loadDataset(file, parseAdministrator)
  return loaded.ok ? loaded.data : null
}

/**
 * Originals for claim types the email does not cover (inpatient, maternity; see emailClaimTypes). Says that the email
 * is only a completeness check, lists the claim centre addresses and records the day the originals were handed in.
 * Renders nothing for an email type. Used by the send step and the claim detail.
 */
export function OriginalsStep({ claim }: { claim: Claim }) {
  const account = accountState.value.status === 'ready' ? accountState.value.account : null
  const administratorId = account?.administrator
  const [administrator, setAdministrator] = useState<AdministratorConfig | null>(null)
  const [recordedAt, setRecordedAt] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (administratorId === undefined) return
    let alive = true
    void loadAdministrator(administratorId).then((loaded) => {
      if (alive) setAdministrator(loaded)
    })
    return () => {
      alive = false
    }
  }, [administratorId])

  if (administrator === null || administrator.emailClaimTypes.includes(claim.type)) return null

  const recorded = recordedAt ?? claim.originalsSubmittedAt

  async function record() {
    setBusy(true)
    setError(null)
    const at = Date.now()
    const result = await recordOriginals(db, claim.id, at, t('claim.originals.noteEvent'))
    setBusy(false)
    if (result.ok) {
      setRecordedAt(at)
    } else {
      setError(Object.values(result.errors).map((code) => t(code)).join(' '))
    }
  }

  return (
    <section aria-labelledby="originals-heading" class="grid gap-3 rounded-xl border border-surface-2 p-4">
      <h2 id="originals-heading" class="text-fluid-lg font-semibold text-ink">
        {t('claim.originals.title')}
      </h2>
      <p class="text-fluid-base text-ink">{t('claim.originals.reminder')}</p>

      <div class="grid gap-2">
        <p class="text-fluid-sm font-medium text-ink">{t('claim.originals.address')}</p>
        <ul class="grid gap-2">
          {administrator.originalsAddresses.map((entry) => (
            <li key={entry.region} class="text-fluid-sm text-ink">
              <span class="font-medium">{entry.region}: </span>
              {entry.address}
            </li>
          ))}
        </ul>
      </div>

      {recorded !== null ? (
        <p role="status" class="text-fluid-sm text-ink">
          {t('claim.originals.recorded', { date: formatDateVi(todayIso(new Date(recorded))) })}
        </p>
      ) : SENT.includes(claim.status) ? (
        <IconButton
          icon="check"
          label={t('claim.originals.confirm')}
          showLabel
          variant="primary"
          disabled={busy}
          onClick={() => void record()}
        />
      ) : null}

      {error !== null ? (
        <p role="alert" class="text-fluid-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </section>
  )
}
