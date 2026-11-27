import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('app-shell.config.gmail-default', () => {
  it('app-shell.config.gmail-default: without VITE_GOOGLE_CLIENT_ID the client id is empty and Gmail is disabled', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '')
    const config = await import('../../src/config')

    expect(config.GOOGLE_CLIENT_ID).toBe('')
    expect(config.gmailEnabled()).toBe(false)
  })

  it('app-shell.config.gmail-default: a build-time VITE_GOOGLE_CLIENT_ID enables Gmail with that id', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'fake-client-id.apps.example')
    const config = await import('../../src/config')

    expect(config.GOOGLE_CLIENT_ID).toBe('fake-client-id.apps.example')
    expect(config.gmailEnabled()).toBe(true)
  })
})
