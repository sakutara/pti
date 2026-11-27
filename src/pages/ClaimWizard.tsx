import { useEffect, useState } from 'preact/hooks'
import { accountState } from '../data/account-state'
import { loadDataset, loadManifest } from '../data/datasets'
import {
  createDraft,
  getClaim,
  listClaimDocuments,
  setStatus,
  updateClaim,
  type ClaimPatch,
} from '../data/claims-repo'
import { listPersons } from '../data/persons-repo'
import { db } from '../db/db'
import { pickPolicyYear } from '../domain/benefits'
import { parseBenefits, type BenefitsDataset, type Result } from '../domain/benefits-schema'
import type { Claim, ClaimStatus, ClaimType, WizardStep } from '../domain/claim-types'
import type { DocumentRecord } from '../domain/document-types'
import { parseFacilities, type Facility } from '../domain/facilities-schema'
import {
  parseAdministrator,
  parseClaimRequirements,
  type AdministratorConfig,
  type ClaimRequirements,
} from '../domain/requirements-schema'
import type { Account, Person } from '../domain/types'
import { t } from '../i18n'
import { todayIso } from '../lib/dates'
import { replacePath, route } from '../router'
import { ChecksPanel } from '../ui/ChecksPanel'
import { useLive } from '../ui/DocumentCard'
import { IconButton } from '../ui/IconButton'
import { StepDocuments } from '../ui/wizard/StepDocuments'
import { StepInvoices } from '../ui/wizard/StepInvoices'
import { StepPerson } from '../ui/wizard/StepPerson'
import { StepReview } from '../ui/wizard/StepReview'
import { StepTreatment } from '../ui/wizard/StepTreatment'
import { StepType } from '../ui/wizard/StepType'

/** Wizard steps in order: person, type, treatment, invoices, documents, review. */
export const STEP_COUNT = 6
const LAST_STEP = STEP_COUNT - 1
const STEP_NAMES = [
  'claim.step.person',
  'claim.step.type',
  'claim.step.treatment',
  'claim.step.invoices',
  'claim.step.documents',
  'claim.step.review',
] as const

/** Everything the wizard reads from the bundled datasets. */
export interface ClaimDatasets {
  requirements: ClaimRequirements
  administrator: AdministratorConfig
  facilities: Facility[]
  benefits: BenefitsDataset[]
}

/**
 * Reads the manifest, then every dataset the wizard needs. The administrator is the one of the account. Any failure
 * fails the whole load.
 */
export async function loadClaimDatasets(administratorId: string): Promise<Result<ClaimDatasets>> {
  const manifest = await loadManifest()
  if (!manifest.ok) return manifest
  const { datasets } = manifest.data
  const requirementsFile = datasets.claimRequirements?.files[0]
  const facilitiesFile = datasets.facilities?.files[0]
  const adminFile = datasets.administrators?.files.find((f) => f.endsWith(`${administratorId}.json`))
  if (!requirementsFile || !facilitiesFile || !adminFile || !datasets.benefits) {
    return { ok: false, error: 'manifest thiếu dữ liệu hồ sơ' }
  }

  const requirements = await loadDataset(requirementsFile, parseClaimRequirements)
  if (!requirements.ok) return requirements
  const administrator = await loadDataset(adminFile, parseAdministrator)
  if (!administrator.ok) return administrator
  const facilities = await loadDataset(facilitiesFile, parseFacilities)
  if (!facilities.ok) return facilities
  const benefits: BenefitsDataset[] = []
  for (const file of datasets.benefits.files) {
    const loaded = await loadDataset(file, parseBenefits)
    if (!loaded.ok) return loaded
    benefits.push(loaded.data)
  }
  return {
    ok: true,
    data: {
      requirements: requirements.data,
      administrator: administrator.data,
      facilities: facilities.data.facilities,
      benefits,
    },
  }
}

