/*
 * Client VietOCR trên máy (nguồn: chia-tien, services/ocrService.ts, đã lược bớt): tạo Web Worker `workers/vietOcrWorker.ts`,
 * nạp model từ `ocr/vietocr/` theo BASE_URL của app, rồi trả về các dòng chữ theo thứ tự đọc.
 * Worker được tạo ở lần đọc đầu tiên và giữ lại cho các lần sau; `terminate()` dừng worker, lần đọc kế tiếp tạo lại.
 */
import { layoutOcrText, type OcrWord } from '../domain/ocrLayout'

/** Thông điệp Main Thread → vietOcrWorker. */
export type VietOcrWorkerRequest = { type: 'INIT'; requestId: string; baseUrl: string } | { type: 'RECOGNIZE'; requestId: string; image: Blob }

/** Thông điệp vietOcrWorker → Main Thread. `lines` là từng từ kèm hộp bao, toạ độ theo ảnh đã đưa vào. */
export type VietOcrWorkerResponse =
  | { type: 'READY'; requestId: string }
  | { type: 'PROGRESS'; requestId: string; percent: number }
  | { type: 'RESULT'; requestId: string; lines: OcrWord[] }
  | { type: 'ERROR'; requestId: string; message: string }

export interface OcrEngine {
  /** Nhận dạng một ảnh; trả về các dòng chữ theo thứ tự đọc (trên xuống, trái sang phải). Cột cách nhau bằng hai khoảng trắng. */
  recognize(blob: Blob): Promise<string[]>
  /** Dừng worker và huỷ mọi yêu cầu đang chờ. Lần `recognize` sau sẽ tạo lại worker. */
  terminate(): void
}

/** Một worker đang sống: `ready` chờ INIT xong; `pending` chứa hàm huỷ của mọi yêu cầu chưa có phản hồi. */
interface Session {
  worker: Worker
  ready: Promise<void>
  pending: Set<(error: Error) => void>
}

type Settle<T> = (response: VietOcrWorkerResponse) => { value: T } | undefined

/** URL tuyệt đối của gốc app (theo `base` của Vite), để worker tải model đúng cả khi deploy dưới đường dẫn con. */
function appBaseUrl(): string {
  return new URL(import.meta.env.BASE_URL, document.baseURI).href
}

/** Gửi một yêu cầu và chờ phản hồi cùng `requestId`; `settle` trả về giá trị khi phản hồi là kết quả cuối. */
function ask<T>(session: Session, request: VietOcrWorkerRequest, settle: Settle<T>): Promise<T> {
  const { worker, pending } = session
  return new Promise<T>((resolve, reject) => {
    const finish = (action: () => void) => {
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
      pending.delete(fail)
      action()
    }
    const fail = (error: Error) => finish(() => reject(error))
    const onMessage = (event: MessageEvent<VietOcrWorkerResponse>) => {
      const response = event.data
      if (response.requestId !== request.requestId || response.type === 'PROGRESS') return
      if (response.type === 'ERROR') return fail(new Error(response.message))
      const done = settle(response)
      if (done) finish(() => resolve(done.value))
    }
    const onError = () => fail(new Error('Worker OCR gặp lỗi'))

    pending.add(fail)
    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onError)
    worker.postMessage(request)
  })
}

/** Tạo bộ đọc chữ VietOCR. Mọi lần `recognize` xếp hàng nối tiếp nhau: một worker chỉ đọc một ảnh tại một thời điểm. */
export function createOcrEngine(): OcrEngine {
  let session: Session | null = null
  let queue: Promise<unknown> = Promise.resolve()

  function dispose(target: Session, reason: Error): void {
    if (session === target) session = null
    for (const fail of Array.from(target.pending)) fail(reason)
    target.worker.terminate()
  }

  function start(): Session {
    if (session) return session
    const worker = new Worker(new URL('../workers/vietOcrWorker.ts', import.meta.url), { type: 'module' })
    const current: Session = { worker, pending: new Set(), ready: Promise.resolve() }
    current.ready = ask<void>(current, { type: 'INIT', requestId: crypto.randomUUID(), baseUrl: appBaseUrl() }, (r) =>
      r.type === 'READY' ? { value: undefined } : undefined,
    )
    // Khởi tạo lỗi thì bỏ phiên để lần đọc sau tạo lại; lỗi vẫn được báo qua `ready` cho lần đọc hiện tại.
    current.ready.catch(() => dispose(current, new Error('Khởi tạo OCR lỗi')))
    session = current
    return current
  }

  async function run(image: Blob): Promise<string[]> {
    const current = start()
    await current.ready
    const words = await ask<OcrWord[]>(current, { type: 'RECOGNIZE', requestId: crypto.randomUUID(), image }, (r) =>
      r.type === 'RESULT' ? { value: r.lines } : undefined,
    )
    return layoutOcrText(words)
      .split('\n')
      .filter((line) => line !== '')
  }

  return {
    recognize(blob: Blob): Promise<string[]> {
      const next = queue.then(() => run(blob))
      queue = next.catch(() => undefined)
      return next
    },
    terminate(): void {
      if (session) dispose(session, new Error('OCR đã dừng'))
    },
  }
}
