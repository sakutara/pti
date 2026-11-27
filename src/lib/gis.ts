/** Google Identity Services (token model). The library loads only when the user starts connecting. */

export const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'
export const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
/** The only scopes Gmail sending asks for. Exact string, asserted by tests. */
export const GMAIL_SCOPES = 'openid email https://www.googleapis.com/auth/gmail.send'
const DEFAULT_LIFETIME_S = 3600

export type GisErrorCode = 'offline' | 'load_failed' | 'consent_denied'

export class GisError extends Error {
  readonly code: GisErrorCode
  constructor(code: GisErrorCode) {
    super(`GIS: ${code}`)
    this.name = 'GisError'
    this.code = code
  }
}

interface TokenResponse {
  access_token?: string
  expires_in?: number | string
  error?: string
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void
}

interface GoogleOauth2 {
  initTokenClient(config: {
    client_id: string
    scope: string
    callback: (response: TokenResponse) => void
    error_callback?: (error: { type: string }) => void
  }): TokenClient
}

interface GoogleGlobal {
  accounts?: { oauth2?: GoogleOauth2 }
}

const gisWindow = () => window as unknown as { google?: GoogleGlobal }

function gisOauth2(): GoogleOauth2 | undefined {
  return gisWindow().google?.accounts?.oauth2
}

/** True once the GIS library has run and exposes the token client. */
export function isGisLoaded(): boolean {
  return gisOauth2() !== undefined
}

let pending: Promise<void> | null = null

/**
 * Inserts the GIS script once and resolves when it is ready. Resolves at once if it is already loaded.
 * Offline it inserts nothing and rejects with `offline`.
 */
export function loadGis(): Promise<void> {
  if (isGisLoaded()) return Promise.resolve()
  if (pending) return pending
  if (!navigator.onLine) return Promise.reject(new GisError('offline'))

  pending = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SCRIPT_SRC
    script.async = true
    script.onload = () => {
      pending = null
      resolve()
    }
    script.onerror = () => {
      pending = null
      script.remove()
      reject(new GisError('load_failed'))
    }
    document.head.appendChild(script)
  })
  return pending
}

/**
 * Opens the Google consent window. Must be called synchronously from a click handler: the popup is
 * allowed only inside the user gesture, so requestAccessToken runs before this function returns to
 * its caller. The library must already be loaded (see loadGis).
 */
export function requestToken(clientId: string, scope: string = GMAIL_SCOPES): Promise<{ accessToken: string; expiresAt: number }> {
  return new Promise((resolve, reject) => {
    const oauth2 = gisOauth2()
    if (!oauth2) {
      reject(new GisError('load_failed'))
      return
    }
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new GisError('consent_denied'))
          return
        }
        const lifetime = Number(response.expires_in) || DEFAULT_LIFETIME_S
        resolve({ accessToken: response.access_token, expiresAt: Date.now() + lifetime * 1000 })
      },
      error_callback: () => reject(new GisError('consent_denied')),
    })
    client.requestAccessToken()
  })
}

/** Revokes a token with Google. The token travels in the POST body only. */
export async function revokeToken(token: string): Promise<void> {
  await fetch(REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  })
}
