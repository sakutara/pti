/*
 * Hàng đợi đọc hoá đơn: chạy lần lượt các chứng từ hoá đơn `ocrStatus: 'pending'`.
 * - PDF có lớp chữ: đọc từ chữ, không cần mô hình.
 * - PDF chỉ có ảnh: dựng từng trang ở cạnh dài 2400 px rồi OCR; ảnh: cắt (scanReceiptImage) → chuẩn bị (prepareForOcr) → OCR.
 * Chỉ đọc khi mô hình đã sẵn sàng. Lỗi một chứng từ → `failed` và tiếp tục chứng từ sau. Worker OCR được tạo khi cần
 * và terminate khi hàng đợi rỗng. `startOcrQueue` gọi được nhiều lần: lượt đang chạy sẽ quét lại nếu có việc mới.
 */
import { db as defaultDb, type AppDB } from '../db/db'
import { createOcrEngine, type OcrEngine } from '../lib/ocr-engine'
import { hasTextLayer, readPdf, renderPage, type PdfReading } from '../lib/pdf-read'
import { scanReceiptImage } from '../lib/imageScan'
import { prepareForOcr } from '../lib/imagePreprocess'
import { todayIso } from '../lib/dates'
import type { DocumentRecord } from '../domain/document-types'
import { listPendingOcr, markOcrFailed, applyOcrResult, readLines } from './documents-repo'
import { initOcrModel, ocrModel } from './ocr-model'

/** Cạnh dài khi dựng trang PDF chỉ có ảnh để OCR. */
export const PDF_OCR_LONG_EDGE = 2400

export interface OcrQueueDeps {
  db?: AppDB
  createEngine?: () => OcrEngine
  readPdf?: (file: Blob) => Promise<PdfReading>
  renderPage?: (file: Blob, pageNumber: number, longEdge: number) => Promise<Blob>
  /** Cắt và nắn ảnh chụp hoá đơn; `null` thì đọc ảnh đã lưu. */
  scan?: (file: File) => Promise<File | null>
  prepare?: (image: Blob) => Promise<Blob>
  /** Mô hình đã sẵn sàng để OCR. Mặc định: khôi phục từ settings rồi xem trạng thái signal. */
  modelReady?: () => Promise<boolean>
  today?: () => string
}

const defaultModelReady = async (): Promise<boolean> => {
  await initOcrModel()
  return ocrModel.value.state === 'ready'
}

const defaultScan = async (file: File): Promise<File | null> => (await scanReceiptImage(file))?.file ?? null

interface Run {
  database: AppDB
  deps: OcrQueueDeps
  engine: OcrEngine | null
  createEngine: () => OcrEngine
}

function engineOf(run: Run): OcrEngine {
  run.engine ??= run.createEngine()
  return run.engine
}

/** Các dòng chữ của một ảnh đã lưu: cắt rồi chuẩn bị, nếu cắt không được thì dùng ảnh gốc. */
async function imageLines(run: Run, blob: Blob, name: string): Promise<string[]> {
  let source: Blob = blob
  try {
    const scanned = await (run.deps.scan ?? defaultScan)(new File([blob], name, { type: blob.type || 'image/jpeg' }))
    if (scanned) source = scanned
  } catch {
    source = blob
  }
  const prepared = await (run.deps.prepare ?? prepareForOcr)(source)
  return engineOf(run).recognize(prepared)
}

/** Đọc một chứng từ. Khi chưa có mô hình, chứng từ cần OCR giữ nguyên `pending` để đọc sau. */
async function readDocument(run: Run, doc: DocumentRecord, ready: boolean): Promise<void> {
  const files = []
  for (const id of doc.fileIds) {
    const file = await run.database.files.get(id)
    if (file && file.deleted === 0) files.push(file)
  }
  const today = (run.deps.today ?? todayIso)()
  const isPdf = files.length === 1 && files[0].mime === 'application/pdf'

  let lines: string[]
  if (isPdf) {
    const reading = await (run.deps.readPdf ?? readPdf)(files[0].blob)
    if (reading.encrypted) throw new Error('PDF có mật khẩu')
    if (hasTextLayer(reading.textLines)) {
      await applyOcrResult(run.database, doc.id, readLines(reading.textLines, today))
      return
    }
    if (!ready) return
    lines = []
    for (let page = 1; page <= reading.pages; page++) {
      const image = await (run.deps.renderPage ?? renderPage)(files[0].blob, page, PDF_OCR_LONG_EDGE)
      lines.push(...(await engineOf(run).recognize(image)))
    }
  } else {
    if (!ready) return
    lines = []
    for (const file of files) lines.push(...(await imageLines(run, file.blob, `${file.id}.jpg`)))
  }
  await applyOcrResult(run.database, doc.id, readLines(lines, today))
}

/** Một lượt: đọc các chứng từ đang pending lúc bắt đầu, mỗi chứng từ đúng một lần. */
async function drainOnce(run: Run): Promise<void> {
  const pending = await listPendingOcr(run.database)
  if (pending.length === 0) return
  const ready = await (run.deps.modelReady ?? defaultModelReady)()
  for (const doc of pending) {
    try {
      await readDocument(run, doc, ready)
    } catch {
      await markOcrFailed(run.database, doc.id)
    }
  }
}

let running: Promise<void> | null = null
let again = false

/**
 * Chạy hàng đợi tới khi không còn chứng từ pending. Gọi khi khởi động app, sau khi thêm chứng từ và sau khi tải mô hình.
 * Gọi lúc đang chạy: lượt hiện tại chạy thêm một vòng để nhận việc mới, không mở lượt song song.
 */
export function startOcrQueue(deps: OcrQueueDeps = {}): Promise<void> {
  if (running) {
    again = true
    return running
  }
  const run: Run = {
    database: deps.db ?? defaultDb,
    deps,
    engine: null,
    createEngine: deps.createEngine ?? createOcrEngine,
  }
  running = (async () => {
    try {
      do {
        again = false
        await drainOnce(run)
      } while (again)
    } finally {
      run.engine?.terminate()
      run.engine = null
      running = null
    }
  })()
  return running
}