/**
 * How much of the claim the user may change. draft and ready: everything (a ready claim goes back to draft on the first
 * change); need_info: documents and invoices only, the status stays; submitted and later: nothing.
 */
export type Access = 'full' | 'documents' | 'none'

export function accessOf(status: ClaimStatus | undefined): Access {
  if (status === undefined || status === 'draft' || status === 'ready') return 'full'
  if (status === 'need_info') return 'documents'
  return 'none'
}

/** Whether a step (0-based) may be changed under the given access. */
export const stepWritable = (access: Access, step: number): boolean =>
  access === 'full' || (access === 'documents' && (step === 3 || step === 4))

/** True when the patch changes a value of the claim. Moving the wizard step alone is not an edit. */
export function changesClaim(claim: Claim, patch: ClaimPatch): boolean {
  return (Object.keys(patch) as (keyof ClaimPatch)[]).some(
    (key) => key !== 'wizardStep' && JSON.stringify(claim[key]) !== JSON.stringify(patch[key]),
  )
}

const errorLines = (errors: Record<string, string>): string[] => Object.values(errors).map((code) => t(code))

/**
 * The claim wizard, for `#/claims/new` (no draft yet) and `#/claims/:id/edit`. Answers of the current step are kept
 * as pending edits and saved with the step change, so every step saves the draft. The person and the type are chosen
 * before the first draft is created.
 */
