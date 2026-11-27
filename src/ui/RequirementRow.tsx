import { useRef, useState } from 'preact/hooks'
import { attachDocuments, detachDocuments } from '../data/claims-repo'
import { addFiles } from '../data/documents-repo'
import { startOcrQueue } from '../data/ocr-queue'
import { db } from '../db/db'
import type { Claim } from '../domain/claim-types'
import type { DocCategory, DocumentRecord } from '../domain/document-types'
import type { Requirement } from '../domain/requirements-schema'
import { t } from '../i18n'
import { documentName, categoryLabel, useFilePreview } from './DocumentCard'
import { DocumentPicker } from './DocumentPicker'
import { IconButton } from './IconButton'

export interface RequirementRowProps {
  claim: Claim
  requirement: Requirement
  /** The claim's documents that count for this requirement (their category is one of its categories). */
  docs: readonly DocumentRecord[]
  notApplicable: boolean
  readOnly: boolean
  /** Called before any write; the wizard moves a ready claim back to draft here. */
  onBeforeEdit(): Promise<void>
  onToggleNotApplicable(requirementId: string): void
}

const CONTROL = 'min-h-11 min-w-0 rounded-xl border border-surface-2 bg-surface px-3 text-fluid-base text-ink'

/** One attached document: thumbnail, name and the icon-only remove control, named with the requirement title. */
function AttachedDoc({
  doc,
  title,
  index,
  removable,
  busy,
  onRemove,
}: {
  doc: DocumentRecord
  title: string
  index: number
  removable: boolean
  busy: boolean
  onRemove(): void
}) {
  const thumb = useFilePreview(doc.fileIds[0], 160)
  return (
    <li class="flex items-center gap-3 rounded-lg bg-surface p-2">
      <span class="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2">
        {thumb ? <img src={thumb} alt="" class="size-full object-cover" /> : null}
      </span>
      <span class="min-w-0 flex-1 text-fluid-sm text-ink">{documentName(doc)}</span>
      {removable && (
        <IconButton
          icon="photo-remove"
          label={t('claim.req.remove', { title, n: index + 1 })}
          disabled={busy}
          onClick={onRemove}
        />
      )}
    </li>
  )
}

/**
 * One row of the document checklist: the requirement, its content checklist, the documents already attached, and the
 * controls to add (camera, pick a file, library) or to mark an optional item as not applicable.
 */
export function RequirementRow({
  claim,
  requirement,
  docs,
  notApplicable,
  readOnly,
  onBeforeEdit,
  onToggleNotApplicable,
}: RequirementRowProps) {
  const [category, setCategory] = useState<DocCategory>(requirement.categories[0])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string[]>([])
  const captureRef = useRef<HTMLInputElement>(null)
  const pickRef = useRef<HTMLInputElement>(null)
  const title = requirement.title

  /** Each picked file becomes its own document of the chosen category and person, then the documents are attached. */
  async function addPicked(input: HTMLInputElement) {
    const files = Array.from(input.files ?? [])
    input.value = ''
    if (files.length === 0) return
    setBusy(true)
    try {
      await onBeforeEdit()
      const result = await addFiles(db, files, { personId: claim.personId, category })
      if (result.added.length > 0) {
        const attached = await attachDocuments(
          db,
          claim.id,
          result.added.map((d) => d.id),
        )
        if (!attached.ok) setNotice(Object.values(attached.errors).map((code) => t(code)))
        void startOcrQueue()
      }
      setNotice([
        ...result.failed.map((f) => t(f.code, { name: f.name })),
        ...result.duplicates.map((name) => t('documents.add.duplicate', { name })),
      ])
    } finally {
      setBusy(false)
    }
  }

  async function detach(doc: DocumentRecord) {
    await onBeforeEdit()
    const outcome = await detachDocuments(db, claim.id, [doc.id])
    setNotice(outcome.ok ? [] : Object.values(outcome.errors).map((code) => t(code)))
  }

  return (
    <section aria-label={title} class="flex flex-col gap-3 rounded-xl bg-surface-2 p-3">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <h3 class="min-w-0 text-fluid-base font-semibold text-ink">{title}</h3>
        <span class="shrink-0 rounded-md bg-surface px-2 py-0.5 text-fluid-sm text-ink-muted">
          {requirement.required ? t('claim.docs.required') : t('claim.docs.optional')}
        </span>
      </div>

      <div class="flex flex-col gap-1">
        <p class="text-fluid-sm font-medium text-ink">{t('claim.docs.checklist')}</p>
        <ul class="flex list-disc flex-col gap-0.5 pl-5 text-fluid-sm text-ink-muted">
          {requirement.checklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <p class="text-fluid-sm text-ink-muted">{t('claim.docs.attached', { count: docs.length })}</p>
      {docs.length > 0 && (
        <ul class="flex flex-col gap-2">
          {docs.map((doc, index) => (
            <AttachedDoc
              key={doc.id}
              doc={doc}
              title={title}
              index={index}
              removable={!readOnly}
              busy={busy}
              onRemove={() => void detach(doc)}
            />
          ))}
        </ul>
      )}

      {!readOnly && (
        <div class="flex flex-col gap-3">
          {requirement.categories.length > 1 && (
            <div class="flex flex-col gap-1">
              <label for={`req-${requirement.id}-category`} class="text-fluid-sm text-ink-muted">
                {t('claim.req.category')}
              </label>
              <select
                id={`req-${requirement.id}-category`}
                value={category}
                class={CONTROL}
                onChange={(e) => setCategory(e.currentTarget.value as DocCategory)}
              >
                {requirement.categories.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabel(c)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div class="flex flex-wrap gap-2">
            <IconButton
              icon="camera"
              label={t('claim.req.capture', { title })}
              variant="primary"
              disabled={busy}
              onClick={() => captureRef.current?.click()}
            />
            <IconButton
              icon="image-pick"
              label={t('claim.req.pick', { title })}
              disabled={busy}
              onClick={() => pickRef.current?.click()}
            />
            <IconButton
              icon="documents"
              label={t('claim.req.library')}
              showLabel
              disabled={busy}
              onClick={() => setPickerOpen((open) => !open)}
            />
            {!requirement.required && (
              <IconButton
                icon="not-applicable"
                label={t('claim.notApplicable')}
                showLabel
                pressed={notApplicable}
                disabled={busy}
                onClick={() => onToggleNotApplicable(requirement.id)}
              />
            )}
          </div>
          {pickerOpen && (
            <DocumentPicker
              claim={claim}
              categories={requirement.categories}
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
            onChange={(e) => void addPicked(e.currentTarget)}
          />
          <input
            ref={pickRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            class="hidden"
            onChange={(e) => void addPicked(e.currentTarget)}
          />
        </div>
      )}

      {notice.length > 0 && (
        <div role="status" class="flex flex-col gap-1 text-fluid-sm text-ink-muted">
          {notice.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}
    </section>
  )
}
