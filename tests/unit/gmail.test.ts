import { describe, it, expect, vi, afterEach } from 'vitest'
import { sendMessage, GmailError, TokenExpiredError, GMAIL_MAX_MESSAGE_BYTES } from '../../src/lib/gmail'

const TOKEN = 'ya29.FAKE-TOKEN-FOR-TESTS'
const SEND_URL = 'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media'
const mime = new TextEncoder().encode('From: claimant@example.com\r\nTo: claims@example.org\r\n\r\nhi')

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl)
  vi.stubGlobal('fetch', fn)
  return fn
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('claim-submission.gmail.message', () => {
  it('claim-submission.gmail.message: posts the raw RFC 822 bytes to the media upload endpoint with a Bearer token', async () => {
    const fetchFn = stubFetch(async () => json(200, { id: 'm1', threadId: 't1' }))

    await sendMessage(TOKEN, mime)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(SEND_URL)
    expect(init.method).toBe('POST')
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe(`Bearer ${TOKEN}`)
    expect(headers.get('Content-Type')).toBe('message/rfc822')
    expect(init.body).toEqual(mime)
  })

  it('claim-submission.gmail.message: returns the message id and thread id from the answer', async () => {
    stubFetch(async () => json(200, { id: 'm1', threadId: 't1', labelIds: ['SENT'] }))
    await expect(sendMessage(TOKEN, mime)).resolves.toEqual({ id: 'm1', threadId: 't1' })
  })

  it('claim-submission.gmail.message: rejects a message over the Gmail size limit without calling the API', async () => {
    const fetchFn = stubFetch(async () => json(200, { id: 'm1', threadId: 't1' }))
    const big = new Uint8Array(GMAIL_MAX_MESSAGE_BYTES + 1)
    await expect(sendMessage(TOKEN, big)).rejects.toBeInstanceOf(GmailError)
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('claim-submission.gmail.failure', () => {
  it('claim-submission.gmail.failure: a server error throws GmailError carrying the HTTP status', async () => {
    stubFetch(async () => json(500, { error: { message: 'backend error' } }))
    const err = await sendMessage(TOKEN, mime).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GmailError)
    expect(err).not.toBeInstanceOf(TokenExpiredError)
    expect((err as GmailError).status).toBe(500)
  })

  it('claim-submission.gmail.failure: a 403 is a GmailError, not a token expiry', async () => {
    stubFetch(async () => json(403, { error: { message: 'insufficient permissions' } }))
    const err = await sendMessage(TOKEN, mime).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GmailError)
    expect((err as GmailError).status).toBe(403)
  })

  it('claim-submission.gmail.failure: a network failure throws GmailError with status 0', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    const err = await sendMessage(TOKEN, mime).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GmailError)
    expect((err as GmailError).status).toBe(0)
  })

  it('claim-submission.gmail.failure: an answer without a message id is a GmailError', async () => {
    stubFetch(async () => json(200, {}))
    await expect(sendMessage(TOKEN, mime)).rejects.toBeInstanceOf(GmailError)
  })

  it('claim-submission.gmail.failure: never logs the token', async () => {
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn')]
    stubFetch(async () => json(401, { error: { message: 'Invalid Credentials' } }))
    await sendMessage(TOKEN, mime).catch(() => undefined)
    for (const spy of logs) {
      for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain(TOKEN)
    }
  })
})

describe('gmail-connection.token.expired', () => {
  it('gmail-connection.token.expired: a 401 throws TokenExpiredError', async () => {
    stubFetch(async () => json(401, { error: { message: 'Request had invalid authentication credentials.' } }))
    await expect(sendMessage(TOKEN, mime)).rejects.toBeInstanceOf(TokenExpiredError)
  })

  it('gmail-connection.token.expired: a 401 is not retried silently', async () => {
    const fetchFn = stubFetch(async () => json(401, {}))
    await sendMessage(TOKEN, mime).catch(() => undefined)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})
