import { describe, expect, it } from 'vitest'
import { fetchAllPages, PTI_USER_AGENT, SEARCH_PATH } from '../../scripts/lib/pti-api.mjs'

// Unit tests never touch the network: fetch and sleep are injected.
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function pageBody(pageIndex: number, totalPages: number, items: string[]) {
  return {
    data: items.map((name) => ({ name, address: `${name} address` })),
    pageIndex,
    pageSize: 100,
    totalElements: 0,
    totalPages,
  }
}

/** Records the start time order of every request and every sleep, and tracks overlap. */
function recorder(pages: Record<number, unknown>) {
  const events: string[] = []
  const sleeps: number[] = []
  const urls: string[] = []
  let inFlight = 0
  let maxInFlight = 0
  const fetchImpl: FetchLike = async (url) => {
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    events.push('request')
    urls.push(url)
    await Promise.resolve()
    inFlight -= 1
    const pageIndex = Number(new URL(url).searchParams.get('pageIndex'))
    return jsonResponse(pages[pageIndex])
  }
  const sleep = async (ms: number) => {
    events.push('sleep')
    sleeps.push(ms)
  }
  return { fetchImpl, sleep, events, sleeps, urls, maxInFlight: () => maxInFlight }
}

describe('data-refresh.fetch', () => {
  it('data-refresh.fetch.all-pages: requests pages 1 to 4 and returns every facility', async () => {
    const rec = recorder({
      1: pageBody(1, 4, ['A1', 'A2']),
      2: pageBody(2, 4, ['B1']),
      3: pageBody(3, 4, ['C1', 'C2', 'C3']),
      4: pageBody(4, 4, ['D1']),
    })

    const items = await fetchAllPages(
      rec.fetchImpl,
      { isPtiGuarantee: 'NVCN031.1', blacklist: 'PLC040.0' },
      { pageSize: 100, delayMs: 500, sleep: rec.sleep },
    )

    expect(items.map((i: { name: string }) => i.name)).toEqual(['A1', 'A2', 'B1', 'C1', 'C2', 'C3', 'D1'])
    expect(rec.urls).toHaveLength(4)
    const pageIndexes = rec.urls.map((u) => new URL(u).searchParams.get('pageIndex'))
    expect(pageIndexes).toEqual(['1', '2', '3', '4'])
    for (const url of rec.urls) {
      const u = new URL(url)
      expect(u.pathname.endsWith(SEARCH_PATH)).toBe(true)
      expect(u.searchParams.get('pageSize')).toBe('100')
      expect(u.searchParams.get('isPtiGuarantee')).toBe('NVCN031.1')
      expect(u.searchParams.get('blacklist')).toBe('PLC040.0')
    }
  })

  it('data-refresh.fetch.all-pages: sends the fixed User-Agent header on every request', async () => {
    const seen: Array<string | null> = []
    const fetchImpl: FetchLike = async (_url, init) => {
      seen.push(new Headers(init?.headers).get('User-Agent'))
      return jsonResponse(pageBody(1, 1, ['A']))
    }

    await fetchAllPages(fetchImpl, {}, { pageSize: 100, delayMs: 500, sleep: async () => {} })

    expect(seen).toEqual([PTI_USER_AGENT])
    expect(PTI_USER_AGENT).toBe('pti-claim-data-refresh (+https://pti.fiddle.vn)')
  })

  it('data-refresh.fetch.throttle: sleeps at least 500 ms between consecutive requests and never overlaps them', async () => {
    const rec = recorder({
      1: pageBody(1, 3, ['A']),
      2: pageBody(2, 3, ['B']),
      3: pageBody(3, 3, ['C']),
    })

    await fetchAllPages(rec.fetchImpl, {}, { pageSize: 100, delayMs: 500, sleep: rec.sleep })

    expect(rec.urls).toHaveLength(3)
    // One sleep before each request except the first: 2 sleeps for 3 requests.
    expect(rec.sleeps).toEqual([500, 500])
    // Order is request, sleep, request, sleep, request: no two requests are adjacent without a sleep.
    expect(rec.events).toEqual(['request', 'sleep', 'request', 'sleep', 'request'])
    expect(rec.maxInFlight()).toBe(1)
  })

  it('data-refresh.fetch.all-pages: an empty result (totalPages 0) returns no facilities and makes one request', async () => {
    const rec = recorder({ 1: { data: [], pageIndex: 1, pageSize: 100, totalElements: 0, totalPages: 0 } })

    const items = await fetchAllPages(rec.fetchImpl, { province: '99' }, { pageSize: 100, delayMs: 500, sleep: rec.sleep })

    expect(items).toEqual([])
    expect(rec.urls).toHaveLength(1)
  })

  it('data-refresh.fetch.all-pages: retries a 5xx response twice and then fails', async () => {
    let calls = 0
    const fetchImpl: FetchLike = async () => {
      calls += 1
      return jsonResponse({ message: 'boom' }, 503)
    }

    await expect(
      fetchAllPages(fetchImpl, {}, { pageSize: 100, delayMs: 500, sleep: async () => {} }),
    ).rejects.toThrow(/503/)
    expect(calls).toBe(3)
  })
})

describe('data-refresh.safety.shape (client)', () => {
  it('data-refresh.safety.shape: accepts content as the result array when data is absent', async () => {
    const fetchImpl: FetchLike = async () =>
      jsonResponse({ content: [{ name: 'X' }], pageIndex: 1, pageSize: 100, totalElements: 1, totalPages: 1 })

    const items = await fetchAllPages(fetchImpl, {}, { pageSize: 100, delayMs: 500, sleep: async () => {} })

    expect(items).toEqual([{ name: 'X' }])
  })

  it('data-refresh.safety.shape: a response without a data or content array throws naming the missing field', async () => {
    const fetchImpl: FetchLike = async () => jsonResponse({ pageIndex: 1, totalPages: 1, items: [] })

    await expect(
      fetchAllPages(fetchImpl, {}, { pageSize: 100, delayMs: 500, sleep: async () => {} }),
    ).rejects.toThrow(/data.*content|content.*data/)
  })

  it('data-refresh.safety.shape: a response without totalPages throws naming totalPages', async () => {
    const fetchImpl: FetchLike = async () => jsonResponse({ data: [{ name: 'A' }], pageIndex: 1 })

    await expect(
      fetchAllPages(fetchImpl, {}, { pageSize: 100, delayMs: 500, sleep: async () => {} }),
    ).rejects.toThrow(/totalPages/)
  })

  it('data-refresh.safety.shape: a non-JSON body throws instead of returning partial data', async () => {
    const fetchImpl: FetchLike = async () => new Response('<html>', { status: 200 })

    await expect(
      fetchAllPages(fetchImpl, {}, { pageSize: 100, delayMs: 500, sleep: async () => {} }),
    ).rejects.toThrow(/JSON/)
  })
})
