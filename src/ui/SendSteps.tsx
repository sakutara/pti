import { useState } from 'preact/hooks'
import { gmailEnabled } from '../config'
import { gmailSession } from '../data/gmail-session'
import {
  markSentByMailto,
  markSubmittedAfterSend,
  composeClaimEmail,
  loadBundleFiles,
  readUnsavedGmailSend,
  threadUrl,
  type BundleFile,
  type UnsavedGmailSend,
} from '../data/send-claim'
import { db } from '../db/db'
import type { Claim } from '../domain/claim-types'
import type { ComposedEmail } from '../domain/email'
import type { DocumentRecord } from '../domain/document-types'
import type { AdministratorConfig } from '../domain/requirements-schema'
import type { Account, Person } from '../domain/types'
import { t } from '../i18n'
import { navigate } from '../router'
import { useLive } from './DocumentCard'
import { GmailConfirm, sizeLabel } from './GmailConfirm'
import { GmailConnect } from './GmailConnect'
import { IconButton } from './IconButton'
import { OriginalsStep } from './OriginalsStep'

/** Opens the prepared mailto: URL. A variable so tests can replace it. */
export const mailtoOpener = {
  open(url: string): void {
    window.location.href = url
  },
}

/** Saves a Blob under a file name through a temporary object URL, revoked after the download has started. */
export const fileSaver = {
  save(name: string, blob: Blob): void {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.hidden = true
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  },
}

/** The files as File objects for the share sheet. */
function asFiles(files: BundleFile[]): File[] {
  return files.map((f) => new File([f.blob], f.name, { type: f.mime }))
}

/** True when the browser can share these files (navigator.canShare with files). */
function canShareFiles(files: BundleFile[]): boolean {
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean }
  if (typeof nav.canShare !== 'function') return false
  try {
    return nav.canShare({ files: asFiles(files) })
  } catch {
    return false
  }
}

export interface SendStepsProps {
  claim: Claim
  account: Account
  administrator: AdministratorConfig
  patient: Person
  holder: Person
  documents: DocumentRecord[]
  /** Called after a change of the claim (sent, or submitted by hand) so the caller re-reads it. */
  onChanged: () => void
}

/**
 * The send step: Gmail confirmation when Gmail is connected and the user has not chosen another app; otherwise the
 * three-step mailto flow (save the files, open the email, confirm it was sent). Originals are shown for types the
 * email does not cover. Nothing is sent here without a tap.
 */
export function SendSteps(props: SendStepsProps) {
  const { claim, account, administrator, patient, holder, documents, onChanged } = props
  const session = gmailSession.value
  const [otherApp, setOtherApp] = useState(false)
  const bundle = useLive<BundleFile[] | null>(() => loadBundleFiles(db, claim), [
    claim.id,
    claim.bundleFileIds.join(','),
    claim.updatedAt,
  ])

  const unsaved = useLive<UnsavedGmailSend | null>(() => readUnsavedGmailSend(db, claim.id), [claim.id, claim.updatedAt])

  const composed = composeClaimEmail({ account, administrator, claim, patient, holder, documents })
  const gmailOn = gmailEnabled() && session.status === 'connected' && !otherApp

  if (bundle === undefined || unsaved === undefined) return null
  if (unsaved === null && bundle === null) return <p class="text-fluid-sm text-ink-muted">{t('claim.review.buildFirst')}</p>

  return (
    <section aria-labelledby="send-steps-heading" class="flex flex-col gap-4">
      <h2 id="send-steps-heading" class="text-fluid-lg font-semibold text-ink">
        {t('claim.review.sendTitle')}
      </h2>

      {unsaved !== null ? (
        <UnsavedGmailSendNote claim={claim} threadId={unsaved.threadId} onChanged={onChanged} />
      ) : bundle === null ? null : composed.ok === false ? (
        <div class="flex flex-col items-start gap-2">
          <p role="alert" class="text-fluid-sm text-red-600 dark:text-red-400">
            {t('claim.review.recipientMissing')}
          </p>
          <IconButton icon="settings" label={t('claim.review.noRecipientLink')} showLabel onClick={() => navigate('/account')} />
        </div>
      ) : gmailOn ? (
        <GmailConfirm
          claim={claim}
          composed={composed.email}
          sender={session.email}
          files={bundle}
          onChanged={onChanged}
          onUseOther={() => setOtherApp(true)}
        />
      ) : (
        <>
          {gmailEnabled() && session.status !== 'connected' ? <GmailConnect /> : null}
          <MailtoSteps claim={claim} composed={composed.email} files={bundle} onChanged={onChanged} />
        </>
      )}

      <OriginalsStep claim={claim} />
    </section>
  )
}

interface UnsavedGmailSendNoteProps {
  claim: Claim
  threadId: string
  onChanged: () => void
}

/**
 * Gmail accepted the mail but the claim was not saved as sent. Offers no send again; only records the submission,
 * retrying the status write.
 */
