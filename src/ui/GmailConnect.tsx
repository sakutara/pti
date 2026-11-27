import { useEffect, useState } from 'preact/hooks'
import { gmailEnabled } from '../config'
import { connect, disconnect, gmailSession, GmailSessionError } from '../data/gmail-session'
import { t } from '../i18n'
import { GisError, loadGis } from '../lib/gis'
import { IconButton } from './IconButton'

/** After the explanation has been shown once in this page session, taps on connect go straight to consent. */
let explained = false

/** Forgets that the explanation was shown, so the next first tap shows it again. Used when a session ends and by tests. */
export function forgetExplanation(): void {
  explained = false
}

type Failure = 'denied' | 'offline' | 'failed'

const FAILURE_TEXT: Record<Failure, string> = {
  denied: 'gmail.connect.denied',
  offline: 'gmail.connect.offline',
  failed: 'gmail.connect.failed',
}

function failureOf(error: unknown): Failure {
  if (error instanceof GisError) {
    if (error.code === 'consent_denied') return 'denied'
    if (error.code === 'offline') return 'offline'
    return 'failed'
  }
  if (error instanceof GmailSessionError && error.code === 'offline') return 'offline'
  return 'failed'
}

/**
 * Gmail connection for the claim settings and the send step. Hidden when no client ID is configured. The first tap
 * shows what the permission allows and links to the privacy page; the Google consent window opens only from the
 * "Tiếp tục" tap, and the GIS library is loaded only once that explanation is on screen.
 */
export function GmailConnect() {
  const session = gmailSession.value
  const [explain, setExplain] = useState(false)
  const [gisReady, setGisReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)

  useEffect(() => {
    if (!explain) return
    let alive = true
    loadGis().then(
      () => {
        if (alive) setGisReady(true)
      },
      (error: unknown) => {
        if (alive) {
          setExplain(false)
          setFailure(failureOf(error))
        }
      },
    )
    return () => {
      alive = false
    }
  }, [explain])

  if (!gmailEnabled()) return null

  /** Called straight from a tap: connect() reaches the consent request before its first await when GIS is loaded. */
  function startConnect() {
    setBusy(true)
    connect().then(
      () => {
        setExplain(false)
        setFailure(null)
      },
      (error: unknown) => {
        setExplain(false)
        setFailure(failureOf(error))
      },
    ).finally(() => setBusy(false))
  }

  function onConnectTap() {
    setFailure(null)
    if (!navigator.onLine) {
      setFailure('offline')
      return
    }
    if (explained) {
      startConnect()
      return
    }
    setExplain(true)
  }

  function onContinue() {
    explained = true
    startConnect()
  }

  const heading = (
    <h3 id="gmail-connect-heading" class="text-fluid-base font-semibold text-ink">
      {t('gmail.connect.title')}
    </h3>
  )

  if (session.status === 'connected') {
    return (
      <section aria-labelledby="gmail-connect-heading" class="grid gap-3">
        {heading}
        <p role="status" class="text-fluid-sm text-ink">
          {t('gmail.connect.connected', { email: session.email })}
        </p>
        <IconButton icon="plug-off" label={t('gmail.connect.disconnect')} showLabel onClick={() => void disconnect()} />
      </section>
    )
  }

  return (
    <section aria-labelledby="gmail-connect-heading" class="grid gap-3">
      {heading}
      {explain ? (
        <div class="grid gap-3">
          <p class="text-fluid-sm text-ink">{t('gmail.connect.explain')}</p>
          <a
            href="/privacy/"
            class="inline-flex min-h-11 items-center text-fluid-sm font-medium text-accent underline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {t('gmail.connect.privacy')}
          </a>
          <IconButton
            icon="gmail-connect"
            label={t('gmail.connect.continue')}
            showLabel
            variant="primary"
            disabled={!gisReady || busy}
            onClick={onContinue}
          />
        </div>
      ) : (
        <IconButton icon="gmail-connect" label={t('gmail.connect.title')} showLabel onClick={onConnectTap} disabled={busy} />
      )}
      {failure === null ? (
        <p class="text-fluid-sm text-ink-muted">{t('gmail.connect.notConnected')}</p>
      ) : (
        <p role="alert" class="text-fluid-sm text-red-600 dark:text-red-400">
          {t(FAILURE_TEXT[failure])}
        </p>
      )}
    </section>
  )
}
