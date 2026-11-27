import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

type GisModule = typeof import('../../src/lib/gis')

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const TOKEN = 'ya29.FAKE-GIS-TOKEN'

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
}

interface FakeTokenConfig {
  client_id: string
  scope: string
  callback: (r: { access_token?: string; expires_in?: number | string; error?: string }) => void
  error_callback?: (e: { type: string }) => void
}

/** Installs a fake google.accounts.oauth2. `onRequest` decides how the consent window answers. */
function installFakeGoogle(onRequest: (cfg: FakeTokenConfig) => void = (cfg) => cfg.callback({ access_token: TOKEN, expires_in: 3600 })) {
  const initTokenClient = vi.fn((cfg: FakeTokenConfig) => ({
    requestAccessToken: vi.fn(() => onRequest(cfg)),
  }))
  const revoke = vi.fn((_token: string, done: () => void) => done())
  ;(window as unknown as { google: unknown }).google = { accounts: { oauth2: { initTokenClient, revoke } } }
  return { initTokenClient }
}

function gisScripts(): HTMLScriptElement[] {
  return [...document.querySelectorAll<HTMLScriptElement>(`script[src="${GIS_SRC}"]`)]
}

let gis: GisModule

beforeEach(async () => {
  vi.resetModules()
  delete (window as unknown as { google?: unknown }).google
  for (const s of gisScripts()) s.remove()
  setNavigatorOnline(true)
  gis = await import('../../src/lib/gis')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  setNavigatorOnline(true)
})

describe('gmail-connection.scopes.exact', () => {
  it('gmail-connection.scopes.exact: the scope constant is exactly the send-only set', () => {
    expect(gis.GMAIL_SCOPES).toBe('openid email https://www.googleapis.com/auth/gmail.send')
  })

  it('gmail-connection.scopes.exact: the token request carries exactly that scope string', async () => {
    const { initTokenClient } = installFakeGoogle()
    await gis.requestToken('test-client-id')
    expect(initTokenClient).toHaveBeenCalledTimes(1)
    const cfg = initTokenClient.mock.calls[0][0] as FakeTokenConfig
    expect(cfg.scope).toBe('openid email https://www.googleapis.com/auth/gmail.send')
    expect(cfg.client_id).toBe('test-client-id')
  })
})

describe('gmail-connection.connect', () => {
  it('gmail-connection.connect.offline: loadGis rejects offline and inserts no script', async () => {
    setNavigatorOnline(false)
    await expect(gis.loadGis()).rejects.toMatchObject({ code: 'offline' })
    expect(gisScripts()).toHaveLength(0)
  })

  it('gmail-connection.connect.success: loadGis inserts the GIS script once and resolves on load', async () => {
    const first = gis.loadGis()
    const second = gis.loadGis()
    const scripts = gisScripts()
    expect(scripts).toHaveLength(1)
    installFakeGoogle()
    scripts[0].dispatchEvent(new Event('load'))
    await Promise.all([first, second])
    expect(gisScripts()).toHaveLength(1)
  })

  it('gmail-connection.connect.success: loadGis resolves at once without a script when GIS is already present', async () => {
    installFakeGoogle()
    await expect(gis.loadGis()).resolves.toBeUndefined()
    expect(gisScripts()).toHaveLength(0)
  })

  it('gmail-connection.connect.success: loadGis can retry after a failed script load', async () => {
    const failing = gis.loadGis()
    gisScripts()[0].dispatchEvent(new Event('error'))
    await expect(failing).rejects.toMatchObject({ code: 'load_failed' })

    const retry = gis.loadGis()
    expect(gisScripts()).toHaveLength(1)
    installFakeGoogle()
    gisScripts()[0].dispatchEvent(new Event('load'))
    await expect(retry).resolves.toBeUndefined()
  })

  it('gmail-connection.connect.success: requestToken calls requestAccessToken synchronously, inside the click', () => {
    const { initTokenClient } = installFakeGoogle(() => undefined)
    void gis.requestToken('test-client-id')
    const tokenClient = initTokenClient.mock.results[0].value as { requestAccessToken: ReturnType<typeof vi.fn> }
    expect(tokenClient.requestAccessToken).toHaveBeenCalledTimes(1)
  })

  it('gmail-connection.connect.success: requestToken resolves the token and its expiry time', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    installFakeGoogle((cfg) => cfg.callback({ access_token: TOKEN, expires_in: '3599' }))
    await expect(gis.requestToken('test-client-id')).resolves.toEqual({
      accessToken: TOKEN,
      expiresAt: 1_000_000 + 3599 * 1000,
    })
  })

  it('gmail-connection.connect.denied: an access_denied answer rejects with consent_denied', async () => {
    installFakeGoogle((cfg) => cfg.callback({ error: 'access_denied' }))
    await expect(gis.requestToken('test-client-id')).rejects.toMatchObject({ code: 'consent_denied' })
  })

  it('gmail-connection.connect.denied: closing the consent window rejects with consent_denied', async () => {
    installFakeGoogle((cfg) => cfg.error_callback?.({ type: 'popup_closed' }))
    await expect(gis.requestToken('test-client-id')).rejects.toMatchObject({ code: 'consent_denied' })
  })
})

describe('gmail-connection.disconnect.revoke', () => {
  it('gmail-connection.disconnect.revoke: revokeToken posts the token to the Google revoke endpoint', async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchFn)

    await gis.revokeToken(TOKEN)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://oauth2.googleapis.com/revoke')
    expect(init.method).toBe('POST')
    expect(String(init.body)).toBe(`token=${TOKEN}`)
  })
})
