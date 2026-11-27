import { useEffect, useState } from 'preact/hooks'
import { db } from '../db/db'
import type { Claim } from '../domain/claim-types'
import type { ComposedEmail } from '../domain/email'
import { sendClaimByGmail, threadUrl, type BundleFile } from '../data/send-claim'
import { t } from '../i18n'
import { IconButton } from './IconButton'

/** Size of a file for people: MB from 1 MB up, KB below. */
export function sizeLabel(bytes: number): string {
  if (bytes >= 1_000_000) return t('claim.review.size', { mb: (bytes / 1_000_000).toFixed(1) })
  return t('claim.review.sizeKb', { kb: Math.max(1, Math.round(bytes / 1000)) })
}

/** Tracks the browser's network state; the send is disabled while offline. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; threadId: string }
  | { kind: 'saveFailed'; threadId: string }
  | { kind: 'failed'; error: string }

export interface GmailConfirmProps {
  claim: Claim
  /** The composed email; the subject can be edited here before sending. */
  composed: ComposedEmail
  /** The connected Gmail address, shown as the sender. */
  sender: string
  files: BundleFile[]
  onChanged: () => void
  onUseOther: () => void
}

/**
 * Confirmation before a Gmail send: sender, recipient, CC, an editable subject and both files. Nothing is sent until
 * the user taps "Gửi". A failed send keeps the claim ready and offers a retry. When the status write fails after
 * Gmail accepted the mail, the app says the mail was sent and blocks a resend.
 */
export function GmailConfirm({ claim, composed, sender, files, onChanged, onUseOther }: GmailConfirmProps) {
  const online = useOnline()
  const [subject, setSubject] = useState(composed.subject)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })

  async function send(): Promise<void> {
    setPhase({ kind: 'sending' })
    const result = await sendClaimByGmail(db, claim.id, {
      to: composed.to,
      cc: composed.cc,
      subject,
      body: composed.body,
      files: files.map((f) => ({ name: f.name, bytes: f.bytes, mime: f.mime })),
    })
    if (result.ok) {
      setPhase({ kind: 'sent', threadId: result.threadId })
      onChanged()
    } else if (result.error === 'send.saveFailed') {
      setPhase({ kind: 'saveFailed', threadId: result.threadId ?? '' })
    } else {
      setPhase({ kind: 'failed', error: result.error })
    }
  }

  const sentOrBlocked = phase.kind === 'sent' || phase.kind === 'saveFailed'
  const threadId = phase.kind === 'sent' || phase.kind === 'saveFailed' ? phase.threadId : ''

  return (
    <section aria-labelledby="gmail-confirm-heading" class="flex flex-col gap-4 rounded-xl border border-surface-2 p-4">
      <h2 id="gmail-confirm-heading" class="text-fluid-lg font-semibold text-ink">
        {t('claim.review.gmailConfirm')}
      </h2>
      <p class="text-fluid-sm text-ink-muted">{t('claim.review.gmailFrom', { email: sender })}</p>

      <dl class="grid gap-3 text-fluid-sm text-ink">
        <div>
          <dt class="font-medium">{t('claim.review.recipient')}</dt>
          <dd>{composed.to}</dd>
        </div>
        <div>
          <dt class="font-medium">{t('claim.review.cc')}</dt>
          <dd>{composed.cc.join(', ')}</dd>
        </div>
      </dl>

      <div class="grid gap-1">
        <label for="gmail-subject" class="text-fluid-sm font-medium text-ink">
          {t('claim.review.subject')}
        </label>
        <input
          id="gmail-subject"
          type="text"
          value={subject}
          disabled={sentOrBlocked || phase.kind === 'sending'}
          onInput={(e) => setSubject(e.currentTarget.value)}
          class="min-h-11 w-full rounded-xl border border-surface-2 bg-surface px-3 text-fluid-base text-ink focus-visible:outline-2 focus-visible:outline-accent"
        />
      </div>

      <div class="grid gap-1">
        <p class="text-fluid-sm font-medium text-ink">{t('claim.review.attachments')}</p>
        <ul class="grid gap-1 text-fluid-sm text-ink">
          {files.map((file) => (
            <li key={file.name} class="flex items-center justify-between gap-3">
              <span class="min-w-0 break-words">{file.name}</span>
              <span class="shrink-0 tabular-nums text-ink-muted">{sizeLabel(file.bytes.byteLength)}</span>
            </li>
          ))}
        </ul>
      </div>

      {!online && !sentOrBlocked ? (
        <p role="status" class="text-fluid-sm text-ink-muted">
          {t('claim.review.offline')}
        </p>
      ) : null}
      {phase.kind === 'failed' ? (
        <p role="alert" class="text-fluid-sm text-red-600 dark:text-red-400">
          {t(phase.error)}
        </p>
      ) : null}
      {phase.kind === 'saveFailed' ? (
        <p role="alert" class="text-fluid-sm text-red-600 dark:text-red-400">
          {t('send.saveFailed')}
        </p>
      ) : null}
      {phase.kind === 'sent' ? (
        <p role="status" class="text-fluid-sm text-ink">
          {t('claim.review.sent')}
        </p>
      ) : null}
      {sentOrBlocked && threadId !== '' ? (
        <a
          href={threadUrl(threadId)}
          target="_blank"
          rel="noopener"
          class="inline-flex min-h-11 items-center text-fluid-sm font-medium text-accent underline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {t('claim.review.openThread')}
        </a>
      ) : null}

      <div class="flex flex-wrap gap-2">
        {sentOrBlocked ? null : (
          <IconButton
            icon="send"
            label={phase.kind === 'sending' ? t('claim.review.sending') : phase.kind === 'failed' ? t('claim.review.retry') : t('claim.review.send')}
            showLabel
            variant="primary"
            disabled={!online || phase.kind === 'sending' || subject.trim() === ''}
            onClick={() => void send()}
          />
        )}
        {sentOrBlocked ? null : (
          <IconButton icon="mail-open" label={t('claim.review.useOtherMail')} showLabel onClick={onUseOther} />
        )}
      </div>
    </section>
  )
}
