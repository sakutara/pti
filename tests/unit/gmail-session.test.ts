import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Blob as NodeBlob } from 'node:buffer'
import { unzipSync, strFromU8 } from 'fflate'
import type { AppDB } from '../../src/db/db'

const cfg = vi.hoisted(() => ({ GOOGLE_CLIENT_ID: 'test-client-id.apps.example' }))

vi.mock('../../src/config', () => ({
  get GOOGLE_CLIENT_ID() {
    return cfg.GOOGLE_CLIENT_ID
  },
  gmailEnabled: () => cfg.GOOGLE_CLIENT_ID !== '',
}))

const TOKEN = 'ya29.FAKE-SESSION-TOKEN-XYZ'
const EMAIL = 'member@example.com'
const GIS_SRC = 'https://accounts.google.com/gsi/client'

type SessionModule = typeof import('../../src/data/gmail-session')

interface FakeTokenConfig {
  scope: string
  callback: (r: { access_token?: string; expires_in?: number; error?: string }) => void
  error_callback?: (e: { type: string }) => void
}

let session: SessionModule
let requestAccessToken: ReturnType<typeof vi.fn>
let initTokenClient: ReturnType<typeof vi.fn>
let fetchFn: ReturnType<typeof vi.fn>

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
}

/** Fake GIS: the consent window answers asynchronously with `answer`. */
function installFakeGoogle(answer: (cfg: FakeTokenConfig) => void = (cfg) => cfg.callback({ access_token: TOKEN, expires_in: 3600 })) {
  requestAccessToken = vi.fn(() => queueMicrotask(() => answer(lastConfig)))
  let lastConfig: FakeTokenConfig = { scope: '', callback: () => undefined }
  initTokenClient = vi.fn((c: FakeTokenConfig) => {
    lastConfig = c
    return { requestAccessToken }
  })
  const revoke = vi.fn((_t: string, done: () => void) => done())
  ;(window as unknown as { google: unknown }).google = { accounts: { oauth2: { initTokenClient, revoke } } }
}

function installFetch() {
  fetchFn = vi.fn(async (url: string) => {
    if (url.startsWith('https://www.googleapis.com/oauth2/v3/userinfo')) {
      return new Response(JSON.stringify({ email: EMAIL }), { status: 200 })
    }
    return new Response(null, { status: 200 })
  })
  vi.stubGlobal('fetch', fetchFn)
}

beforeEach(async () => {
  vi.resetModules()
  cfg.GOOGLE_CLIENT_ID = 'test-client-id.apps.example'
  delete (window as unknown as { google?: unknown }).google
  for (const s of document.querySelectorAll(`script[src="${GIS_SRC}"]`)) s.remove()
  localStorage.clear()
  sessionStorage.clear()
  setNavigatorOnline(true)
  installFakeGoogle()
  installFetch()
  session = await import('../../src/data/gmail-session')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  setNavigatorOnline(true)
})

describe('gmail-connection.connect.success', () => {
  it('gmail-connection.connect.success: after a grant the connected address is shown and a token is available', async () => {
    await session.connect()
    expect(session.gmailSession.value).toMatchObject({ status: 'connected', email: EMAIL })
    expect(session.accessToken()).toBe(TOKEN)
  })

  it('gmail-connection.connect.success: looks up the email with the new token on the userinfo endpoint', async () => {
    await session.connect()
    const call = fetchFn.mock.calls.find((c) => String(c[0]).includes('userinfo'))
    expect(call).toBeDefined()
    expect(new Headers((call![1] as RequestInit).headers).get('Authorization')).toBe(`Bearer ${TOKEN}`)
  })

  it('gmail-connection.connect.success: connect opens the consent window synchronously, so it works from a click handler', () => {
    void session.connect()
    expect(requestAccessToken).toHaveBeenCalledTimes(1)
  })

  it('gmail-connection.connect.success: requests exactly the send-only scope set', async () => {
    await session.connect()
    const cfg0 = initTokenClient.mock.calls[0][0] as FakeTokenConfig
    expect(cfg0.scope).toBe('openid email https://www.googleapis.com/auth/gmail.send')
  })
})

describe('gmail-connection.connect.denied', () => {
  it('gmail-connection.connect.denied: a denied consent rejects and leaves the session disconnected', async () => {
    installFakeGoogle((c) => c.callback({ error: 'access_denied' }))
    await expect(session.connect()).rejects.toBeDefined()
    expect(session.gmailSession.value).toEqual({ status: 'disconnected' })
    expect(session.accessToken()).toBeNull()
  })
})

