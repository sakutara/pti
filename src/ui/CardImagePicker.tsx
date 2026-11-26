import { useEffect, useRef, useState } from 'preact/hooks'
import { db } from '../db/db'
import { getBlob, saveImage, type Downscale } from '../data/files-repo'
import { t } from '../i18n'
import { IconButton } from './IconButton'

export interface CardImagePickerProps {
  personId: string
  kind: 'card-front' | 'card-back'
  fileId: string | null
  downscale?: Downscale
  onSaved?(fileId: string): void
}

/** Thumbnail of a person's card side, with camera and gallery pickers that store the image. */
export function CardImagePicker({ personId, kind, fileId, downscale, onSaved }: CardImagePickerProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const captureRef = useRef<HTMLInputElement>(null)
  const pickRef = useRef<HTMLInputElement>(null)
  const side = t(kind === 'card-front' ? 'card.front' : 'card.back')

  useEffect(() => {
    setUrl(null)
    if (!fileId) return
    let alive = true
    let created: string | null = null
    getBlob(db, fileId)
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
  }, [fileId])

  async function store(input: HTMLInputElement) {
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    setBusy(true)
    setFailed(false)
    try {
      const saved = await saveImage(db, { type: 'person', id: personId }, kind, file, { downscale })
      onSaved?.(saved.id)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="flex items-start gap-3">
      <div class="flex aspect-[1.6/1] w-36 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-2 p-2 text-center text-fluid-sm text-ink-muted">
        {url ? (
          <img src={url} alt={t('card.thumb', { side })} class="size-full object-cover" />
        ) : (
          <span>{t('card.empty', { side })}</span>
        )}
      </div>
      <div class="flex flex-col gap-2">
        <IconButton
          icon="camera"
          label={t('card.capture', { side })}
          disabled={busy}
          onClick={() => captureRef.current?.click()}
        />
        <IconButton
          icon="image-pick"
          label={t('card.pick', { side })}
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
        onChange={(e) => void store(e.currentTarget)}
      />
      <input ref={pickRef} type="file" accept="image/*" class="hidden" onChange={(e) => void store(e.currentTarget)} />
      {failed ? (
        <p role="alert" class="text-fluid-sm text-red-600 dark:text-red-400">
          {t('card.saveFailed')}
        </p>
      ) : null}
    </div>
  )
}
