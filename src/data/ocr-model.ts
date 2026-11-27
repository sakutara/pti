/*
 * Mô hình VietOCR trên máy: tải một lần khi người dùng đồng ý, lưu từng tệp vào Cache Storage `ocr-model` (khoá là URL),
 * và chỉ ghi settings `ocrModelVersion` khi đủ mọi tệp. Tệp đã có trong cache không tải lại nên thử lại chỉ tải phần thiếu.
 * `ocr/` không nằm trong precache; runtimeCaching CacheFirst trong vite.config.ts đọc đúng cache này khi worker tải tệp.
 * Trạng thái là signal để giao diện hiển thị tiến trình. Cài đặt này là dữ liệu riêng của máy (không vào file sao lưu).
 */
import { signal } from '@preact/signals'
import type { AppDB } from '../db/db'
import { db as defaultDb } from '../db/db'

export const OCR_CACHE = 'ocr-model'
export const OCR_MODEL_VERSION = 'vietocr-1'
const VERSION_KEY = 'ocrModelVersion'

/** Tệp mô hình và WASM của VietOCR, đường dẫn tương đối với gốc app; kích thước đúng với public/. LICENSE không tải. */
export const OCR_MODEL_FILES: ReadonlyArray<{ path: string; bytes: number }> = [
  { path: 'ocr/vietocr/det.onnx', bytes: 9929594 },
  { path: 'ocr/vietocr/vietocr_encoder.onnx', bytes: 84317562 },
  { path: 'ocr/vietocr/vietocr_decoder.onnx', bytes: 5140562 },
  { path: 'ocr/vietocr/vietocr.json', bytes: 712 },
  { path: 'ocr/vietocr/ort/ort-wasm-simd-threaded.wasm', bytes: 11133407 },
  { path: 'ocr/vietocr/ort/ort-wasm-simd-threaded.mjs', bytes: 20856 },
]

export const OCR_MODEL_BYTES = OCR_MODEL_FILES.reduce((sum, file) => sum + file.bytes, 0)

/**
 * MIME type stored with a cached file. The worker imports the ONNX Runtime loader as a module, and a module served from
 * the cache without a JavaScript type is refused, so the type comes from the file name, not from the network response.
 */
export function mimeOf(path: string): string {
  if (path.endsWith('.mjs') || path.endsWith('.js')) return 'text/javascript'
  if (path.endsWith('.wasm')) return 'application/wasm'
  if (path.endsWith('.json')) return 'application/json'
  return 'application/octet-stream'
}

export interface OcrModelState {
  state: 'absent' | 'downloading' | 'ready' | 'error'
  loaded: number
  total: number
}

export const ocrModel = signal<OcrModelState>({ state: 'absent', loaded: 0, total: OCR_MODEL_BYTES })

/** URL tuyệt đối của gốc app, cùng cách với ocr-engine (BASE_URL của Vite). */
function appBaseUrl(): string {
  return new URL(import.meta.env.BASE_URL, document.baseURI).href
}

function modelUrl(path: string): string {
  return new URL(path, appBaseUrl()).href
}

/**
 * Entries are matched ignoring `Vary`: the server sends `Vary: Origin`, and the service worker can store a file from a
 * CORS request (the worker's own import), which then no longer matches a plain lookup and would wrongly mark the model absent.
 */
const MATCH_OPTIONS = { ignoreVary: true } as const

function hasCacheStorage(): boolean {
  return typeof caches !== 'undefined'
}

/** True when every model file is in the cache. */
async function allCached(): Promise<boolean> {
  if (!hasCacheStorage()) return false
  const cache = await caches.open(OCR_CACHE)
  for (const file of OCR_MODEL_FILES) {
    if (!(await cache.match(modelUrl(file.path), MATCH_OPTIONS))) return false
  }
  return true
}

/**
 * Khôi phục trạng thái khi mở app: `ready` chỉ khi settings ghi đúng phiên bản VÀ mọi tệp còn trong cache.
 * Không tự tải. Không đủ thì để `absent` và xoá phiên bản cũ.
 */
export async function initOcrModel(database: AppDB = defaultDb): Promise<void> {
  const row = await database.settings.get(VERSION_KEY)
  if (row?.value === OCR_MODEL_VERSION && (await allCached())) {
    ocrModel.value = { state: 'ready', loaded: OCR_MODEL_BYTES, total: OCR_MODEL_BYTES }
    return
  }
  if (row) await database.settings.delete(VERSION_KEY)
  ocrModel.value = { state: 'absent', loaded: 0, total: OCR_MODEL_BYTES }
}

let inflight: Promise<void> | null = null

/** Đọc toàn bộ thân phản hồi, báo số byte đã nhận qua `onChunk`. */
async function readBody(response: Response, onChunk: (received: number) => void): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.body) return new Uint8Array(await response.arrayBuffer())
  const reader = response.body.getReader()
  const parts: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
    received += value.byteLength
    onChunk(received)
  }
  const out = new Uint8Array(received)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.byteLength
  }
  return out
}

/**
 * Tải các tệp còn thiếu vào cache, báo tiến trình qua signal `ocrModel`. Chỉ khi đủ mọi tệp mới ghi phiên bản và
 * chuyển sang `ready`. Lỗi mạng → `error`; gọi lại sẽ chỉ tải tệp thiếu. Gọi khi đang tải thì trả về lượt đang chạy.
 */
export function downloadOcrModel(database: AppDB = defaultDb): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    let loaded = 0
    ocrModel.value = { state: 'downloading', loaded: 0, total: OCR_MODEL_BYTES }
    try {
      const cache = await caches.open(OCR_CACHE)
      for (const file of OCR_MODEL_FILES) {
        const url = modelUrl(file.path)
        if (await cache.match(url, MATCH_OPTIONS)) {
          loaded += file.bytes
          ocrModel.value = { state: 'downloading', loaded, total: OCR_MODEL_BYTES }
          continue
        }
        const response = await fetch(url)
        if (!response.ok) throw new Error(`HTTP ${response.status} khi tải ${file.path}`)
        const base = loaded
        const bytes = await readBody(response, (received) => {
          ocrModel.value = { state: 'downloading', loaded: base + received, total: OCR_MODEL_BYTES }
        })
        await cache.put(url, new Response(bytes, { headers: { 'Content-Type': mimeOf(file.path) } }))
        loaded += file.bytes
        ocrModel.value = { state: 'downloading', loaded, total: OCR_MODEL_BYTES }
      }
      await database.settings.put({ key: VERSION_KEY, value: OCR_MODEL_VERSION, updatedAt: Date.now() })
      ocrModel.value = { state: 'ready', loaded: OCR_MODEL_BYTES, total: OCR_MODEL_BYTES }
    } catch (err) {
      ocrModel.value = { state: 'error', loaded, total: OCR_MODEL_BYTES }
      throw err
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/** Xoá mô hình khỏi máy: cache, phiên bản và trạng thái. */
export async function removeOcrModel(database: AppDB = defaultDb): Promise<void> {
  if (hasCacheStorage()) await caches.delete(OCR_CACHE)
  await database.settings.delete(VERSION_KEY)
  ocrModel.value = { state: 'absent', loaded: 0, total: OCR_MODEL_BYTES }
}
