import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import Dexie from 'dexie'
import { AppDB } from '../../src/db/db'
import {
  OCR_CACHE,
  OCR_MODEL_BYTES,
  OCR_MODEL_FILES,
  OCR_MODEL_VERSION,
  downloadOcrModel,
  initOcrModel,
  ocrModel,
  removeOcrModel,
} from '../../src/data/ocr-model'

const root = resolve(__dirname, '../..')
const BASE = 'http://localhost:3000/'
const urlOf = (path: string) => BASE + path

/** In-memory Cache Storage: enough of the API for the model store. */
class FakeCache {
  readonly entries = new Map<string, Response>()
  /**
   * An entry whose response carries `Vary` (the dev server sends `Vary: Origin`) is not matched by a plain lookup, as in
   * Chromium once the service worker has stored it from a CORS request; `ignoreVary` matches it anyway.
   */
  async match(url: string, options?: { ignoreVary?: boolean }): Promise<Response | undefined> {
    const hit = this.entries.get(url)
    if (!hit || (hit.headers.has('vary') && !options?.ignoreVary)) return undefined
    return hit.clone()
  }
  async put(url: string, response: Response): Promise<void> {
    this.entries.set(url, response)
  }
}

class FakeCacheStorage {
  readonly stores = new Map<string, FakeCache>()
  async open(name: string): Promise<FakeCache> {
    let cache = this.stores.get(name)
    if (!cache) {
      cache = new FakeCache()
      this.stores.set(name, cache)
    }
    return cache
  }
  async delete(name: string): Promise<boolean> {
    return this.stores.delete(name)
  }
}

let caches: FakeCacheStorage
let fetchMock: ReturnType<typeof vi.fn>
/** Paths whose next fetch fails (simulates a dropped connection). */
let failing: Set<string>
const opened: AppDB[] = []
const names: string[] = []

function freshDb(): AppDB {
  const name = 'm-' + crypto.randomUUID()
  names.push(name)
  const db = new AppDB(name)
  opened.push(db)
  return db
}

beforeEach(() => {
  caches = new FakeCacheStorage()
  failing = new Set()
  vi.stubGlobal('caches', caches)
  fetchMock = vi.fn(async (input: string) => {
    const file = OCR_MODEL_FILES.find((f) => input === urlOf(f.path))
    if (!file) return new Response(null, { status: 404 })
    if (failing.has(file.path)) throw new TypeError('network down')
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  ocrModel.value = { state: 'absent', loaded: 0, total: OCR_MODEL_BYTES }
})

afterEach(async () => {
  for (const db of opened.splice(0)) db.close()
  for (const name of names.splice(0)) await Dexie.delete(name)
  vi.unstubAllGlobals()
})

afterAll(() => vi.unstubAllGlobals())

describe('document-ocr.model.consent: the model file list', () => {
  it('document-ocr.model.consent: every listed file has its real size on disk, and the LICENSE is not downloaded', () => {
    for (const file of OCR_MODEL_FILES) {
      const onDisk = statSync(join(root, 'public', file.path)).size
      expect(file.bytes, file.path).toBe(onDisk)
    }
    expect(OCR_MODEL_FILES.map((f) => f.path)).not.toContain('ocr/vietocr/LICENSE-vietocr-onnx.txt')
    expect(OCR_MODEL_FILES.map((f) => f.path)).toEqual(
      expect.arrayContaining([
        'ocr/vietocr/ort/ort-wasm-simd-threaded.wasm',
        'ocr/vietocr/ort/ort-wasm-simd-threaded.mjs',
        'ocr/vietocr/vietocr.json',
      ]),
    )
    expect(OCR_MODEL_BYTES).toBe(OCR_MODEL_FILES.reduce((sum, f) => sum + f.bytes, 0))
  })

  it('document-ocr.model.consent: init alone downloads nothing and leaves the model absent', async () => {
    const database = freshDb()
    await initOcrModel(database)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(ocrModel.value.state).toBe('absent')
  })
})

describe('document-ocr.model.progress: download', () => {
  it('document-ocr.model.progress: reports loaded and total bytes and is ready only when every file is stored', async () => {
    const database = freshDb()
    const seen: Array<{ state: string; loaded: number; hasVersion: boolean }> = []
    fetchMock.mockImplementation(async (input: string) => {
      seen.push({ state: ocrModel.value.state, loaded: ocrModel.value.loaded, hasVersion: (await database.settings.get('ocrModelVersion')) !== undefined })
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 })
    })

    await downloadOcrModel(database)

    // While file k is being fetched, the bytes of files 0..k-1 are counted and no version is stored yet.
    let expected = 0
    seen.forEach((snapshot, k) => {
      expect(snapshot).toEqual({ state: 'downloading', loaded: expected, hasVersion: false })
      expected += OCR_MODEL_FILES[k].bytes
    })
    expect(ocrModel.value).toEqual({ state: 'ready', loaded: OCR_MODEL_BYTES, total: OCR_MODEL_BYTES })
    expect((await database.settings.get('ocrModelVersion'))?.value).toBe(OCR_MODEL_VERSION)
    expect((await caches.open(OCR_CACHE)).entries.size).toBe(OCR_MODEL_FILES.length)
  })
})

