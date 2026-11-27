import { useEffect, useState } from 'preact/hooks'
import { loadManifest } from '../data/datasets'
import { dismissNotice, pendingNotice, type FacilitiesNotice } from '../data/facilities-notice'
import { t } from '../i18n'
import { IconButton } from './IconButton'

/**
 * One-time notice at startup when the bundled facilities list changed since the user last saw it.
 * Any failure (manifest, database) is silent: the notice is optional and must never block the app.
 */
export function DataNotice() {
  const [notice, setNotice] = useState<FacilitiesNotice | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const manifest = await loadManifest()
        if (!manifest.ok) return
        const pending = await pendingNotice(manifest.data)
        if (alive) setNotice(pending)
      } catch {
        // Silent by design.
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  if (notice === null) return null

  const dismiss = () => {
    const { version } = notice
    setNotice(null)
    dismissNotice(version).catch(() => undefined)
  }

  return (
    <div role="status" class="mt-4 flex items-center justify-between gap-2 rounded-xl bg-surface-2 py-1 pl-4 pr-1 text-ink">
      <p class="text-fluid-sm">
        {t('facilities.notice', { added: notice.added, removed: notice.removed, changed: notice.changed })}
      </p>
      <IconButton icon="close" label={t('facilities.notice.dismiss')} onClick={dismiss} />
    </div>
  )
}
