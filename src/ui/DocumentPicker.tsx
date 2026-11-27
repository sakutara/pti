import { useState } from 'preact/hooks'
import { attachDocuments, pickableDocuments } from '../data/claims-repo'
import { db } from '../db/db'
import type { Claim } from '../domain/claim-types'
import type { DocCategory, DocumentRecord } from '../domain/document-types'
import { t } from '../i18n'
import { documentName, useLive } from './DocumentCard'
import { IconButton } from './IconButton'

export interface DocumentPickerProps {
  claim: Claim
  /** Only library documents of these categories are offered. */
  categories: readonly DocCategory[]
  /** Called before the attach write; the wizard moves a ready claim back to draft here. */
  onBeforeEdit(): Promise<void>
  onAttached(): void
  onClose(): void
}

/**
 * Picks library documents for a claim. Documents that belong to another claim, or to another person, are not offered
 * (claims.invoices.pick). Several can be picked at once.
 */
export function DocumentPicker({ claim, categories, onBeforeEdit, onAttached, onClose }: DocumentPickerProps) {
  const key = categories.join(',')
  const candidates = useLive<DocumentRecord[]>(
    () =>
      pickableDocuments(db, claim.id).then((rows) =>
        rows.filter(
          (d) =>
            d.claimId === null &&
            (d.personId === null || d.personId === claim.personId) &&
            categories.includes(d.category),
        ),
      ),
    [claim.id, claim.personId, key],
  )
  const [selected, setSelected] = useState<string[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))

  async function attachSelected() {
    setBusy(true)
    try {
      await onBeforeEdit()
      const outcome = await attachDocuments(db, claim.id, selected)
      if (!outcome.ok) {
        setErrors(Object.values(outcome.errors).map((code) => t(code)))
        return
      }
      setSelected([])
      onAttached()
    } finally {
      setBusy(false)
    }
  }

  const rows = candidates ?? []
  return (
    <section aria-label={t('claim.picker.title')} class="flex flex-col gap-3 rounded-xl border border-surface-2 p-3">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-fluid-base font-semibold text-ink">{t('claim.picker.title')}</h3>
        <IconButton icon="close" label={t('claim.picker.close')} onClick={onClose} />
      </div>
      {candidates === undefined ? null : rows.length === 0 ? (
        <p class="text-fluid-sm text-ink-muted">{t('claim.picker.empty')}</p>
      ) : (
        <ul class="flex flex-col gap-2">
          {rows.map((doc) => (
            <li key={doc.id}>
              <button
                type="button"
                aria-pressed={selected.includes(doc.id)}
                onClick={() => toggle(doc.id)}
                class="flex min-h-11 w-full items-center rounded-lg bg-surface-2 px-3 py-2 text-left text-fluid-sm text-ink hover:brightness-95 focus-visible:outline-2 focus-visible:outline-accent aria-pressed:ring-2 aria-pressed:ring-accent"
              >
                {documentName(doc)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {errors.length > 0 && (
        <div role="alert" class="text-fluid-sm text-red-600 dark:text-red-400">
          {errors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}
      <div class="flex flex-wrap gap-2">
        <IconButton
          icon="claim-add"
          label={t('claim.picker.add')}
          showLabel
          variant="primary"
          disabled={busy || selected.length === 0}
          onClick={() => void attachSelected()}
        />
      </div>
    </section>
  )
}
