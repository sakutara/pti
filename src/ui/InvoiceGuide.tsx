import { useEffect, useRef, useState } from 'preact/hooks'
import type { InvoiceGuidance } from '../domain/requirements-schema'
import type { Person } from '../domain/types'
import { navigate } from '../router'
import { t } from '../i18n'
import { IconButton } from './IconButton'

export interface InvoiceGuideProps {
  /** The insured person the invoice is for: the buyer. */
  person: Person
  guidance: InvoiceGuidance
}

/** How long the copy icon shows its tick. */
export const COPIED_MS = 2000

type FieldKey = 'fullName' | 'address' | 'idNumber'

const LABEL: Record<FieldKey, string> = {
  fullName: 'invoice.buyer',
  address: 'invoice.address',
  idNumber: 'invoice.idNumber',
}

const valueOf = (person: Person, key: FieldKey): string | null => {
  const value = person[key]
  return value === null || value.trim() === '' ? null : value
}

/** Lowercases the first letter only: "Số CCCD" becomes "số CCCD" in a sentence. */
const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1)

/**
 * The invoice guidance card: whom the invoice must name and what to check, with a one-tap copy of each of the person's
 * values. Everything is local, so it works offline.
 */
export function InvoiceGuide({ person, guidance }: InvoiceGuideProps) {
  const [copied, setCopied] = useState<FieldKey | null>(null)
  const [failed, setFailed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const fields = guidance.fields.filter((f): f is FieldKey => f in LABEL)

  async function copy(key: FieldKey, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setFailed(false)
      setCopied(key)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(null), COPIED_MS)
    } catch {
      setCopied(null)
      setFailed(true)
      const cell = document.getElementById(`invoice-value-${key}`)
      if (cell) {
        const selection = window.getSelection()
        const range = document.createRange()
        range.selectNodeContents(cell)
        selection?.removeAllRanges()
        selection?.addRange(range)
      }
    }
  }

  const copiedLabel = copied ? lowerFirst(t(LABEL[copied])) : ''

  return (
    <section aria-labelledby="invoice-guide-title" class="flex flex-col gap-3 rounded-xl bg-surface-2 p-4">
      <h3 id="invoice-guide-title" class="text-fluid-base font-semibold text-ink">
        {t('invoice.title')}
      </h3>
      <p class="text-fluid-sm text-ink-muted">{t('invoice.intro')}</p>

      {valueOf(person, 'address') === null && (
        <div class="flex flex-col items-start gap-2 rounded-lg bg-surface p-3">
          <p class="text-fluid-sm text-ink">{t('invoice.missingAddress')}</p>
          <IconButton
            icon="person-add"
            label={t('invoice.addAddress')}
            showLabel
            onClick={() => navigate(`/account/person/${person.id}`)}
          />
        </div>
      )}

      <dl class="flex flex-col gap-2">
        {fields.map((key) => {
          const value = valueOf(person, key)
          return (
            <div key={key} class="flex items-start justify-between gap-2 rounded-lg bg-surface p-3">
              <div class="flex min-w-0 flex-col gap-0.5">
                <dt class="text-fluid-sm text-ink-muted">{t(LABEL[key])}</dt>
                <dd id={`invoice-value-${key}`} class="min-w-0 break-words text-fluid-base text-ink">
                  {value ?? t('invoice.noValue')}
                </dd>
              </div>
              {value !== null && (
                <IconButton
                  icon={copied === key ? 'check' : 'copy'}
                  label={t('invoice.copy', { field: lowerFirst(t(LABEL[key])) })}
                  onClick={() => void copy(key, value)}
                />
              )}
            </div>
          )
        })}
      </dl>

      {copied && (
        <p role="status" class="text-fluid-sm text-ink">
          {t('invoice.copied', { field: copiedLabel })}
        </p>
      )}
      {failed && (
        <p role="alert" class="text-fluid-sm text-red-600 dark:text-red-400">
          {t('invoice.copyFailed')}
        </p>
      )}

      <div class="flex flex-col gap-1">
        <h4 class="text-fluid-sm font-semibold text-ink">{t('invoice.warnings')}</h4>
        <ul class="flex list-disc flex-col gap-1 pl-5 text-fluid-sm text-ink-muted">
          {guidance.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
          <li>{t('invoice.signed')}</li>
        </ul>
      </div>
    </section>
  )
}
