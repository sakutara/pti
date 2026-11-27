import { downloadOcrModel, ocrModel, OCR_MODEL_BYTES } from '../data/ocr-model'
import { startOcrQueue } from '../data/ocr-queue'
import { t } from '../i18n'
import { IconButton } from './IconButton'

const megabytes = (bytes: number) => Math.round(bytes / 1_000_000)

export interface OcrModelBannerProps {
  /** Invoices waiting to be read. The offer shows only when there is something to read. */
  pendingCount: number
  /** Offer text; defaults to the invoice wording. */
  offer?: string
}

/**
 * Asks once for the on-device reading model. Nothing is downloaded until the user taps the button; progress and
 * errors are shown while it runs, and a finished download restarts the reading queue.
 */
export function OcrModelBanner({ pendingCount, offer }: OcrModelBannerProps) {
  const model = ocrModel.value
  if (model.state === 'ready') return null
  if (model.state === 'absent' && pendingCount === 0) return null

  const downloading = model.state === 'downloading'
  const start = () => {
    void downloadOcrModel()
      .then(() => startOcrQueue())
      .catch(() => {})
  }

  return (
    <section aria-label={t('ocr.banner.label')} class="flex flex-col gap-3 rounded-xl bg-surface-2 p-3">
      {model.state === 'error' ? (
        <p role="alert" class="text-fluid-sm text-red-600 dark:text-red-400">
          {t('ocr.model.error')}
        </p>
      ) : downloading ? (
        <>
          <p class="text-fluid-sm text-ink">
            {t('ocr.model.progress', { loaded: megabytes(model.loaded), total: megabytes(model.total) })}
          </p>
          <progress
            class="h-3 w-full"
            max={model.total}
            value={model.loaded}
            aria-label={t('ocr.model.progressLabel')}
          />
        </>
      ) : (
        <p class="text-fluid-sm text-ink-muted">{offer ?? t('ocr.model.offer', { mb: megabytes(OCR_MODEL_BYTES) })}</p>
      )}
      <div>
        <IconButton
          icon="model-download"
          label={downloading ? t('ocr.model.downloading') : model.state === 'error' ? t('ocr.model.retry') : t('ocr.model.download')}
          showLabel
          variant="primary"
          disabled={downloading}
          onClick={start}
        />
      </div>
    </section>
  )
}