describe('document-ocr.model.failure: retry after a dropped connection', () => {
  it('document-ocr.model.failure: a dropped file leaves the model in error with no version, keeps stored files, and retry fetches only the missing ones', async () => {
    const database = freshDb()
    const third = OCR_MODEL_FILES[2].path
    failing.add(third)

    await expect(downloadOcrModel(database)).rejects.toThrow()
    expect(ocrModel.value.state).toBe('error')
    expect(await database.settings.get('ocrModelVersion')).toBeUndefined()
    expect((await caches.open(OCR_CACHE)).entries.size).toBe(2)

    failing.clear()
    fetchMock.mockClear()
    await downloadOcrModel(database)

    const fetched = fetchMock.mock.calls.map((call) => call[0])
    expect(fetched).toEqual(OCR_MODEL_FILES.slice(2).map((f) => urlOf(f.path)))
    expect(ocrModel.value.state).toBe('ready')
    expect((await database.settings.get('ocrModelVersion'))?.value).toBe(OCR_MODEL_VERSION)
  })

  it('document-ocr.model.failure: a file already in the cache is not fetched again', async () => {
    const database = freshDb()
    await downloadOcrModel(database)
    fetchMock.mockClear()
    await downloadOcrModel(database)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(ocrModel.value.state).toBe('ready')
  })
})

describe('document-ocr.model.offline-ready: restore and remove', () => {
  it('document-ocr.model.offline-ready: after a download, init restores ready from settings and the cache entries', async () => {
    const database = freshDb()
    await downloadOcrModel(database)
    ocrModel.value = { state: 'absent', loaded: 0, total: OCR_MODEL_BYTES }
    fetchMock.mockClear()

    await initOcrModel(database)

    expect(ocrModel.value.state).toBe('ready')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('document-ocr.model.offline-ready: a version without the cached files is not ready and the stale version is dropped', async () => {
    const database = freshDb()
    await database.settings.put({ key: 'ocrModelVersion', value: OCR_MODEL_VERSION, updatedAt: 1 })

    await initOcrModel(database)

    expect(ocrModel.value.state).toBe('absent')
    expect(await database.settings.get('ocrModelVersion')).toBeUndefined()
  })

  it('document-ocr.model.offline-ready: the worker reads every model file from the cache, so no network request is needed', async () => {
    const database = freshDb()
    await downloadOcrModel(database)
    const cache = await caches.open(OCR_CACHE)
    for (const file of OCR_MODEL_FILES) expect(await cache.match(urlOf(file.path))).toBeDefined()
  })

  it('document-ocr.model.progress: remove clears the cache and the version and the state goes absent', async () => {
    const database = freshDb()
    await downloadOcrModel(database)

    await removeOcrModel(database)

    expect(ocrModel.value.state).toBe('absent')
    expect(caches.stores.has(OCR_CACHE)).toBe(false)
    expect(await database.settings.get('ocrModelVersion')).toBeUndefined()
  })
})

describe('document-ocr.model.offline-ready: cached files keep their MIME type', () => {
  it('document-ocr.model.offline-ready: the cached ONNX Runtime module is served as JavaScript and the wasm as application/wasm', async () => {
    const db = freshDb()
    await downloadOcrModel(db)

    const cache = await caches.open(OCR_CACHE)
    const mjs = await cache.match(urlOf('ocr/vietocr/ort/ort-wasm-simd-threaded.mjs'))
    const wasm = await cache.match(urlOf('ocr/vietocr/ort/ort-wasm-simd-threaded.wasm'))
    expect(mjs?.headers.get('content-type')).toBe('text/javascript')
    expect(wasm?.headers.get('content-type')).toBe('application/wasm')
  })
})

describe('document-ocr.model.offline-ready: entries stored with Vary still count as cached', () => {
  it('document-ocr.model.offline-ready: a model whose files carry Vary: Origin stays ready after a restart', async () => {
    const db = freshDb()
    await downloadOcrModel(db)

    const cache = (await caches.open(OCR_CACHE)) as unknown as FakeCache
    for (const file of OCR_MODEL_FILES) {
      cache.entries.set(
        urlOf(file.path),
        new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'application/octet-stream', Vary: 'Origin' } }),
      )
    }
    ocrModel.value = { state: 'absent', loaded: 0, total: OCR_MODEL_BYTES }

    await initOcrModel(db)
    expect(ocrModel.value.state).toBe('ready')
    expect((await db.settings.get('ocrModelVersion'))?.value).toBe(OCR_MODEL_VERSION)
  })
})
