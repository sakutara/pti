import { useEffect, useRef, useState } from 'preact/hooks'
import { buildClaimFiles, canBuild, readiness, type ClaimContext } from '../../data/send-claim'
import { db } from '../../db/db'
import type { Account, Person } from '../../domain/types'
import type { Claim, WizardStep } from '../../domain/claim-types'
import type { DocumentRecord } from '../../domain/document-types'
import type { FormFieldKey } from '../../domain/claim-form'
import type { AdministratorConfig, ClaimRequirements } from '../../domain/requirements-schema'
import type { TooLarge } from '../../lib/attachments-pdf'
import { t } from '../../i18n'
import { navigate } from '../../router'
import { IconButton } from '../IconButton'
import { sizeLabel } from '../GmailConfirm'
import { SendSteps } from '../SendSteps'

export interface StepReviewProps {
  claim: Claim
  account: Account
  administrator: AdministratorConfig
  requirements: ClaimRequirements
  /** Every person of the account (the insured person and the holder are picked from it). */
  persons: Person[]
  /** Documents of the claim. */
  documents: DocumentRecord[]
  onGoTo(step: WizardStep): void
  /** Called after the claim or its files change, so the wizard re-reads them. */
  onChanged(): void
}

/** Where the fix for a missing form field is made. Person and account fields open their own page. */
const FIELD_STEP: Partial<Record<FormFieldKey, WizardStep>> = {
  reason: 2,
  visitDate: 2,
  facilityName: 2,
  diagnosis: 2,
  invoices: 3,
  unconfirmedInvoices: 3,
}
const PATIENT_FIELDS: FormFieldKey[] = ['patientName', 'patientDob', 'patientTier', 'policyholderName', 'contractCode', 'patientPhone']
const HOLDER_FIELDS: FormFieldKey[] = ['employeeName', 'employeeCode', 'jobTitle', 'employeeEmail']

const SENDABLE = ['draft', 'ready', 'need_info']

/**
 * Step 6: the review. Lists what is still missing (required documents and form fields, each with a link back to
 * where it is fixed), previews the claim form, builds the two PDFs and then offers the send step. Building works
 * offline; sending is in SendSteps.
 */
