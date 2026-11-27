import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadDataset, loadManifest, resetDatasetCache } from '../../src/data/datasets'
import { parseBenefits } from '../../src/domain/benefits-schema'
import fixture from '../fixtures/benefits-2026.json'

// Unit tests never touch the network: fetch is replaced for every test.
const fetchMock = vi.fn()

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  resetDatasetCache()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('benefits.dataset.load', () => {
  it('benefits.dataset.load: returns the parsed dataset for a valid file', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture))

    const result = await loadDataset('benefits/2026.json', parseBenefits)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.policyYear).toBe(2026)
    expect(result.data.tiers).toHaveLength(4)
  })

  it('benefits.dataset.load: requests the file under BASE_URL/data/', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture))

    await loadDataset('benefits/2026.json', parseBenefits)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${import.meta.env.BASE_URL}data/benefits/2026.json`)
  })

  it('benefits.dataset.load: a second call is served from memory without fetching again', async () => {
    fetchMock.mockResolvedValue(jsonResponse(fixture))

    const first = await loadDataset('benefits/2026.json', parseBenefits)
    const second = await loadDataset('benefits/2026.json', parseBenefits)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(second).toEqual(first)
  })

  it('benefits.dataset.load: resetDatasetCache forces the next call to fetch', async () => {
    fetchMock.mockResolvedValue(jsonResponse(fixture))

    await loadDataset('benefits/2026.json', parseBenefits)
    resetDatasetCache()
    await loadDataset('benefits/2026.json', parseBenefits)

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('benefits.dataset.load: loadManifest returns the manifest with its benefits entry', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        schema: 1,
        datasets: {
          benefits: { files: ['benefits/2026.json'], updatedAt: '2026-11-26', version: '2026.1' },
        },
      }),
    )

    const result = await loadManifest()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.datasets.benefits?.files).toEqual(['benefits/2026.json'])
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${import.meta.env.BASE_URL}data/manifest.json`)
  })
})

describe('benefits.dataset.invalid', () => {
  it('benefits.dataset.invalid: returns an error when the parser rejects the data', async () => {
    const broken = structuredClone(fixture) as { copayPercent: { inpatient: { voluntary: number } } }
    broken.copayPercent.inpatient.voluntary = 150
    fetchMock.mockResolvedValueOnce(jsonResponse(broken))

    const result = await loadDataset('benefits/2026.json', parseBenefits)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('copayPercent')
  })

  it('benefits.dataset.invalid: returns an error for a non-OK HTTP response', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not found', { status: 404 }))

    const result = await loadDataset('benefits/2026.json', parseBenefits)

    expect(result.ok).toBe(false)
  })

  it('benefits.dataset.invalid: returns an error when the body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>oops</html>', { status: 200 }))

    const result = await loadDataset('benefits/2026.json', parseBenefits)

    expect(result.ok).toBe(false)
  })

  it('benefits.dataset.invalid: returns an error when the network request fails', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const result = await loadDataset('benefits/2026.json', parseBenefits)

    expect(result.ok).toBe(false)
  })

  it('benefits.dataset.invalid: a failed load is not cached, so the next call fetches again', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture))

    const failed = await loadDataset('benefits/2026.json', parseBenefits)
    const retried = await loadDataset('benefits/2026.json', parseBenefits)

    expect(failed.ok).toBe(false)
    expect(retried.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('benefits.dataset.invalid: loadManifest rejects a manifest with the wrong schema version', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ schema: 99, datasets: {} }))

    const result = await loadManifest()

    expect(result.ok).toBe(false)
  })
})
