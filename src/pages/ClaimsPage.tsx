import { useEffect, useState } from 'preact/hooks'
import { accountState } from '../data/account-state'
import { loadReplyWindows } from '../data/reply-windows'
import {
  deleteDraft,
  getClaim,
  listClaimDocuments,
  listClaimEvents,
  listClaims,
  type StatusGroup,
} from '../data/claims-repo'
import { listPersons } from '../data/persons-repo'
import { threadUrl } from '../data/send-claim'
import { db } from '../db/db'
import { awaitingOriginals, isOverdue, replyLimit, requiresOriginals } from '../domain/working-days'
import type { Claim, ClaimEvent } from '../domain/claim-types'
import type { DocumentRecord } from '../domain/document-types'
import type { ReplyWindow } from '../domain/requirements-schema'
import type { Person } from '../domain/types'
import { t } from '../i18n'
import { todayIso } from '../lib/dates'
import { formatDateVi } from '../lib/format-date'
import { formatVnd } from '../lib/money'
import { navigate, route } from '../router'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { OriginalsStep } from '../ui/OriginalsStep'
import { OutcomeForm } from '../ui/OutcomeForm'
import { Timeline } from '../ui/Timeline'
import { documentName, useLive } from '../ui/DocumentCard'

const GROUPS: readonly StatusGroup[] = ['drafting', 'inProgress', 'done']
const OUTCOME_SHOWN = ['submitted', 'need_info', 'approved', 'partially_approved', 'rejected', 'paid'] as const

const CHIP =
  'min-h-11 rounded-xl px-3 text-fluid-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent bg-surface-2 text-ink aria-pressed:bg-accent aria-pressed:text-surface'

const LINK =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-surface-2 px-4 text-fluid-base font-medium text-ink hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

export interface ClaimsPageProps {
  /** Local day YYYY-MM-DD used for overdue marks. Defaults to today; tests pass a fixed day. */
  today?: string
}

/** Reply windows of the account's administrator, or null while loading or when they cannot be read. */
function useReplyWindows(administrator: string | undefined): ReplyWindow[] | null {
  const [windows, setWindows] = useState<ReplyWindow[] | null>(null)
  useEffect(() => {
    if (administrator === undefined) return
    let active = true
    void loadReplyWindows(administrator).then((loaded) => {
      if (active) setWindows(loaded)
    })
    return () => {
      active = false
    }
  }, [administrator])
  return windows
}

/** Overdue days for a claim, or null when it is not overdue (or the windows are unknown). */
function overdueDays(claim: Claim, today: string, windows: ReplyWindow[] | null): number | null {
  if (!windows || !isOverdue(claim, today, windows)) return null
  return replyLimit(claim.totalClaimed, windows)
}

/**
 * Claims: a list of the account's claims with filters, and the selected claim's detail beside it. Narrow screens show one
 * of the two at a time (`#/claims` the list, `#/claims/:id` the detail); from 1024 px both panes sit side by side.
 */
