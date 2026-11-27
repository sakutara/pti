import { useEffect, useState } from 'preact/hooks'
import { updateDocument } from '../data/documents-repo'
import { db } from '../db/db'
import type { DocumentRecord } from '../domain/document-types'
import { t } from '../i18n'

const CONTROL = 'min-h-11 min-w-0 rounded-xl border border-surface-2 bg-surface px-3 text-fluid-base tabular-nums text-ink disabled:opacity-70'

/**
 * Reads a typed amount: digits with optional dot, comma or space grouping. Empty means no amount. Anything else is
 * refused (NaN).
 */
export function parseAmount(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const digits = trimmed.replace(/[\s.,]/g, '')
  return /^\d+$/.test(digits) ? Number(digits) : Number.NaN
}

export interface AmountFieldProps {
  doc: DocumentRecord
  label: string
  readOnly: boolean
  /** Called before the write; the wizard moves a ready claim back to draft here. */
  onBeforeEdit(): Promise<void>
  onError(message: string): void
}

/**
 * Compact amount editor for an invoice in the wizard. A typed amount is stored as manual and confirmed at once; the
 * claim total follows through the repo.
 */
export function AmountField({ doc, label, readOnly, onBeforeEdit, onError }: AmountFieldProps) {
  const [draft, setDraft] = useState(doc.amount === null ? '' : String(doc.amount))
  useEffect(() => {
    setDraft(doc.amount === null ? '' : String(doc.amount))
  }, [doc.amount, doc.id])

  async function commit(raw: string) {
    const amount = parseAmount(raw)
    if (Number.isNaN(amount)) {
      onError(t('error.amountInvalid'))
      setDraft(doc.amount === null ? '' : String(doc.amount))
      return
    }
    await onBeforeEdit()
    const outcome = await updateDocument(db, doc.id, { amount })
    if (!outcome.ok) onError(Object.values(outcome.errors).map((code) => t(code)).join(' '))
  }

  return (
    <div class="flex min-w-0 flex-col gap-1">
      <label for={`amount-${doc.id}`} class="text-fluid-sm text-ink-muted">
        {label}
      </label>
      <input
        id={`amount-${doc.id}`}
        type="text"
        inputMode="numeric"
        value={draft}
        disabled={readOnly}
        class={CONTROL}
        onInput={(e) => setDraft(e.currentTarget.value)}
        onChange={(e) => void commit(e.currentTarget.value)}
      />
    </div>
  )
}
