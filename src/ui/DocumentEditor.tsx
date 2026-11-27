import { useEffect, useRef, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import type { Person } from '../domain/types'
import { DOC_CATEGORIES, type DocCategory, type DocumentRecord } from '../domain/document-types'
import {
  addPages,
  confirmAmount,
  requestOcr,
  softDelete,
  updateDocument,
  type DocumentPatch,
} from '../data/documents-repo'
import { startOcrQueue } from '../data/ocr-queue'
import { db } from '../db/db'
import { t } from '../i18n'
import { formatVnd } from '../lib/money'
import { categoryLabel, useFilePreview, useLive } from './DocumentCard'
import { IconButton } from './IconButton'

/** Longest edge of the page viewer, in px. */
const VIEW_EDGE = 1200

export interface DocumentEditorProps {
  id: string
  persons: Person[]
  onDeleted(): void
  /** Shown on narrow screens, where the editor is a page of its own. */
  onBack?(): void
}

type Outcome = { ok: true } | { ok: false; errors: Record<string, string> }

const CONTROL = 'min-h-11 min-w-0 rounded-xl border border-surface-2 bg-surface px-3 text-fluid-base text-ink'

function Field({ id, label, children }: { id: string; label: string; children: ComponentChildren }) {
  return (
    <div class="flex min-w-0 flex-col gap-1">
      <label for={id} class="text-fluid-sm text-ink-muted">
        {label}
      </label>
      {children}
    </div>
  )
}

/** Reads a typed amount: digits with optional dot, comma or space grouping. Anything else becomes NaN and is refused. */
function parseAmount(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const digits = trimmed.replace(/[\s.,]/g, '')
  return /^\d+$/.test(digits) ? Number(digits) : Number.NaN
}

/**
 * Views one document and edits it: pages, category, person, date and (for invoices) the amount with its suggestions.
 * Reads the record live, so an OCR result or a write from elsewhere shows up without a reload.
 */
export function DocumentEditor({ id, persons, onDeleted, onBack }: DocumentEditorProps) {
  const doc = useLive<DocumentRecord | null>(
    () => db.documents.get(id).then((row) => (row && row.deleted === 0 ? row : null)),
    [id],
  )
  const [page, setPage] = useState(0)
  const [amountDraft, setAmountDraft] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [notice, setNotice] = useState<string[]>([])
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const pageInput = useRef<HTMLInputElement>(null)

  const pageCount = doc?.fileIds.length ?? 0
  const current = Math.min(page, Math.max(0, pageCount - 1))
  const preview = useFilePreview(doc?.fileIds[current], VIEW_EDGE)

  const amountKey = doc?.amount ?? null
  useEffect(() => {
    setAmountDraft(amountKey === null ? '' : String(amountKey))
  }, [amountKey, id])

  if (doc === undefined) return <p class="py-4 text-fluid-base text-ink-muted">{t('common.loading')}</p>
  if (doc === null) return <p class="py-4 text-fluid-base text-ink-muted">{t('documents.notFound')}</p>

  const isInvoice = doc.category === 'invoice'

  /** Shows the errors of a refused write, or clears them after a saved one. */
  function report(outcome: Outcome): boolean {
    setNotice([])
    setErrors(outcome.ok ? [] : Object.values(outcome.errors).map((code) => t(code)))
    return outcome.ok
  }

  /** Runs a write that may be refused and reports the outcome. */
  const run = (write: () => Promise<Outcome>) => write().then(report)

  const save = (patch: DocumentPatch) => run(() => updateDocument(db, id, patch))

  const commitAmount = (raw: string) => save({ amount: parseAmount(raw) })

  async function reread() {
    if (report(await requestOcr(db, id))) void startOcrQueue()
  }

  async function addPagesFrom(input: HTMLInputElement) {
    const files = Array.from(input.files ?? [])
    input.value = ''
    if (files.length === 0) return
    setBusy(true)
    try {
      const result = await addPages(db, id, files)
      if (!result.ok) {
        report({ ok: false, errors: result.errors })
        return
      }
      setPage(result.document.fileIds.length - 1)
      setErrors(result.failed.map((f) => t(f.code, { name: f.name })))
      setNotice([
        ...result.duplicates.map((name) => t('documents.add.duplicate', { name })),
        ...result.lowResolution.map((name) => t('documents.add.lowResolution', { name })),
      ])
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    const outcome = await softDelete(db, id)
    setBusy(false)
    if (outcome.ok) onDeleted()
    else report(outcome)
  }

  const candidates = doc.ocrCandidates
  const showSuggestions = isInvoice && !doc.amountConfirmed && candidates.length > 0

  return (
    <article class="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
      <div class="flex min-w-0 flex-col gap-2">
        {onBack && (
          <div>
            <IconButton icon="chevron-left" label={t('common.back')} onClick={onBack} />
          </div>
        )}
        <figure class="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-xl bg-surface-2">
          {preview ? (
            <img src={preview} alt={t('documents.page.alt', { n: current + 1 })} class="size-full object-contain" />
          ) : (
            <figcaption class="text-fluid-sm text-ink-muted">{t('documents.page.loading')}</figcaption>
          )}
        </figure>
        <div class="flex items-center justify-between gap-2">
          {pageCount > 1 && (
            <nav aria-label={t('documents.page.nav')} class="flex w-full items-center justify-between gap-2">
              <IconButton
                icon="chevron-left"
                label={t('common.previous')}
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
              />
              <span class="text-fluid-sm tabular-nums text-ink-muted">
                {t('documents.page.count', { n: current + 1, total: pageCount })}
              </span>
              <IconButton
                icon="chevron-right"
                label={t('common.next')}
                disabled={current >= pageCount - 1}
                onClick={() => setPage(current + 1)}
              />
            </nav>
          )}
          <IconButton icon="page-add" label={t('documents.page.add')} disabled={busy} onClick={() => pageInput.current?.click()} />
        </div>
        <input
          ref={pageInput}
          type="file"
          accept="image/*"
          multiple
          class="hidden"
          onChange={(e) => void addPagesFrom(e.currentTarget)}
        />
      </div>

      <div class="flex min-w-0 flex-col gap-4">
        <h2 class="text-fluid-lg font-semibold text-ink">{categoryLabel(doc.category)}</h2>

        <div class="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
          <Field id={`doc-${id}-category`} label={t('documents.category.label')}>
            <select
              id={`doc-${id}-category`}
              value={doc.category}
              class={CONTROL}
              onChange={(e) => void save({ category: e.currentTarget.value as DocCategory })}
            >
              {DOC_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`documents.category.${c}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field id={`doc-${id}-person`} label={t('documents.person.label')}>
            <select
              id={`doc-${id}-person`}
              value={doc.personId ?? ''}
              class={CONTROL}
              onChange={(e) => void save({ personId: e.currentTarget.value || null })}
            >
              <option value="">{t('documents.person.none')}</option>
              {persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </select>
          </Field>
          <Field id={`doc-${id}-date`} label={t('documents.field.date')}>
            <input
              id={`doc-${id}-date`}
              type="date"
              value={doc.docDate ?? ''}
              class={CONTROL}
              onChange={(e) => void save({ docDate: e.currentTarget.value || null })}
            />
          </Field>
          {isInvoice && (
            <Field id={`doc-${id}-amount`} label={t('documents.field.amount')}>
              <input
                id={`doc-${id}-amount`}
                type="text"
                inputMode="numeric"
                value={amountDraft}
                class={CONTROL}
                onInput={(e) => setAmountDraft(e.currentTarget.value)}
                onChange={(e) => void commitAmount(e.currentTarget.value)}
              />
            </Field>
          )}
        </div>

        {isInvoice && (
          <section class="flex flex-col gap-3">
            {doc.ocrStatus === 'pending' && <p class="text-fluid-sm text-ink-muted">{t('documents.amount.pending')}</p>}
            {doc.ocrStatus === 'failed' && <p class="text-fluid-sm text-red-600 dark:text-red-400">{t('documents.ocr.failed')}</p>}
            {doc.ocrStatus === 'done' && doc.amount === null && candidates.length === 0 && (
              <p class="text-fluid-sm text-ink-muted">{t('documents.amount.none')}</p>
            )}

            {showSuggestions && (
              <div class="flex flex-col gap-2">
                <p class="text-fluid-sm font-medium text-ink">{t('documents.amount.suggested')}</p>
                <ul class="flex flex-wrap gap-2">
                  {candidates.map((c) => (
                    <li key={c.amount} class="flex flex-col items-start gap-1">
                      <button
                        type="button"
                        aria-pressed={doc.amount === c.amount}
                        onClick={() => void run(() => confirmAmount(db, id, c.amount))}
                        class="min-h-11 rounded-xl bg-surface-2 px-3 text-fluid-base font-medium tabular-nums text-ink hover:brightness-95 focus-visible:outline-2 focus-visible:outline-accent aria-pressed:ring-2 aria-pressed:ring-accent"
                      >
                        {formatVnd(c.amount)}
                      </button>
                      <span class="text-xs text-ink-muted">
                        {c.confidence === 'high' ? t('documents.amount.fromLabel') : t('documents.amount.noLabel')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div class="flex flex-wrap gap-2">
              {doc.amount !== null && (
                <IconButton
                  icon="check"
                  label={t('documents.amount.confirm')}
                  showLabel
                  pressed={doc.amountConfirmed}
                  onClick={() => void run(() => confirmAmount(db, id))}
                />
              )}
              <IconButton
                icon="ocr-run"
                label={t('documents.ocr.read')}
                showLabel
                disabled={doc.ocrStatus === 'pending'}
                onClick={() => void reread()}
              />
            </div>
          </section>
        )}

        {errors.length > 0 && (
          <div role="alert" class="flex flex-col gap-1 text-fluid-sm text-red-600 dark:text-red-400">
            {errors.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        )}
        {notice.length > 0 && (
          <div role="status" class="flex flex-col gap-1 text-fluid-sm text-ink-muted">
            {notice.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        )}

        {doc.claimId !== null ? (
          <p class="text-fluid-sm text-ink-muted">{t('documents.inClaim')}</p>
        ) : confirming ? (
          <div role="alertdialog" aria-label={t('documents.delete.confirm')} class="flex flex-col gap-3 rounded-xl border border-red-300 p-3 dark:border-red-800">
            <p class="text-fluid-sm text-ink">{t('documents.delete.confirm')}</p>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                class="min-h-11 rounded-xl px-4 text-fluid-base text-ink hover:bg-surface-2"
              >
                {t('common.cancel')}
              </button>
              <IconButton icon="trash" label={t('documents.delete.yes')} showLabel variant="danger" disabled={busy} onClick={() => void remove()} />
            </div>
          </div>
        ) : (
          <div>
            <IconButton icon="trash" label={t('documents.delete')} showLabel variant="danger" onClick={() => setConfirming(true)} />
          </div>
        )}
      </div>
    </article>
  )
}