function UnsavedGmailSendNote({ claim, threadId, onChanged }: UnsavedGmailSendNoteProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function markSubmitted() {
    setBusy(true)
    setError(null)
    const result = await markSubmittedAfterSend(db, claim.id)
    setBusy(false)
    if (result.ok) onChanged()
    else setError(t(result.error))
  }

  return (
    <div class="flex flex-col gap-3">
      <p role="alert" class="text-fluid-sm text-red-600 dark:text-red-400">
        {t('send.alreadySent')}
      </p>
      <a
        href={threadUrl(threadId)}
        target="_blank"
        rel="noopener"
        class="inline-flex min-h-11 items-center text-fluid-sm font-medium text-accent underline focus-visible:outline-2 focus-visible:outline-accent"
      >
        {t('claim.review.openThread')}
      </a>
      <div>
        <IconButton icon="check" label={t('send.markSubmitted')} showLabel variant="primary" disabled={busy} onClick={() => void markSubmitted()} />
      </div>
      {error !== null ? (
        <p role="alert" class="text-fluid-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  )
}

interface MailtoStepsProps {
  claim: Claim
  composed: ComposedEmail
  files: BundleFile[]
  onChanged: () => void
}

/** The fallback: save the two PDFs, open the prepared email, then confirm it was sent by hand. */
function MailtoSteps({ claim, composed, files, onChanged }: MailtoStepsProps) {
  const [sharing, setSharing] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [confirmed, setConfirmed] = useState<'idle' | 'busy' | 'failed'>('idle')
  const shareable = canShareFiles(files)

  function saveFiles() {
    for (const file of files) fileSaver.save(file.name, file.blob)
  }

  function openMail() {
    mailtoOpener.open(composed.mailto)
  }

  /** Copies the recipient first, then opens the share sheet with both files, the subject and the body. */
  async function share() {
    setSharing('idle')
    try {
      await navigator.clipboard.writeText(composed.to)
      setSharing('copied')
    } catch {
      setSharing('idle')
    }
    try {
      await navigator.share({ files: asFiles(files), title: composed.subject, text: composed.body })
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setSharing('failed')
    }
  }

  async function confirmSent() {
    setConfirmed('busy')
    const result = await markSentByMailto(db, claim.id)
    if (result.ok) {
      setConfirmed('idle')
      onChanged()
    } else {
      setConfirmed('failed')
    }
  }

  return (
    <section aria-labelledby="mailto-steps-heading" class="flex flex-col gap-4">
      <h3 id="mailto-steps-heading" class="text-fluid-base font-semibold text-ink">
        {t('claim.review.mailtoSteps')}
      </h3>
      <p class="text-fluid-sm text-ink-muted">{t('claim.review.mailtoNote')}</p>

      <dl class="grid gap-2 text-fluid-sm text-ink">
        <div>
          <dt class="font-medium">{t('claim.review.recipient')}</dt>
          <dd>{composed.to}</dd>
        </div>
        <div>
          <dt class="font-medium">{t('claim.review.subject')}</dt>
          <dd class="break-words">{composed.subject}</dd>
        </div>
      </dl>

      <ul class="grid gap-1 text-fluid-sm text-ink">
        {files.map((file) => (
          <li key={file.name} class="flex items-center justify-between gap-3">
            <span class="min-w-0 break-words">{file.name}</span>
            <span class="shrink-0 tabular-nums text-ink-muted">{sizeLabel(file.bytes.byteLength)}</span>
          </li>
        ))}
      </ul>

      <ol class="grid gap-2">
        <li>
          <IconButton icon="pdf-save" label={t('claim.review.saveFiles')} showLabel onClick={saveFiles} />
        </li>
        <li>
          <IconButton icon="mail-open" label={t('claim.review.openMail')} showLabel onClick={openMail} />
        </li>
        <li>
          <IconButton
            icon="mail-sent"
            label={t('claim.review.sentConfirm')}
            showLabel
            variant="primary"
            disabled={confirmed === 'busy'}
            onClick={() => void confirmSent()}
          />
        </li>
      </ol>

      {confirmed === 'failed' ? (
        <p role="alert" class="text-fluid-sm text-red-600 dark:text-red-400">
          {t('claim.review.confirmFailed')}
        </p>
      ) : null}

      <p class="text-fluid-sm text-ink-muted">{t('claim.review.iosHint')}</p>

      {shareable ? (
        <div class="flex flex-wrap items-center gap-2">
          <IconButton icon="share" label={t('claim.review.share')} onClick={() => void share()} />
          {sharing === 'copied' ? (
            <p role="status" class="text-fluid-sm text-ink-muted">
              {t('claim.review.copied')}
            </p>
          ) : null}
          {sharing === 'failed' ? (
            <p role="alert" class="text-fluid-sm text-red-600 dark:text-red-400">
              {t('claim.review.shareFailed')}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
