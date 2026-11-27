import { useRef, useState } from 'preact/hooks'
import { attachDocuments, detachDocuments, listClaimDocuments } from '../../data/claims-repo'
import { addFiles, confirmAmount } from '../../data/documents-repo'
import { startOcrQueue } from '../../data/ocr-queue'
import { db } from '../../db/db'
import type { Claim } from '../../domain/claim-types'
import type { DocumentRecord } from '../../domain/document-types'
import { t } from '../../i18n'
import { formatVnd } from '../../lib/money'
import { documentName, useFilePreview, useLive } from '../DocumentCard'
import { AmountField } from '../AmountField'
import { DocumentPicker } from '../DocumentPicker'
import { IconButton } from '../IconButton'

export interface StepInvoicesProps {
  /** The claim with pending answers applied. Only `personId`, `totalClaimed` and `id` are read here. */
  claim: Claim
  readOnly: boolean
  /** Called before any write; the wizard moves a ready claim back to draft. */
  onBeforeEdit(): Promise<void>
}

/** Step 4: the claim's invoices, their amounts and the total of the confirmed ones. Live: every write shows at once. */
export function StepInvoices({ claim, readOnly, onBeforeEdit }: StepInvoicesProps) {
  const invoices = useLive<DocumentRecord[]>(
    () => listClaimDocuments(db, claim.id).then((docs) => docs.filter((d) => d.category === 'invoice')),
    [claim.id],
  )
  const captureRef = useRef<HTMLInputElement>(null)
  const pickRef = useRef<HTMLInputElement>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string[]>([])
  const [errors, setErrors] = useState<string[]>([])

  /** Adds photos or PDFs as invoices of the claim: each file becomes its own document, then they are attached. */
  async function addFromDevice(input: HTMLInputElement) {
    const files = Array.from(input.files ?? [])
    input.value = ''
    if (files.length === 0) return
    setBusy(true)
    try {
      await onBeforeEdit()
      const result = await addFiles(db, files, { personId: claim.personId, category: 'invoice' })
      if (result.added.length > 0) {
        const attached = await attachDocuments(
          db,
          claim.id,
          result.added.map((d) => d.id),
        )
        if (!attached.ok) setErrors(Object.values(attached.errors).map((code) => t(code)))
        void startOcrQueue()
      }
      setNotice([
        ...(result.added.length > 0 ? [t('claim.invoices.addDone', { count: result.added.length })] : []),
        ...result.failed.map((f) => t(f.code, { name: f.name })),
        ...result.duplicates.map((name) => t('documents.add.duplicate', { name })),
      ])
    } finally {
      setBusy(false)
    }
  }

  async function removeInvoice(doc: DocumentRecord) {
    await onBeforeEdit()
    const outcome = await detachDocuments(db, claim.id, [doc.id])
    setErrors(outcome.ok ? [] : Object.values(outcome.errors).map((code) => t(code)))
  }

  async function confirmProposal(doc: DocumentRecord) {
    await onBeforeEdit()
    const outcome = await confirmAmount(db, doc.id)
    setErrors(outcome.ok ? [] : Object.values(outcome.errors).map((code) => t(code)))
  }

  const rows = invoices ?? []
  return (
    <section aria-labelledby="claim-step-invoices" class="flex flex-col gap-4">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="claim-step-invoices" class="text-fluid-lg font-semibold text-ink">
          {t('claim.invoices.title')}
        </h2>
        <p class="flex flex-col items-end">
          <span class="text-fluid-sm text-ink-muted">{t('claim.invoices.total')}</span>
          <span data-total class="text-fluid-lg font-semibold tabular-nums text-ink">
            {formatVnd(claim.totalClaimed)}
          </span>
        </p>
      </div>

      {rows.length === 0 ? (
        <p class="text-fluid-base text-ink-muted">{t('claim.invoices.empty')}</p>
      ) : (
        <ol class="flex flex-col gap-3">
          {rows.map((doc, index) => (
            <InvoiceRow
              key={doc.id}
              doc={doc}
              number={index + 1}
              readOnly={readOnly}
              onBeforeEdit={onBeforeEdit}
              onError={(message) => setErrors([message])}
              onConfirm={() => void confirmProposal(doc)}
              onRemove={() => void removeInvoice(doc)}
            />
          ))}
        </ol>
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

      {!readOnly && (
        <div class="flex flex-col gap-3">
          <div class="flex flex-wrap gap-2">
            <IconButton
              icon="camera"
              label={t('claim.invoices.capture')}
              showLabel
              variant="primary"
              disabled={busy}
              onClick={() => captureRef.current?.click()}
            />
            <IconButton
              icon="image-pick"
              label={t('claim.invoices.pick')}
              showLabel
              disabled={busy}
              onClick={() => pickRef.current?.click()}
            />
            <IconButton
              icon="documents"
              label={t('claim.invoices.fromLibrary')}
              showLabel
              disabled={busy}
              onClick={() => setPickerOpen((open) => !open)}
            />
          </div>
          {pickerOpen && (
            <DocumentPicker
              claim={claim}
              categories={['invoice']}
              onBeforeEdit={onBeforeEdit}
              onAttached={() => setPickerOpen(false)}
              onClose={() => setPickerOpen(false)}
            />
          )}
          <input
            ref={captureRef}
            type="file"
            accept="image/*"
            capture="environment"
            class="hidden"
            onChange={(e) => void addFromDevice(e.currentTarget)}
          />
          <input
            ref={pickRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            class="hidden"
            onChange={(e) => void addFromDevice(e.currentTarget)}
          />
        </div>
      )}
    </section>
  )
}

interface InvoiceRowProps {
  doc: DocumentRecord
  number: number
  readOnly: boolean
  onBeforeEdit(): Promise<void>
  onError(message: string): void
  onConfirm(): void
  onRemove(): void
}

/**
 * One invoice: its thumbnail and an in-place toggle for the large image (the wizard state stays on this page), then the
 * amount. The image sits above the field on narrow screens and beside it from 1024 px.
 */
function InvoiceRow({ doc, number, readOnly, onBeforeEdit, onError, onConfirm, onRemove }: InvoiceRowProps) {
  const [enlarged, setEnlarged] = useState(false)
  const thumb = useFilePreview(doc.fileIds[0], 480)
  const large = useFilePreview(enlarged ? doc.fileIds[0] : undefined, 1600)
  const unconfirmed = doc.amount !== null && !doc.amountConfirmed
  return (
    <li class="flex flex-col gap-2 rounded-xl bg-surface-2 p-3 lg:flex-row lg:flex-wrap lg:items-start">
      <div class="flex w-full flex-col gap-2 lg:w-48 lg:shrink-0">
        <span class="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-lg bg-surface">
          {thumb ? <img src={thumb} alt={documentName(doc)} class="size-full object-cover" /> : null}
        </span>
        <IconButton
          icon="pdf-preview"
          label={t('claim.invoices.enlarge')}
          showLabel
          pressed={enlarged}
          onClick={() => setEnlarged((open) => !open)}
        />
      </div>
      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-fluid-base font-medium tabular-nums text-ink">
            {doc.amount === null ? t('claim.invoices.noAmount') : formatVnd(doc.amount)}
          </span>
          {unconfirmed && (
            <span class="rounded-md bg-surface px-2 py-0.5 text-fluid-sm text-red-600 dark:text-red-400">
              {t('claim.invoices.unconfirmed')}
            </span>
          )}
          {doc.amount === null && doc.ocrStatus === 'pending' && (
            <span class="text-fluid-sm text-ink-muted">{t('claim.invoices.pending')}</span>
          )}
        </div>
        <AmountField
          doc={doc}
          label={t('claim.invoices.amount', { n: number })}
          readOnly={readOnly}
          onBeforeEdit={onBeforeEdit}
          onError={onError}
        />
        {!readOnly && (
          <div class="flex flex-wrap gap-2">
            {unconfirmed && doc.amount !== null && (
              <IconButton
                icon="check"
                label={t('claim.invoices.confirm', { amount: formatVnd(doc.amount) })}
                showLabel
                onClick={onConfirm}
              />
            )}
            <IconButton icon="photo-remove" label={t('claim.invoices.remove')} showLabel onClick={onRemove} />
          </div>
        )}
      </div>
      {enlarged && large && (
        <img src={large} alt={documentName(doc)} data-large-invoice class="w-full basis-full rounded-lg bg-surface object-contain" />
      )}
    </li>
  )
}
