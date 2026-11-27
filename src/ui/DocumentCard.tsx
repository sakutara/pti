import { liveQuery } from 'dexie'
import { useEffect, useState } from 'preact/hooks'
import type { DocumentRecord } from '../domain/document-types'
import { getBlob } from '../data/files-repo'
import { db } from '../db/db'
import { t } from '../i18n'
import { formatDateVi } from '../lib/format-date'
import { formatVnd } from '../lib/money'
import { navigate } from '../router'

/**
 * Reads through Dexie liveQuery so the value follows every write to the tables it reads, including the OCR queue's
 * results. `undefined` while the first read is pending.
 */
export function useLive<T>(read: () => Promise<T>, deps: unknown[]): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined)
  useEffect(() => {
    const sub = liveQuery(read).subscribe({ next: (v) => setValue(v), error: () => {} })
    return () => sub.unsubscribe()
    // The caller lists what changes the query; `read` always reads the latest values through its closure.
  }, deps)
  return value
}

/**
 * Object URL of a stored file for display. A PDF shows its first page rendered at `longEdge`. The URL is revoked
 * when the file changes or the component unmounts.
 */
export function useFilePreview(fileId: string | undefined, longEdge: number): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    setUrl(null)
    if (!fileId) return
    let alive = true
    let created: string | null = null
    void loadPreview(fileId, longEdge)
      .then((blob) => {
        if (!alive || !blob) return
        created = URL.createObjectURL(blob)
        setUrl(created)
      })
      .catch(() => {})
    return () => {
      alive = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [fileId, longEdge])
  return url
}

async function loadPreview(fileId: string, longEdge: number): Promise<Blob | undefined> {
  const blob = await getBlob(db, fileId)
  if (!blob || blob.type !== 'application/pdf') return blob
  // pdf.js is loaded only when a PDF is shown, keeping the main bundle small.
  const { renderPage } = await import('../lib/pdf-read')
  return renderPage(blob, 1, longEdge)
}

export const categoryLabel = (category: DocumentRecord['category']) => t(`documents.category.${category}`)

/** Accessible name of a card: category, date and amount, so cards can be told apart. */
export function documentName(doc: DocumentRecord): string {
  const parts = [categoryLabel(doc.category)]
  if (doc.docDate) parts.push(formatDateVi(doc.docDate))
  if (doc.amount !== null) parts.push(formatVnd(doc.amount))
  return parts.join(', ')
}

/** The status line on a card: the most useful fact about the document right now. */
function statusText(doc: DocumentRecord): string[] {
  const out: string[] = []
  if (doc.claimId !== null) out.push(t('documents.inClaim'))
  if (doc.ocrStatus === 'pending') out.push(t('documents.status.pending'))
  else if (doc.ocrStatus === 'failed') out.push(t('documents.status.failed'))
  else if (doc.amount !== null && !doc.amountConfirmed) out.push(t('documents.status.confirm'))
  if (doc.fileIds.length > 1) out.push(t('documents.status.pages', { count: doc.fileIds.length }))
  if (doc.lowResolution) out.push(t('documents.status.lowResolution'))
  return out
}

export interface DocumentCardProps {
  doc: DocumentRecord
  selectMode: boolean
  selected: boolean
  /** Position in selection order, shown while merging. */
  selectedIndex: number
  onToggle(id: string): void
  queryString: string
}

/** One document in the grid: thumbnail, category, date, amount and status. In select mode it toggles selection. */
export function DocumentCard({ doc, selectMode, selected, selectedIndex, onToggle, queryString }: DocumentCardProps) {
  const thumb = useFilePreview(doc.fileIds[0], 480)
  const status = statusText(doc)
  const onClick = () => {
    if (selectMode) onToggle(doc.id)
    else navigate(`/documents/${doc.id}${queryString}`)
  }
  return (
    <button
      type="button"
      aria-label={documentName(doc)}
      aria-pressed={selectMode ? selected : undefined}
      data-selected-index={selectMode && selected ? String(selectedIndex + 1) : undefined}
      onClick={onClick}
      class={`flex min-h-11 w-full flex-col gap-2 rounded-xl bg-surface-2 p-2 text-left transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${selected ? 'ring-2 ring-accent' : ''}`}
    >
      <span class="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-lg bg-surface">
        {thumb ? <img src={thumb} alt="" class="size-full object-cover" /> : null}
      </span>
      <span class="flex flex-col gap-0.5 px-1 pb-1">
        <span class="text-fluid-sm font-medium text-ink">{categoryLabel(doc.category)}</span>
        {doc.docDate && <span class="text-fluid-sm text-ink-muted">{formatDateVi(doc.docDate)}</span>}
        {doc.amount !== null && <span class="text-fluid-sm tabular-nums text-ink">{formatVnd(doc.amount)}</span>}
        {status.map((line) => (
          <span key={line} class="text-xs text-ink-muted">
            {line}
          </span>
        ))}
      </span>
    </button>
  )
}
