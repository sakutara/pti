// Client for the public PTI codebook API. Node standard library only.
// Every request goes through one throttled client: sequential, and at least `delayMs` after the
// previous request started. `fetchImpl` and `sleep` are injected so tests never touch the network.

export const BASE_URL = 'https://www.pti.com.vn/dms-gw/pms-api/public/codebook'
export const SEARCH_PATH = '/pti/medical-facility/search'
export const PROVINCE_PATH = '/query'
export const PTI_USER_AGENT = 'pti-claim-data-refresh (+https://pti.fiddle.vn)'

const MAX_RETRIES = 2
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Returns the result array of a page: `data`, or `content` when `data` is absent. */
function resultArray(json) {
  if (json && typeof json === 'object') {
    if (Array.isArray(json.data)) return json.data
    if (Array.isArray(json.content)) return json.content
  }
  throw new Error('PTI API response has no "data" or "content" array')
}

/**
 * Creates a throttled client. Each `request` waits `delayMs` before starting unless it is the first
 * request, and retries network errors and 5xx responses up to twice (each retry also waits `delayMs`).
 */
export function createPtiClient(fetchImpl, { delayMs = 500, sleep = defaultSleep } = {}) {
  let started = false

  async function request(url) {
    let lastError
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      if (started) await sleep(delayMs)
      started = true
      let response
      try {
        response = await fetchImpl(url, { headers: { 'User-Agent': PTI_USER_AGENT, Accept: 'application/json' } })
      } catch (error) {
        lastError = new Error(`PTI API network error: ${error instanceof Error ? error.message : String(error)}`)
        continue
      }
      if (response.status >= 500) {
        lastError = new Error(`PTI API HTTP ${response.status}`)
        continue
      }
      if (!response.ok) throw new Error(`PTI API HTTP ${response.status}`)
      try {
        return await response.json()
      } catch {
        throw new Error('PTI API response is not JSON')
      }
    }
    throw lastError
  }

  /**
   * Fetches every page of `path`. Pages are numbered from 1 (`pageParam`), `pageSize` goes to `sizeParam`.
   * Returns the concatenated result arrays in page order.
   */
  async function fetchAll(path, params, { pageSize = 100, pageParam = 'pageIndex', sizeParam = 'pageSize' } = {}) {
    const items = []
    let totalPages = 1
    for (let page = 1; page <= totalPages; page += 1) {
      const url = new URL(BASE_URL + path)
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value))
      url.searchParams.set(pageParam, String(page))
      url.searchParams.set(sizeParam, String(pageSize))
      const json = await request(url.toString())
      items.push(...resultArray(json))
      // The real API reports totalPages 0 for an empty result.
      if (!Number.isInteger(json.totalPages) || json.totalPages < 0) {
        throw new Error('PTI API response has no valid "totalPages"')
      }
      totalPages = json.totalPages
    }
    return items
  }

  /** Fetches the active province codebook as `{ code, name }[]`. */
  async function provinces() {
    const rows = await fetchAll(
      PROVINCE_PATH,
      { subDomainCode: 'PLC065', status: 'ACTIVE' },
      { pageSize: 200, pageParam: 'page', sizeParam: 'size' },
    )
    return rows.map((row) => {
      if (typeof row?.code !== 'string' || typeof row?.name !== 'string') {
        throw new Error('PTI province codebook row has no string "code" and "name"')
      }
      return { code: row.code, name: row.name }
    })
  }

  /** Fetches every page of the medical-facility search for `params`. */
  function search(params) {
    return fetchAll(SEARCH_PATH, params)
  }

  return { request, fetchAll, provinces, search }
}

/** Fetches every page of a PTI medical-facility search. */
export function fetchAllPages(fetchImpl, params, options = {}) {
  const { path = SEARCH_PATH, ...rest } = options
  return createPtiClient(fetchImpl, rest).fetchAll(path, params, rest)
}

/** Fetches the active province codebook as `{ code, name }[]`. */
export function fetchProvinces(fetchImpl, options = {}) {
  return createPtiClient(fetchImpl, options).provinces()
}