export function ClaimWizard() {
  const id = route.value.params.id ?? null
  const account = accountState.value.status === 'ready' ? accountState.value.account : null

  const [datasets, setDatasets] = useState<ClaimDatasets | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  // The step is the claim's saved step until the user moves; a move only sets the step of this route.
  const [moved, setMoved] = useState<{ id: string | null; step: number } | null>(null)
  // Pending answers are keyed by route and step, so they can never leak into another step.
  const [edits, setEdits] = useState<{ key: string; patch: ClaimPatch }>({ key: '', patch: {} })
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [newPersonId, setNewPersonId] = useState<string | null>(null)
  const [newType, setNewType] = useState<ClaimType | null>(null)
  // Bumped when the review changes the claim or its files (build, send), so the reads below run again.
  const [revision, setRevision] = useState(0)

  // The read is tagged with the id it was made for, so a value from the previous route counts as still loading.
  const loaded = useLive<{ id: string | null; claim: Claim | null }>(
    () => (id === null ? Promise.resolve({ id, claim: null }) : getClaim(db, id).then((c) => ({ id, claim: c ?? null }))),
    [id, revision],
  )
  const claim: Claim | null | undefined = loaded && loaded.id === id ? loaded.claim : undefined
  const persons = useLive<Person[]>(() => (account ? listPersons(db, account.id) : Promise.resolve([])), [account?.id])
  const documents = useLive<DocumentRecord[]>(() => (id ? listClaimDocuments(db, id) : Promise.resolve([])), [id, revision])

  const administratorId = account?.administrator
  useEffect(() => {
    if (administratorId === undefined) return
    let alive = true
    void loadClaimDatasets(administratorId).then((loaded) => {
      if (!alive) return
      if (loaded.ok) setDatasets(loaded.data)
      else setLoadFailed(true)
    })
    return () => {
      alive = false
    }
  }, [administratorId])

  const step = (moved !== null && moved.id === id ? moved.step : (claim?.wizardStep ?? 0)) as WizardStep
  const stepKey = `${id ?? ''}:${step}`
  const pending: ClaimPatch = edits.key === stepKey ? edits.patch : {}
  const setStep = (next: WizardStep) => {
    setMoved({ id, step: next })
    setEdits({ key: '', patch: {} })
    setErrors([])
  }

  if (id !== null && claim === undefined) return <p class="py-4 text-fluid-base text-ink-muted">{t('common.loading')}</p>
  if (id !== null && claim === null) return <p class="py-4 text-fluid-base text-ink-muted">{t('claim.notFound')}</p>
  if (loadFailed) return <p class="py-4 text-fluid-base text-red-600 dark:text-red-400">{t('facilities.error')}</p>
  if (!account || !datasets) return <p class="py-4 text-fluid-base text-ink-muted">{t('common.loading')}</p>

  const data: ClaimDatasets = datasets
  const ready: Account = account
  const personList = persons ?? []
  const docs = documents ?? []
  const access = accessOf(claim?.status)
  const writable = (at: number) => stepWritable(access, at)
  const view: Claim | null = claim ? ({ ...claim, ...pending } as Claim) : null
  const person = view ? (personList.find((p) => p.id === view.personId) ?? null) : null
  const newPerson = personList.find((p) => p.id === newPersonId) ?? null
  const facility = view?.facilityId ? (data.facilities.find((f) => f.id === view.facilityId) ?? null) : null
  const benefits = view ? pickPolicyYear(data.benefits, view.treatmentDate) : null

  const change = (patch: ClaimPatch) =>
    setEdits((current) => ({ key: stepKey, patch: { ...(current.key === stepKey ? current.patch : {}), ...patch } }))

  /** A ready claim goes back to draft when it is changed; a claim in any other status is left alone. */
  async function reopenIfReady(): Promise<void> {
    if (id === null) return
    const latest = await db.claims.get(id)
    if (latest?.status === 'ready') await setStatus(db, id, 'draft')
  }

  /** Saves a patch to the saved claim. Returns false (and shows the errors) when the repo refuses it. */
  async function save(patch: ClaimPatch): Promise<boolean> {
    if (!claim || id === null) return false
    const outcome = await updateClaim(db, id, patch)
    if (!outcome.ok) {
      setErrors(errorLines(outcome.errors))
      return false
    }
    setErrors([])
    if (changesClaim(claim, patch)) await reopenIfReady()
    return true
  }

  /** Moves to another step. Edit mode saves the pending answers and the step; a claim that takes no changes is not written. */
  async function goTo(next: WizardStep) {
    if (busy || (next === step && Object.keys(pending).length === 0)) return
    if (!claim) {
      setStep(next)
      return
    }
    if (access === 'none') {
      setStep(next)
      return
    }
    setBusy(true)
    try {
      if (await save({ ...pending, wizardStep: next })) setStep(next)
    } finally {
      setBusy(false)
    }
  }

  /** The first save of a new claim: the draft is created from the person and the type, then the route becomes the edit route. */
  async function createNewDraft() {
    if (newPersonId === null || newType === null) return
    setBusy(true)
    try {
      const created = await createDraft(db, { personId: newPersonId, type: newType }, todayIso())
      if (!created.ok) {
        setErrors(errorLines(created.errors))
        return
      }
      const wrote = await updateClaim(db, created.claim.id, { wizardStep: 2 })
      if (!wrote.ok) {
        setErrors(errorLines(wrote.errors))
        return
      }
      replacePath(`/claims/${created.claim.id}/edit`)
    } finally {
      setBusy(false)
    }
  }

  const onBack = () => void goTo(Math.max(0, step - 1) as WizardStep)
  const onNext = () => {
    if (!claim) {
      if (step === 0) setStep(1)
      else void createNewDraft()
      return
    }
    void goTo(Math.min(LAST_STEP, step + 1) as WizardStep)
  }
  const canNext = !!claim || (step === 0 ? newPersonId !== null : step === 1 ? newType !== null : true)

  function renderStep() {
    if (step === 0) {
      return (
        <StepPerson
          persons={personList}
          selectedId={view ? view.personId : newPersonId}
          readOnly={!!claim}
          onSelect={setNewPersonId}
        />
      )
    }
    if (step === 1) {
      const chosen = view ? person : newPerson
      return (
        <StepType
          memberType={chosen?.memberType ?? null}
          value={view ? view.type : newType}
          readOnly={!!claim && !writable(1)}
          hotline={data.administrator.hotline}
          onSelect={(type) => (claim ? change({ type }) : setNewType(type))}
        />
      )
    }
    if (!view) return null
    if (step === 2) {
      return <StepTreatment claim={view} facilities={data.facilities} readOnly={!writable(2)} onChange={change} />
    }
    if (step === 3) {
      return <StepInvoices claim={view} readOnly={!writable(3)} onBeforeEdit={reopenIfReady} />
    }
    if (step === 4) {
      return (
        <StepDocuments
          claim={view}
          requirements={data.requirements}
          person={person}
          readOnly={!writable(4)}
          onBeforeEdit={reopenIfReady}
          onNotApplicable={(notApplicable) => save({ notApplicable }).then(() => undefined)}
        />
      )
    }
    return (
      <StepReview
        claim={view}
        account={ready}
        administrator={data.administrator}
        requirements={data.requirements}
        persons={personList}
        documents={docs}
        onGoTo={(next) => void goTo(next)}
        onChanged={() => setRevision((n) => n + 1)}
      />
    )
  }

  const stepName = t(STEP_NAMES[step])

  return (
    <section class="flex flex-col gap-4 py-4 pb-40 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)_20rem] lg:items-start lg:gap-6 lg:pb-8">
      <nav aria-label={t('claim.stepsLabel')} class="hidden lg:block lg:col-start-1 lg:row-start-1">
        <ol class="flex flex-col gap-1">
          {STEP_NAMES.map((key, index) => (
            <li key={key}>
              <button
                type="button"
                aria-current={index === step ? 'step' : undefined}
                disabled={!claim && index > 1}
                onClick={() => void goTo(index as WizardStep)}
                class="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-fluid-base text-ink hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50 aria-[current=step]:font-semibold aria-[current=step]:text-accent"
              >
                <span class="tabular-nums">{index + 1}.</span>
                {t(key)}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div class="flex flex-col gap-1 lg:hidden">
        <p class="text-fluid-sm font-medium text-ink-muted">{t('claim.progress', { step: step + 1, total: STEP_COUNT, name: stepName })}</p>
        <div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" role="presentation">
          <div class="h-full bg-accent" style={{ width: `${((step + 1) / STEP_COUNT) * 100}%` }} />
        </div>
      </div>

      {view && (
        <div class="lg:col-start-3 lg:row-start-1">
          <ChecksPanel
            claim={view}
            person={person}
            benefits={benefits}
            facility={facility}
            documents={docs}
            today={todayIso()}
          />
        </div>
      )}

      <div class="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
        {claim && access === 'none' && (
          <p role="status" class="rounded-xl bg-surface-2 p-3 text-fluid-sm text-ink">
            {t('claim.readOnly')}
          </p>
        )}
        {claim && access === 'documents' && (
          <p role="status" class="rounded-xl bg-surface-2 p-3 text-fluid-sm text-ink">
            {t('claim.needInfoNote')}
          </p>
        )}
        {claim && claim.status === 'ready' && (
          <p class="text-fluid-sm text-ink-muted">{t('claim.readyNote')}</p>
        )}
        {errors.length > 0 && (
          <div role="alert" class="flex flex-col gap-1 text-fluid-sm text-red-600 dark:text-red-400">
            {errors.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        )}
        {renderStep()}
      </div>

      <footer class="fixed inset-x-0 bottom-14 z-10 flex items-center justify-between gap-2 border-t border-surface-2 bg-surface p-3 lg:static lg:border-0 lg:bg-transparent lg:p-0">
        {step > 0 ? (
          <IconButton icon="chevron-left" label={t('common.back')} showLabel disabled={busy} onClick={onBack} />
        ) : (
          <span />
        )}
        {step < LAST_STEP && (
          <IconButton
            icon="chevron-right"
            label={t('common.next')}
            showLabel
            variant="primary"
            class="flex-row-reverse"
            disabled={busy || !canNext}
            onClick={onNext}
          />
        )}
      </footer>
    </section>
  )
}