export function StepReview({ claim, account, administrator, requirements, persons, documents, onGoTo, onChanged }: StepReviewProps) {
  const patient = persons.find((p) => p.id === claim.personId) ?? null
  const holder = persons.find((p) => p.role === 'holder' && p.deleted === 0) ?? null
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [tooLarge, setTooLarge] = useState<TooLarge | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const previewUrl = useRef<string | null>(null)

  // The preview's object URL is revoked when it is replaced and when the step unmounts.
  useEffect(() => {
    return () => {
      if (previewUrl.current !== null) URL.revokeObjectURL(previewUrl.current)
    }
  }, [])

  if (patient === null || holder === null) {
    return (
      <p role="alert" class="text-fluid-sm text-red-600 dark:text-red-400">
        {t('error.personNotFound')}
      </p>
    )
  }

  const ctx: ClaimContext = { claim, account, administrator, requirements, patient, holder, documents }
  const r = readiness(ctx)
  const built = canBuild(r)

  if (!SENDABLE.includes(claim.status)) {
    return <p class="text-fluid-base text-ink">{t('claim.review.submittedAlready')}</p>
  }

  const patientId = patient.id
  const holderId = holder.id

  function fixField(key: FormFieldKey) {
    if (PATIENT_FIELDS.includes(key)) return navigate(`/account/person/${patientId}`)
    if (HOLDER_FIELDS.includes(key)) return navigate(`/account/person/${holderId}`)
    if (key === 'bank') return navigate('/account')
    const step = FIELD_STEP[key]
    if (step !== undefined) onGoTo(step)
  }

  async function openPreview() {
    setBusy(true)
    setMessage(null)
    try {
      const forms = await import('../../lib/claim-form-pdf')
      const bytes = await forms.renderClaimForm(r.form, await forms.loadFormAssets())
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }))
      if (previewUrl.current !== null) URL.revokeObjectURL(previewUrl.current)
      previewUrl.current = url
      setPreview(url)
    } catch {
      setMessage(t('claim.review.buildFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function build() {
    setBusy(true)
    setMessage(null)
    setTooLarge(null)
    try {
      const outcome = await buildClaimFiles(db, ctx)
      if (outcome.ok) {
        onChanged()
      } else if (outcome.error === 'build.tooLarge') {
        setTooLarge(outcome.tooLarge)
      } else if (outcome.error === 'build.noNewPhotos') {
        setMessage(t('claim.review.noNewPhotos'))
      } else {
        setMessage(t('claim.review.buildFailed'))
      }
    } finally {
      setBusy(false)
    }
  }

  const missingCount = r.missingDocs.length + r.missingFields.length

  return (
    <section aria-labelledby="claim-step-review" class="flex flex-col gap-4">
      <h2 id="claim-step-review" class="text-fluid-lg font-semibold text-ink">
        {t('claim.review.title')}
      </h2>
      {claim.status === 'need_info' ? (
        <p class="text-fluid-sm text-ink">{t('claim.review.supplementNote')}</p>
      ) : null}

      {missingCount > 0 ? (
        <div class="flex flex-col gap-3">
          <p class="text-fluid-base font-medium text-ink">{t('claim.review.missing')}</p>
          <ul class="flex flex-col gap-2">
            {r.missingDocs.map((req) => (
              <li key={req.id} class="flex flex-wrap items-center justify-between gap-2 text-fluid-sm text-ink">
                <span>{req.title}</span>
                <IconButton icon="page-add" label={t('claim.review.addDocs')} showLabel onClick={() => onGoTo(4)} />
              </li>
            ))}
            {r.missingFields.map((key) => (
              <li key={key} class="flex flex-wrap items-center justify-between gap-2 text-fluid-sm text-ink">
                <span>{t(`claim.review.field.${key}`)}</span>
                <IconButton
                  icon="status-edit"
                  label={t('claim.review.fix', { name: t(`claim.review.field.${key}`) })}
                  onClick={() => fixField(key)}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p class="text-fluid-sm text-ink-muted">{t('claim.review.readyNote')}</p>
      )}

      <div class="flex flex-wrap items-center gap-2">
        <IconButton icon="pdf-preview" label={t('claim.review.preview')} showLabel disabled={busy} onClick={() => void openPreview()} />
        {preview !== null ? (
          <a
            href={preview}
            target="_blank"
            rel="noopener"
            class="inline-flex min-h-11 items-center text-fluid-sm font-medium text-accent underline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {t('claim.review.openPreview')}
          </a>
        ) : null}
      </div>

      <div class="flex flex-col gap-2">
        <IconButton
          icon="pdf-save"
          label={t('claim.review.build')}
          showLabel
          variant="primary"
          disabled={!built || busy}
          onClick={() => void build()}
        />
        <p class="text-fluid-sm text-ink-muted">{t('claim.review.buildHelp')}</p>
      </div>

      {tooLarge !== null ? (
        <p role="alert" class="text-fluid-sm text-red-600 dark:text-red-400">
          {t('claim.review.tooLarge', {
            total: sizeLabel(tooLarge.total),
            limit: sizeLabel(administrator.maxAttachmentBytes),
            largest: tooLarge.largest
              .map((item) => t('claim.review.largestItem', { label: item.label, size: sizeLabel(item.bytes) }))
              .join(', '),
          })}
        </p>
      ) : null}
      {message !== null ? (
        <p role="alert" class="text-fluid-sm text-red-600 dark:text-red-400">
          {message}
        </p>
      ) : null}

      {claim.status === 'ready' || claim.status === 'need_info' ? (
        <SendSteps
          claim={claim}
          account={account}
          administrator={administrator}
          patient={patient}
          holder={holder}
          documents={documents}
          onChanged={onChanged}
        />
      ) : null}
    </section>
  )
}
