import { useEffect, useRef, useState } from 'preact/hooks'
import { db } from '../db/db'
import { BackupError, exportBackup, getLastBackupAt, importBackup, markBackupDone } from '../data/backup'
import { refreshAccount } from '../data/account-state'
import { t } from '../i18n'
import { IconButton } from './IconButton'

type Notice = { kind: 'status' | 'alert'; text: string }

const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar date as dd/MM/yyyy. */
function formatDate(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

const formatMb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`

const ERROR_KEY = {
  foreign: 'backup.error.foreign',
  'newer-schema': 'backup.error.newer',
  corrupt: 'backup.error.corrupt',
} as const

export function BackupSection() {
  // undefined = still loading; null = never backed up / unknown.
  const [lastBackupAt, setLastBackupAt] = useState<number | null | undefined>(undefined)
  const [persisted, setPersisted] = useState<boolean | undefined>(undefined)
  const [usage, setUsage] = useState<number | undefined>(undefined)
  const [notice, setNotice] = useState<Notice | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      const [last, persistedRow] = await Promise.all([getLastBackupAt(db), db.settings.get('persisted')])
      let estimate: StorageEstimate | undefined
      try {
        estimate = await navigator.storage?.estimate?.()
      } catch {
        estimate = undefined
      }
      if (!active) return
      setLastBackupAt(last)
      setPersisted(typeof persistedRow?.value === 'boolean' ? persistedRow.value : undefined)
      setUsage(typeof estimate?.usage === 'number' ? estimate.usage : undefined)
    })()
    return () => {
      active = false
    }
  }, [])

  async function onExport() {
    let exported: Awaited<ReturnType<typeof exportBackup>>
    try {
      exported = await exportBackup(db, new Date())
    } catch {
      setNotice({ kind: 'alert', text: t('backup.error.export') })
      return
    }
    const { blob, fileName } = exported
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)

    const now = Date.now()
    await markBackupDone(db, now)
    setLastBackupAt(now)
    setNotice({ kind: 'status', text: t('backup.exportDone') })
  }

  async function onFileChosen(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    if (!window.confirm(t('backup.importConfirm'))) return

    try {
      const { imported } = await importBackup(db, file)
      await refreshAccount()
      setNotice({ kind: 'status', text: t('backup.importDone', { count: imported }) })
    } catch (err) {
      // Anything that is not a BackupError is treated as an unreadable file.
      const code = err instanceof BackupError ? err.code : 'corrupt'
      setNotice({ kind: 'alert', text: t(ERROR_KEY[code]) })
    }
  }

  return (
    <section class="flex flex-col gap-3 p-4">
      <h2 class="text-fluid-lg font-semibold text-ink">{t('backup.title')}</h2>

      <div class="flex flex-wrap gap-2">
        <IconButton icon="download" label={t('backup.export')} showLabel variant="primary" onClick={() => void onExport()} />
        <IconButton icon="upload" label={t('backup.import')} showLabel onClick={() => fileInput.current?.click()} />
        <input
          ref={fileInput}
          type="file"
          accept=".ptibackup,application/zip"
          hidden
          onChange={(event) => void onFileChosen(event)}
        />
      </div>

      {notice && (
        <p role={notice.kind} class="text-fluid-sm text-ink">
          {notice.text}
        </p>
      )}

      <ul class="flex flex-col gap-1 text-fluid-sm text-ink-muted">
        {lastBackupAt !== undefined && (
          <li>
            {lastBackupAt === null
              ? t('backup.never')
              : t('backup.lastExport', { date: formatDate(lastBackupAt) })}
          </li>
        )}
        {persisted !== undefined && (
          <li>{persisted ? t('backup.persisted') : t('backup.notPersisted')}</li>
        )}
        {usage !== undefined && <li>{t('backup.usage', { used: formatMb(usage) })}</li>}
      </ul>
    </section>
  )
}
