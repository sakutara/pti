import { useEffect, useState } from 'preact/hooks'
import { accountState } from '../data/account-state'
import {
  addFiles,
  listDocuments,
  listPendingOcr,
  mergeDocuments,
  type DocumentFilter,
} from '../data/documents-repo'
import { startOcrQueue } from '../data/ocr-queue'
import { listPersons } from '../data/persons-repo'
import { db } from '../db/db'
import { DOC_CATEGORIES, type DocCategory } from '../domain/document-types'
import type { Person } from '../domain/types'
import { t } from '../i18n'
import { encodeQuery, navigate, replaceQuery, route } from '../router'
import { AddDocumentBar, type AddInput } from '../ui/AddDocumentBar'
import { DocumentCard, useLive } from '../ui/DocumentCard'
import { DocumentEditor } from '../ui/DocumentEditor'
import { DocumentFilters } from '../ui/DocumentFilters'
import { IconButton } from '../ui/IconButton'
import { OcrModelBanner } from '../ui/OcrModelBanner'

/** Filters live in the hash query: c = category, p = person, n = 1 for "not in a claim". */
export function filterFrom(query: Record<string, string>): DocumentFilter {
  const filter: DocumentFilter = {}
  if (query.c && (DOC_CATEGORIES as readonly string[]).includes(query.c)) filter.category = query.c as DocCategory
  if (query.p) filter.personId = query.p
  if (query.n === '1') filter.notInClaim = true
  return filter
}

type Notice = { kind: 'status' | 'alert'; lines: string[] } | null

/**
 * The document library: the grid with filters and merge selection on the left, the selected document's editor on the
 * right (wide screens) or full screen (narrow). Shared by `#/documents` and `#/documents/:id`.
 */
export function DocumentsPage() {
  const { query, params } = route.value
  const selectedId = params.id ?? null
  const qs = encodeQuery(query)
  const filter = filterFrom(query)
  const filterKey = JSON.stringify(filter)
  const accountId = accountState.value.status === 'ready' ? accountState.value.account.id : undefined

  const [persons, setPersons] = useState<Person[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])

  const docs = useLive(() => listDocuments(db, filter), [filterKey])
  const pendingCount = useLive(async () => (await listPendingOcr(db)).length, [])

  useEffect(() => {
    if (!accountId) return
    let alive = true
    void listPersons(db, accountId).then((rows) => {
      if (alive) setPersons(rows)
    })
    return () => {
      alive = false
    }
  }, [accountId])

  useEffect(() => {
    setSelected([])
  }, [filterKey])

  const setParams = (patch: Record<string, string>) => replaceQuery({ ...route.value.query, ...patch })

  async function onAdd(files: File[], input: AddInput) {
    setBusy(true)
    try {
      const result = await addFiles(db, files, input)
      const lines = [
        ...(result.added.length > 0 ? [t('documents.add.done', { count: result.added.length })] : []),
        ...result.failed.map((f) => t(f.code, { name: f.name })),
        ...result.duplicates.map((name) => t('documents.add.duplicate', { name })),
        ...result.lowResolution.map((name) => t('documents.add.lowResolution', { name })),
      ]
      setNotice({ kind: result.failed.length > 0 ? 'alert' : 'status', lines })
      if (result.added.length > 0) void startOcrQueue()
    } finally {
      setBusy(false)
    }
  }

  const toggleSelected = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))

  const toggleSelectMode = () => {
    setSelectMode((on) => !on)
    setSelected([])
  }

  async function runMerge() {
    const outcome = await mergeDocuments(db, selected)
    if (!outcome.ok) {
      setNotice({ kind: 'alert', lines: Object.values(outcome.errors).map((code) => t(code)) })
      return
    }
    setSelected([])
    setSelectMode(false)
    navigate(`/documents/${outcome.document.id}${qs}`)
  }

  const back = () => navigate(`/documents${qs}`)

  return (
    <section class="grid gap-4 py-4 lg:grid-cols-[1fr_36rem] lg:items-start lg:gap-6">
      <div class={`flex min-w-0 flex-col gap-4 ${selectedId ? 'hidden lg:flex' : 'flex'}`}>
        <h2 class="text-fluid-xl font-semibold text-ink">{t('documents.title')}</h2>
        <AddDocumentBar persons={persons} busy={busy} onAdd={(files, input) => void onAdd(files, input)} />
        <OcrModelBanner pendingCount={pendingCount ?? 0} />
        {notice && (
          <div role={notice.kind} class="flex flex-col gap-1 text-fluid-sm text-ink-muted">
            {notice.lines.map((line) => (
              <p key={line} class={notice.kind === 'alert' ? 'text-red-600 dark:text-red-400' : ''}>
                {line}
              </p>
            ))}
          </div>
        )}
        <DocumentFilters
          value={{
            category: filter.category ?? '',
            personId: filter.personId ?? '',
            notInClaim: filter.notInClaim === true,
          }}
          persons={persons}
          onChange={setParams}
        />
        <div class="flex flex-wrap gap-2">
          <IconButton
            icon="merge"
            label={t('documents.merge.start')}
            showLabel
            pressed={selectMode}
            onClick={toggleSelectMode}
          />
          {selectMode && (
            <IconButton
              icon="merge"
              label={t('documents.merge.run', { count: selected.length })}
              showLabel
              variant="primary"
              disabled={selected.length < 2}
              onClick={() => void runMerge()}
            />
          )}
        </div>

        {docs !== undefined && docs.length === 0 ? (
          <p class="text-fluid-base text-ink-muted">{t('documents.empty')}</p>
        ) : (
          <ul aria-label={t('documents.list')} class="grid grid-cols-2 gap-3 xl:grid-cols-3">
            {(docs ?? []).map((doc) => (
              <li key={doc.id} class="min-w-0">
                <DocumentCard
                  doc={doc}
                  selectMode={selectMode}
                  selected={selected.includes(doc.id)}
                  selectedIndex={selected.indexOf(doc.id)}
                  onToggle={toggleSelected}
                  queryString={qs}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div class={selectedId ? 'min-w-0' : 'hidden lg:block'}>
        {selectedId ? (
          <DocumentEditor key={selectedId} id={selectedId} persons={persons} onDeleted={back} onBack={back} />
        ) : (
          <p class="text-fluid-base text-ink-muted">{t('documents.pickOne')}</p>
        )}
      </div>
    </section>
  )
}