describe('gmail-connection.connect.offline', () => {
  it('gmail-connection.connect.offline: offline connect rejects and opens no window', async () => {
    setNavigatorOnline(false)
    await expect(session.connect()).rejects.toMatchObject({ code: 'offline' })
    expect(requestAccessToken).not.toHaveBeenCalled()
    expect(session.gmailSession.value).toEqual({ status: 'disconnected' })
  })
})

describe('gmail-connection.connect.not-configured', () => {
  it('gmail-connection.connect.not-configured: an empty client ID rejects and opens no window', async () => {
    cfg.GOOGLE_CLIENT_ID = ''
    await expect(session.connect()).rejects.toMatchObject({ code: 'not-configured' })
    expect(requestAccessToken).not.toHaveBeenCalled()
    expect(session.gmailSession.value).toEqual({ status: 'disconnected' })
  })

  it('gmail-connection.connect.not-configured: the committed src/config.ts ships an empty client ID with Gmail disabled', async () => {
    const real = await vi.importActual<typeof import('../../src/config')>('../../src/config')
    expect(real.GOOGLE_CLIENT_ID).toBe('')
    expect(real.gmailEnabled()).toBe(false)
  })
})

describe('gmail-connection.token.memory-only', () => {
  it('gmail-connection.token.memory-only: nothing is written to local or session storage after connecting', async () => {
    await session.connect()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('gmail-connection.token.memory-only: after a reload the app shows disconnected', async () => {
    await session.connect()
    vi.resetModules()
    const reloaded = (await import('../../src/data/gmail-session')) as SessionModule
    expect(reloaded.gmailSession.value).toEqual({ status: 'disconnected' })
    expect(reloaded.accessToken()).toBeNull()
  })

  it('gmail-connection.token.memory-only: the token expires with its lifetime', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    await session.connect()
    expect(session.accessToken()).toBe(TOKEN)
    now.mockReturnValue(1_000_000 + 3600 * 1000)
    expect(session.accessToken()).toBeNull()
  })
})

describe('gmail-connection.token.not-persisted', () => {
  it('gmail-connection.token.not-persisted: the token string appears in no backup entry or browser storage', async () => {
    vi.stubGlobal('Blob', NodeBlob)
    const { AppDB: Db } = await import('../../src/db/db')
    const { exportBackup } = await import('../../src/data/backup')
    const db: AppDB = new Db('t-' + crypto.randomUUID())
    try {
      await session.connect()
      const { blob } = await exportBackup(db)
      const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()))
      for (const [name, bytes] of Object.entries(entries)) {
        expect(strFromU8(bytes), name).not.toContain(TOKEN)
      }
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!
        expect(k + localStorage.getItem(k)).not.toContain(TOKEN)
      }
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i)!
        expect(k + sessionStorage.getItem(k)).not.toContain(TOKEN)
      }
    } finally {
      db.close()
      vi.unstubAllGlobals()
    }
  })
})

describe('gmail-connection.token.expired', () => {
  it('gmail-connection.token.expired: invalidateToken drops the token and never retries the send in the background', async () => {
    await session.connect()
    const calls = fetchFn.mock.calls.length
    session.invalidateToken()
    expect(session.gmailSession.value).toEqual({ status: 'disconnected' })
    expect(session.accessToken()).toBeNull()
    expect(fetchFn.mock.calls.length).toBe(calls)
    expect(requestAccessToken).toHaveBeenCalledTimes(1)
  })
})

describe('gmail-connection.disconnect.revoke', () => {
  it('gmail-connection.disconnect.revoke: disconnect revokes the token with Google and clears the state', async () => {
    await session.connect()
    await session.disconnect()
    const revokeCall = fetchFn.mock.calls.find((c) => String(c[0]) === 'https://oauth2.googleapis.com/revoke')
    expect(revokeCall).toBeDefined()
    expect(String((revokeCall![1] as RequestInit).body)).toBe(`token=${TOKEN}`)
    expect(session.gmailSession.value).toEqual({ status: 'disconnected' })
    expect(session.accessToken()).toBeNull()
  })

  it('gmail-connection.disconnect.revoke: the state clears even when the revoke call fails offline', async () => {
    await session.connect()
    fetchFn.mockImplementation(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(session.disconnect()).resolves.toBeUndefined()
    expect(session.gmailSession.value).toEqual({ status: 'disconnected' })
  })
})
