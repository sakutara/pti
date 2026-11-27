import { useEffect, useRef, useState } from 'preact/hooks'
import { readCardFields } from '../data/card-scan'
import { getBlob } from '../data/files-repo'
import { initOcrModel, ocrModel, OCR_MODEL_BYTES } from '../data/ocr-model'
import { db } from '../db/db'
import type { CardFields } from '../domain/card-ocr'
import { t } from '../i18n'
import { IconButton } from './IconButton'
import { OcrModelBanner } from './OcrModelBanner'

export interface CardScanProps {
  /** Card photo already stored for this person, if any. */
  fileId: string | null
  /**
   * A new photo was picked. The page stores it now (existing person) or after the person is saved (new person).
   * Rejecting means the photo could not be stored.
   */
  onImage(file: File): Promise<void> | void
  /** Fields read from the photo; the page copies them onto its form. */
  onFields(fields: CardFields): void
}

type ReadState =
  | { status: 'idle' }
  | { status: 'reading' }
  | { status: 'done'; count: number }
  | { status: 'nothing' }
  | { status: 'failed' }

/**
 * Card photo first: take or pick the front of the card (PTI cards have no back), store it, and read the person's
 * details from it on the device to fill the form below. Without the reading model the photo is still kept and the
 * reading starts once the user downloads the model.
 */
export function CardScan({ fileId, onImage, onFields }: CardScanProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [image, setImage] = useState<File | null>(null)
  const [read, setRead] = useState<ReadState>({ status: 'idle' })
  const [saveFailed, setSaveFailed] = useState(false)
  const captureRef = useRef<HTMLInputElement>(null)
  const pickRef = useRef<HTMLInputElement>(null)
  const model = ocrModel.value.state

  // Thumbnail: the photo just picked, else the stored one.
  useEffect(() => {
    let alive = true
    let created: string | null = null
    const show = (blob: Blob | undefined) => {
      if (!alive || !blob) return
      created = URL.createObjectURL(blob)
      setUrl(created)
    }
    setUrl(null)
    if (image) show(image)
    else if (fileId) getBlob(db, fileId).then(show).catch(() => {})
    return () => {
      alive = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [fileId, image])

  async function runOcr(file: File) {
    setRead({ status: 'reading' })
    try {
      const fields = await readCardFields(file)
      const count = Object.keys(fields).length
      if (count === 0) {
        setRead({ status: 'nothing' })
        return
      }
      onFields(fields)
      setRead({ status: 'done', count })
    } catch {
      setRead({ status: 'failed' })
    }
  }

  // A photo waiting for the model is read as soon as the model is ready.
  useEffect(() => {
    if (model === 'ready' && image && read.status === 'idle') void runOcr(image)
  }, [model, image])

  async function onPicked(input: HTMLInputElement) {
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    setSaveFailed(false)
    setRead({ status: 'idle' })
    try {
      await onImage(file)
    } catch {
      setSaveFailed(true)
    }
    // Shown once stored; the effect above reads it as soon as the model is ready.
    setImage(file)
    // Reads the stored model state only now, so nothing about OCR runs before the user picks a photo.
    await initOcrModel().catch(() => {})
  }

  const busy = read.status === 'reading'
  const hasImage = url !== null

  return (
    <section aria-labelledby="card-scan-heading" class="grid gap-3 rounded-xl border border-accent/40 bg-surface-2/50 p-3">
      <div class="grid gap-1">
        <h3 id="card-scan-heading" class="text-fluid-lg font-semibold text-ink">
          {t('cardScan.title')}
        </h3>
        <p class="text-fluid-sm text-ink-muted">{t('cardScan.intro')}</p>
      </div>

      <div class="flex flex-wrap items-start gap-3">
        <div class="flex aspect-[1.6/1] w-44 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-2 p-2 text-center text-fluid-sm text-ink-muted">
          {hasImage ? (
            <img src={url} alt={t('cardScan.thumb')} class="size-full object-cover" />
          ) : (
            <span>{t('cardScan.empty')}</span>
          )}
        </div>
        <div class="flex flex-col gap-2">
          <IconButton
            icon="camera"
            label={t('cardScan.capture')}
            showLabel
            variant="primary"
            disabled={busy}
            onClick={() => captureRef.current?.click()}
          />
          <IconButton
            icon="image-pick"
            label={t('cardScan.pick')}
            showLabel
            disabled={busy}
            onClick={() => pickRef.current?.click()}
          />
          {image && model === 'ready' && !busy ? (
            <IconButton icon="ocr-run" label={t('cardScan.readAgain')} showLabel onClick={() => void runOcr(image)} />
          ) : null}
        </div>
      </div>

      <input
        ref={captureRef}
        type="file"
        accept="image/*"
        capture="environment"
        class="hidden"
        data-testid="card-scan-capture"
        onChange={(e) => void onPicked(e.currentTarget)}
      />
      <input
        ref={pickRef}
        type="file"
        accept="image/*"
        class="hidden"
        data-testid="card-scan-pick"
        onChange={(e) => void onPicked(e.currentTarget)}
      />

      {saveFailed ? (
        <p role="alert" class="text-fluid-sm text-red-600 dark:text-red-400">
          {t('card.saveFailed')}
        </p>
      ) : null}

      <p role="status" class="text-fluid-sm text-ink empty:hidden">
        {read.status === 'reading'
          ? t('cardScan.reading')
          : read.status === 'done'
            ? t('cardScan.filled', { n: read.count })
            : read.status === 'nothing'
              ? t('cardScan.nothing')
              : read.status === 'failed'
                ? t('cardScan.failed')
                : ''}
      </p>

      {image && model !== 'ready' ? (
        <OcrModelBanner
          pendingCount={1}
          offer={t('cardScan.modelOffer', { mb: Math.round(OCR_MODEL_BYTES / 1_000_000) })}
        />
      ) : null}
    </section>
  )
}