export function ClaimsPage({ today }: ClaimsPageProps = {}) {
  const day = today ?? todayIso()
  const id = route.value.params.id ?? null
  const state = accountState.value
  const account = state.status === 'ready' ? state.account : null
  const [group, setGroup] = useState<StatusGroup | null>(null)
  const [personId, setPersonId] = useState('')

  const persons = useLive<Person[]>(() => (account ? listPersons(db, account.id) : Promise.resolve([])), [account?.id])
  const claims = useLive<Claim[]>(
    () => listClaims(db, { group: group ?? undefined, personId: personId || undefined }),
    [group, personId],
  )
  const windows = useReplyWindows(account?.administrator)

  const personName = (pid: string) => persons?.find((p) => p.id === pid)?.fullName ?? ''

  return (
    <section class="flex flex-col gap-4 py-4 lg:grid lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start lg:gap-6">
      <div class={`${id === null ? 'flex' : 'hidden lg:flex'} min-w-0 flex-col gap-3`}>
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-fluid-lg font-semibold text-ink">{t('claim.title')}</h2>
          <IconButton icon="claim-add" label={t('claim.new')} showLabel variant="primary" onClick={() => navigate('/claims/new')} />
        </div>

        <div role="group" aria-label={t('claim.list.groupLabel')} class="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={group === null}
            class={CHIP}
            onClick={() => setGroup(null)}
          >
            {t('claim.list.filterAll')}
          </button>
          {GROUPS.map((g) => (
            <button key={g} type="button" aria-pressed={group === g} class={CHIP} onClick={() => setGroup(g)}>
              {t(`claim.group.${g}`)}
            </button>
          ))}
        </div>

        {persons && persons.length > 1 && (
          <div class="flex flex-col gap-1">
            <label for="claim-person-filter" class="text-fluid-sm text-ink-muted">
              {t('claim.list.filterPerson')}
            </label>
            <select
              id="claim-person-filter"
              value={personId}
              onChange={(e) => setPersonId(e.currentTarget.value)}
              class="min-h-11 rounded-lg bg-surface-2 px-3 text-fluid-base text-ink focus-visible:outline-2 focus-visible:outline-accent"
            >
              <option value="">{t('claim.list.allPersons')}</option>
              {persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </select>
          </div>
        )}

        {claims !== undefined && claims.length === 0 && (
          <p class="text-fluid-sm text-ink-muted">{t(group === null && personId === '' ? 'claim.empty' : 'claim.list.empty')}</p>
        )}

        <ul class="flex flex-col gap-2">
          {(claims ?? []).map((claim) => {
            const late = overdueDays(claim, day, windows)
            return (
              <li key={claim.id}>
                <a
                  href={`#/claims/${claim.id}`}
                  aria-current={claim.id === id ? 'true' : undefined}
                  class="flex min-h-11 flex-col gap-1 rounded-xl bg-surface-2 p-3 text-ink hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-[current=true]:ring-2 aria-[current=true]:ring-accent"
                >
                  <span class="text-fluid-base font-medium">
                    {personName(claim.personId)} · {t(`claim.type.${claim.type}`)}
                  </span>
                  <span class="text-fluid-sm text-ink-muted tabular-nums">{formatDateVi(claim.treatmentDate)}</span>
                  <span class="text-fluid-sm tabular-nums">{formatVnd(claim.totalClaimed)}</span>
                  <span class="text-fluid-sm">{t(`claim.status.${claim.status}`)}</span>
                  {late !== null && (
                    <span class="flex items-center gap-1 text-fluid-sm text-red-600 dark:text-red-400">
                      <Icon name="clock-alert" class="size-5" />
                      <span>{t('claim.overdue', { days: late })}</span>
                    </span>
                  )}
                  {claim.status === 'submitted' && awaitingOriginals(claim) && (
                    <span class="text-fluid-sm text-red-600 dark:text-red-400">{t('claim.originals.pending')}</span>
                  )}
                </a>
              </li>
            )
          })}
        </ul>
      </div>

      <div class={`${id === null ? 'hidden lg:flex' : 'flex'} min-w-0 flex-col gap-4`}>
        {id === null ? (
          <p class="text-fluid-base text-ink-muted">{t('claim.list.pickOne')}</p>
        ) : (
          <ClaimDetail key={id} id={id} today={day} windows={windows} persons={persons ?? []} />
        )}
      </div>
    </section>
  )
}

interface ClaimDetailProps {
  id: string
  today: string
  windows: ReplyWindow[] | null
  persons: Person[]
}

/** The selected claim: summary, actions, documents, the outcome form and the timeline. */
function ClaimDetail({ id, today, windows, persons }: ClaimDetailProps) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The read is tagged with its id, so a claim from the previous route never counts as this one.
  const loaded = useLive<{ id: string; claim: Claim | null }>(
    () => getClaim(db, id).then((claim) => ({ id, claim: claim ?? null })),
    [id],
  )
  const events = useLive<ClaimEvent[]>(() => listClaimEvents(db, id), [id])
  const documents = useLive<DocumentRecord[]>(() => listClaimDocuments(db, id), [id])

  if (loaded === undefined || loaded.id !== id) return <p class="text-fluid-base text-ink-muted">{t('common.loading')}</p>
  const claim = loaded.claim
  if (claim === null) return <p class="text-fluid-base text-ink-muted">{t('claim.notFound')}</p>

  const late = overdueDays(claim, today, windows)
  const personName = persons.find((p) => p.id === claim.personId)?.fullName ?? ''
  const canContinue = claim.status === 'draft' || claim.status === 'ready'
  const canAddDocs = claim.status === 'need_info'
  const canDelete = claim.status === 'draft'
  const showOutcome = (OUTCOME_SHOWN as readonly string[]).includes(claim.status)

  async function onDelete() {
    const result = await deleteDraft(db, id)
    if (result.ok) {
      navigate('/claims')
      return
    }
    setError(Object.values(result.errors).map((code) => t(code)).join(' '))
    setConfirming(false)
  }

  return (
    <article aria-labelledby="claim-detail-title" class="flex flex-col gap-4">
      <div class="lg:hidden">
        <IconButton icon="chevron-left" label={t('common.back')} showLabel onClick={() => navigate('/claims')} />
      </div>

      <header class="flex flex-col gap-1">
        <h2 id="claim-detail-title" class="text-fluid-xl font-semibold text-ink">
          {t(`claim.type.${claim.type}`)}
        </h2>
        <p class="text-fluid-base text-ink-muted">{personName}</p>
        <p class="text-fluid-sm font-medium text-ink">{t(`claim.status.${claim.status}`)}</p>
        {late !== null && (
          <p class="flex items-center gap-1 text-fluid-sm text-red-600 dark:text-red-400">
            <Icon name="clock-alert" class="size-5" />
            <span>{t('claim.overdue', { days: late })}</span>
          </p>
        )}
        {claim.status === 'submitted' && awaitingOriginals(claim) && (
          <p class="text-fluid-sm text-red-600 dark:text-red-400">{t('claim.originals.pending')}</p>
        )}
      </header>

      <section aria-labelledby="claim-summary-title" class="flex flex-col gap-2">
        <h3 id="claim-summary-title" class="sr-only">
          {t('claim.detail.summary')}
        </h3>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-fluid-sm">
          <dt class="text-ink-muted">{t('claim.treatment.date')}</dt>
          <dd class="text-ink">{formatDateVi(claim.treatmentDate)}</dd>
          <dt class="text-ink-muted">{t('claim.treatment.facility')}</dt>
          <dd class="text-ink">{claim.facilityName || '—'}</dd>
          <dt class="text-ink-muted">{t('claim.treatment.reason')}</dt>
          <dd class="text-ink">{claim.reason || '—'}</dd>
          <dt class="text-ink-muted">{t('claim.invoices.total')}</dt>
          <dd class="tabular-nums text-ink">{formatVnd(claim.totalClaimed)}</dd>
        </dl>
      </section>

      <div class="flex flex-wrap gap-2">
        {canContinue && (
          <a href={`#/claims/${id}/edit`} class={LINK}>
            <Icon name="status-edit" class="size-5" />
            {t('claim.detail.continue')}
          </a>
        )}
        {canAddDocs && (
          <a href={`#/claims/${id}/edit`} class={LINK}>
            <Icon name="claim-add" class="size-5" />
            {t('claim.detail.addDocs')}
          </a>
        )}
        {claim.gmailThreadId && (
          <a href={threadUrl(claim.gmailThreadId)} target="_blank" rel="noopener noreferrer" class={LINK}>
            <Icon name="external-link" class="size-5" />
            {t('claim.list.openThread')}
          </a>
        )}
      </div>

      {canDelete && !confirming && (
        <div>
          <IconButton icon="trash" label={t('claim.list.delete')} showLabel variant="danger" onClick={() => setConfirming(true)} />
        </div>
      )}
      {canDelete && confirming && (
        <div role="group" aria-label={t('claim.list.delete')} class="flex flex-col gap-2 rounded-xl bg-surface-2 p-4">
          <p class="text-fluid-sm text-ink">{t('claim.list.deleteConfirm')}</p>
          <div class="flex flex-wrap gap-2">
            <IconButton icon="trash" label={t('claim.list.deleteYes')} showLabel variant="danger" onClick={() => void onDelete()} />
            <IconButton icon="close" label={t('common.cancel')} showLabel onClick={() => setConfirming(false)} />
          </div>
        </div>
      )}
      {error && (
        <p role="alert" class="text-fluid-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <section aria-labelledby="claim-docs-title" class="flex flex-col gap-2">
        <h3 id="claim-docs-title" class="text-fluid-base font-semibold text-ink">
          {t('claim.docs.title')}
        </h3>
        {documents && documents.length === 0 && <p class="text-fluid-sm text-ink-muted">{t('claim.docs.empty')}</p>}
        {documents && documents.length > 0 && (
          <>
            <p class="text-fluid-sm text-ink-muted">{t('claim.docs.attached', { count: documents.length })}</p>
            <ul class="flex flex-col gap-1 text-fluid-sm text-ink">
              {documents.map((doc) => (
                <li key={doc.id} class="rounded-lg bg-surface-2 px-3 py-2">
                  {documentName(doc)}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {showOutcome && <OutcomeForm key={claim.status} claim={claim} />}

      {claim.status === 'submitted' && requiresOriginals(claim.type) && <OriginalsStep claim={claim} />}

      {events && <Timeline claim={claim} events={events} />}
    </article>
  )
}
