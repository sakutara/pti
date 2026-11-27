import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOcrEngine } from '../../src/lib/ocr-engine'
import type { VietOcrWorkerRequest, VietOcrWorkerResponse } from '../../src/lib/ocr-engine'
import type { OcrWord } from '../../src/domain/ocrLayout'

/** Worker giả: nhận thông điệp và trả lời theo `reply`; ghi lại mọi yêu cầu và số lần terminate. */
class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = []
  static reply: (request: VietOcrWorkerRequest, worker: FakeWorker) => VietOcrWorkerResponse | null = () => null

  readonly url: URL | string
  readonly options: WorkerOptions | undefined
  readonly posted: VietOcrWorkerRequest[] = []
  terminated = false

  constructor(url: URL | string, options?: WorkerOptions) {
    super()
    this.url = url
    this.options = options
    FakeWorker.instances.push(this)
  }

  postMessage(request: VietOcrWorkerRequest): void {
    this.posted.push(request)
    queueMicrotask(() => {
      const response = FakeWorker.reply(request, this)
      if (response) this.emit(response)
    })
  }

  emit(data: VietOcrWorkerResponse): void {
    this.dispatchEvent(new MessageEvent('message', { data }))
  }

  terminate(): void {
    this.terminated = true
  }
}

const words: OcrWord[] = [
  { text: 'Chả', x0: 10, y0: 140, x1: 50, y1: 160 },
  { text: '40.000', x0: 300, y0: 140, x1: 370, y1: 160 },
  { text: 'Bún', x0: 10, y0: 100, x1: 50, y1: 120 },
  { text: '50.000', x0: 300, y0: 100, x1: 370, y1: 120 },
]

const readyAndRecognize = (request: VietOcrWorkerRequest): VietOcrWorkerResponse | null => {
  if (request.type === 'INIT') return { type: 'READY', requestId: request.requestId }
  return { type: 'RESULT', requestId: request.requestId, lines: words }
}

describe('document-ocr.model.offline-ready: ocr-engine client', () => {
  beforeEach(() => {
    FakeWorker.instances = []
    FakeWorker.reply = readyAndRecognize
    vi.stubGlobal('Worker', FakeWorker)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('document-ocr.model.offline-ready: starts a module worker and passes an absolute base URL for the model', async () => {
    const engine = createOcrEngine()
    await engine.recognize(new Blob(['img']))

    expect(FakeWorker.instances).toHaveLength(1)
    const [worker] = FakeWorker.instances
    expect(worker.options).toEqual({ type: 'module' })
    const init = worker.posted[0]
    expect(init.type).toBe('INIT')
    if (init.type !== 'INIT') throw new Error('expected INIT')
    expect(init.baseUrl).toBe(new URL(import.meta.env.BASE_URL, document.baseURI).href)
    expect(init.baseUrl.endsWith('/')).toBe(true)
  })

  it('document-ocr.model.offline-ready: recognize returns text lines in reading order', async () => {
    const engine = createOcrEngine()
    await expect(engine.recognize(new Blob(['img']))).resolves.toEqual(['Bún  50.000', 'Chả  40.000'])
  })

  it('document-ocr.model.offline-ready: sends the image blob in a RECOGNIZE request and reuses the worker', async () => {
    const engine = createOcrEngine()
    const image = new Blob(['img-1'])
    await engine.recognize(image)
    await engine.recognize(new Blob(['img-2']))

    expect(FakeWorker.instances).toHaveLength(1)
    const recognize = FakeWorker.instances[0].posted.filter((r) => r.type === 'RECOGNIZE')
    expect(recognize).toHaveLength(2)
    expect(recognize[0]).toMatchObject({ type: 'RECOGNIZE', image })
  })

  it('document-ocr.model.offline-ready: rejects when the worker reports an error', async () => {
    FakeWorker.reply = (request) =>
      request.type === 'INIT'
        ? { type: 'READY', requestId: request.requestId }
        : { type: 'ERROR', requestId: request.requestId, message: 'model lỗi' }
    const engine = createOcrEngine()
    await expect(engine.recognize(new Blob(['img']))).rejects.toThrow('model lỗi')
  })

  it('document-ocr.model.offline-ready: rejects when the worker fails to start', async () => {
    FakeWorker.reply = (request) => (request.type === 'INIT' ? { type: 'ERROR', requestId: request.requestId, message: 'không tải được' } : null)
    const engine = createOcrEngine()
    await expect(engine.recognize(new Blob(['img']))).rejects.toThrow('không tải được')
  })

  it('document-ocr.model.offline-ready: terminate stops the worker and rejects a pending recognize', async () => {
    FakeWorker.reply = (request) => (request.type === 'INIT' ? { type: 'READY', requestId: request.requestId } : null)
    const engine = createOcrEngine()
    const pending = engine.recognize(new Blob(['img']))
    await vi.waitFor(() => expect(FakeWorker.instances[0]?.posted.some((r) => r.type === 'RECOGNIZE')).toBe(true))

    engine.terminate()

    await expect(pending).rejects.toThrow()
    expect(FakeWorker.instances[0].terminated).toBe(true)
  })

  it('document-ocr.model.offline-ready: after terminate a new recognize starts a fresh worker', async () => {
    const engine = createOcrEngine()
    await engine.recognize(new Blob(['img']))
    engine.terminate()
    await expect(engine.recognize(new Blob(['img']))).resolves.toEqual(['Bún  50.000', 'Chả  40.000'])
    expect(FakeWorker.instances).toHaveLength(2)
  })
})
