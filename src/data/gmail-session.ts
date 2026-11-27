import { signal } from '@preact/signals'
import { GOOGLE_CLIENT_ID, gmailEnabled } from '../config'
import { GMAIL_SCOPES, isGisLoaded, loadGis, requestToken, revokeToken } from '../lib/gis'

/**
 * Gmail connection for this page session only. The access token lives in a module variable and is never
 * written to Dexie, storage, the outbox, backups or logs. The signal carries no token, so UI code can
 * show the status and address without seeing the secret.
 */
export type GmailSessionState =
  | { status: 'disconnected' }
  | { status: 'connected'; email: string; expiresAt: number }

export type GmailSessionErrorCode = 'offline' | 'not-configured' | 'userinfo'

export class GmailSessionError extends Error {
  readonly code: GmailSessionErrorCode
  constructor(code: GmailSessionErrorCode) {
    super(`Gmail session: ${code}`)
    this.name = 'GmailSessionError'
    this.code = code
  }
}

const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'

export const gmailSession = signal<GmailSessionState>({ status: 'disconnected' })

let token: string | null = null

/** The token for a send, or null when disconnected or expired. */
export function accessToken(): string | null {
  if (token === null) return null
  const state = gmailSession.value
  if (state.status !== 'connected' || Date.now() >= state.expiresAt) return null
  return token
}

async function fetchEmail(bearer: string): Promise<string> {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${bearer}` } })
  const data = (await res.json().catch(() => null)) as { email?: unknown } | null
  if (!res.ok || typeof data?.email !== 'string') throw new GmailSessionError('userinfo')
  return data.email
}

/**
 * Connects Gmail. Call it directly from the click handler: the consent window opens before the first
 * await when the GIS script is already loaded (preload it with loadGis when the explanation shows).
 * Rejects with GmailSessionError (not-configured, offline, userinfo) or GisError (consent_denied).
 */
export async function connect(): Promise<void> {
  if (!gmailEnabled()) throw new GmailSessionError('not-configured')
  if (!navigator.onLine) throw new GmailSessionError('offline')
  if (!isGisLoaded()) await loadGis()

  const granted = await requestToken(GOOGLE_CLIENT_ID, GMAIL_SCOPES)
  const email = await fetchEmail(granted.accessToken)
  token = granted.accessToken
  gmailSession.value = { status: 'connected', email, expiresAt: granted.expiresAt }
}

/** Forgets the token after Gmail answered 401. The next user tap on connect asks for a new one. */
export function invalidateToken(): void {
  token = null
  gmailSession.value = { status: 'disconnected' }
}

/** Clears the state first, then revokes with Google. A failed revoke (offline) still leaves the app disconnected. */
export async function disconnect(): Promise<void> {
  const old = token
  invalidateToken()
  if (old !== null) await revokeToken(old).catch(() => undefined)
}
