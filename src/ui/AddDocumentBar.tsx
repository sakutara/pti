import { useRef, useState } from 'preact/hooks'
import { DOC_CATEGORIES, type DocCategory } from '../domain/document-types'
import type { Person } from '../domain/types'
import { t } from '../i18n'
import { IconButton } from './IconButton'

export interface AddInput {
  personId: string | null
  category: DocCategory
}

export interface AddDocumentBarProps {
  persons: Person[]
  busy: boolean
  onAdd(files: File[], input: AddInput): void
}

/**
 * Adds documents: a photo from the camera, or one or more images and e-invoice PDFs from the device. Every picked
 * file becomes its own document with the category and person chosen here.
 */
export function AddDocumentBar({ persons, busy, onAdd }: AddDocumentBarProps) {
  const [category, setCategory] = useState<DocCategory>('invoice')
  const [personId, setPersonId] = useState('')
  const captureRef = useRef<HTMLInputElement>(null)
  const pickRef = useRef<HTMLInputElement>(null)

  function take(input: HTMLInputElement) {
    const files = Array.from(input.files ?? [])
    input.value = ''
    if (files.length > 0) onAdd(files, { personId: personId || null, category })
  }

  return (
    <div class="flex flex-col gap-3 rounded-xl bg-surface-2 p-3">
      <div class="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2">
        <label class="flex flex-col gap-1 text-fluid-sm text-ink-muted" for="add-doc-category">
          {t('documents.add.category')}
        </label>
        <select
          id="add-doc-category"
          value={category}
          onChange={(e) => setCategory(e.currentTarget.value as DocCategory)}
          class="min-h-11 min-w-0 rounded-xl border border-surface-2 bg-surface px-3 text-fluid-base text-ink"
        >
          {DOC_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`documents.category.${c}`)}
            </option>
          ))}
        </select>
        <label class="flex flex-col gap-1 text-fluid-sm text-ink-muted" for="add-doc-person">
          {t('documents.person.label')}
        </label>
        <select
          id="add-doc-person"
          value={personId}
          onChange={(e) => setPersonId(e.currentTarget.value)}
          class="min-h-11 min-w-0 rounded-xl border border-surface-2 bg-surface px-3 text-fluid-base text-ink"
        >
          <option value="">{t('documents.person.none')}</option>
          {persons.map((p) => (
            <option key={p.id} value={p.id}>
              {p.fullName}
            </option>
          ))}
        </select>
      </div>
      <div class="flex flex-wrap gap-2">
        <IconButton
          icon="camera"
          label={t('documents.add.capture')}
          showLabel
          variant="primary"
          disabled={busy}
          onClick={() => captureRef.current?.click()}
        />
        <IconButton
          icon="image-pick"
          label={t('documents.add.pick')}
          showLabel
          disabled={busy}
          onClick={() => pickRef.current?.click()}
        />
      </div>
      <input
        ref={captureRef}
        type="file"
        accept="image/*"
        capture="environment"
        class="hidden"
        onChange={(e) => take(e.currentTarget)}
      />
      <input
        ref={pickRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        class="hidden"
        onChange={(e) => take(e.currentTarget)}
      />
    </div>
  )
}
