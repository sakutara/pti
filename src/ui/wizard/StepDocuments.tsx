import { useState } from 'preact/hooks'
import { detachDocuments, listClaimDocuments } from '../../data/claims-repo'
import { db } from '../../db/db'
import { applicableRequirements, missingRequired } from '../../domain/requirements'
import type { Claim } from '../../domain/claim-types'
import type { DocumentRecord } from '../../domain/document-types'
import type { ClaimRequirements, Requirement } from '../../domain/requirements-schema'
import type { Person } from '../../domain/types'
import { t } from '../../i18n'
import { documentName, useLive } from '../DocumentCard'
import { IconButton } from '../IconButton'
import { InvoiceGuide } from '../InvoiceGuide'
import { RequirementRow } from '../RequirementRow'

export interface StepDocumentsProps {
  /** The claim with pending answers applied. */
  claim: Claim
  requirements: ClaimRequirements
  person: Person | null
  readOnly: boolean
  /** Called before any write; the wizard moves a ready claim back to draft here. */
  onBeforeEdit(): Promise<void>
  /** Saves the list of requirement ids marked as not applicable. */
  onNotApplicable(notApplicable: string[]): Promise<void>
}

/**
 * Each document goes to the first applicable requirement whose categories include it. Documents that match none (for
 * example a document of a category no requirement asks for) are listed apart.
 */
export function assignDocuments(
  reqs: readonly Requirement[],
  docs: readonly DocumentRecord[],
): { byRequirement: Map<string, DocumentRecord[]>; others: DocumentRecord[] } {
  const assigned = new Set<string>()
  const byRequirement = new Map<string, DocumentRecord[]>()
  for (const req of reqs) {
    const mine = docs.filter((d) => !assigned.has(d.id) && req.categories.includes(d.category))
    for (const d of mine) assigned.add(d.id)
    byRequirement.set(req.id, mine)
  }
  return { byRequirement, others: docs.filter((d) => !assigned.has(d.id)) }
}

/**
 * Step 5: the checklist of documents for the claim. Shows "N/M chứng từ bắt buộc", one row per applicable requirement,
 * the documents not matched by any row, and the invoice guidance card.
 */
export function StepDocuments({
  claim,
  requirements,
  person,
  readOnly,
  onBeforeEdit,
  onNotApplicable,
}: StepDocumentsProps) {
  const docs = useLive<DocumentRecord[]>(() => listClaimDocuments(db, claim.id), [claim.id]) ?? []
  const [guideOpen, setGuideOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const reqs = applicableRequirements(requirements, claim, docs)
  const required = reqs.filter((r) => r.required)
  const met = required.length - missingRequired(required, docs).length
  const { byRequirement, others } = assignDocuments(reqs, docs)

  const toggleNotApplicable = (requirementId: string) => {
    const current = claim.notApplicable
    void onNotApplicable(
      current.includes(requirementId)
        ? current.filter((id) => id !== requirementId)
        : [...current, requirementId],
    )
  }

  async function detachOther(doc: DocumentRecord) {
    setBusy(true)
    try {
      await onBeforeEdit()
      await detachDocuments(db, claim.id, [doc.id])
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="claim-step-documents" class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 id="claim-step-documents" class="text-fluid-lg font-semibold text-ink">
          {t('claim.docs.title')}
        </h2>
        <p class="text-fluid-sm font-medium tabular-nums text-ink">
          {t('claim.docs.progress', { met, total: required.length })}
        </p>
      </div>

      {person && (
        <div>
          <IconButton
            icon="receipt"
            label={guideOpen ? t('claim.docs.invoiceGuideHide') : t('claim.docs.invoiceGuide')}
            showLabel
            aria-expanded={guideOpen}
            onClick={() => setGuideOpen((open) => !open)}
          />
        </div>
      )}
      {guideOpen && person && <InvoiceGuide person={person} guidance={requirements.invoiceGuidance} />}

      {reqs.length === 0 ? (
        <p class="text-fluid-base text-ink-muted">{t('claim.docs.none')}</p>
      ) : (
        <ul class="flex flex-col gap-3">
          {reqs.map((req) => (
            <li key={req.id}>
              <RequirementRow
                claim={claim}
                requirement={req}
                docs={byRequirement.get(req.id) ?? []}
                notApplicable={claim.notApplicable.includes(req.id)}
                readOnly={readOnly}
                onBeforeEdit={onBeforeEdit}
                onToggleNotApplicable={toggleNotApplicable}
              />
            </li>
          ))}
        </ul>
      )}

      {others.length > 0 && (
        <section aria-label={t('claim.docs.other')} class="flex flex-col gap-2">
          <h3 class="text-fluid-base font-semibold text-ink">{t('claim.docs.other')}</h3>
          <ul class="flex flex-col gap-2">
            {others.map((doc) => (
              <li key={doc.id} class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 p-2">
                <span class="text-fluid-sm text-ink">{documentName(doc)}</span>
                {!readOnly && (
                  <IconButton
                    icon="photo-remove"
                    label={t('claim.invoices.remove')}
                    showLabel
                    disabled={busy}
                    onClick={() => void detachOther(doc)}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  )
}
