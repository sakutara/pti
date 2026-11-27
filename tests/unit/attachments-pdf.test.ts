import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { PDFDocument, StandardFonts } from 'pdf-lib'
// pdf.js reads its worker from a global when one is present (same setup as pdf-read.test.ts).
import 'pdfjs-dist/legacy/build/pdf.worker.min.mjs'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import {
  buildAttachments,
  ENCODE_STEPS,
  type AttachmentItem,
  type EncodeStep,
  type ImageEncoder,
} from '../../src/lib/attachments-pdf'

// Vitest runs from the project root; import.meta.url is an http URL under jsdom.
const ROOT = `${process.cwd()}/`
const labelFont = new Uint8Array(readFileSync(ROOT + 'public/fonts/NotoSans-Regular.ttf'))
const MB15 = 15_000_000

afterEach(() => vi.unstubAllGlobals())
afterAll(() => vi.unstubAllGlobals())

// --- fixtures -------------------------------------------------------------

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

/** Seeded mulberry32: deterministic noise that deflate cannot shrink. */
function noiseGenerator(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A valid 8-bit RGB PNG. `noise` makes the pixels incompressible so the file size tracks the pixel count. */
function makePng(width: number, height: number, noise = false): Uint8Array {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const stride = width * 3 + 1
  const raw = Buffer.alloc(stride * height)
  const random = noiseGenerator(12345)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = y * stride + 1 + x * 3
      if (noise) {
        raw[o] = Math.floor(random() * 256)
        raw[o + 1] = Math.floor(random() * 256)
        raw[o + 2] = Math.floor(random() * 256)
      } else {
        raw[o] = 30
        raw[o + 1] = 90
        raw[o + 2] = 160
      }
    }
  }
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', new Uint8Array(0)),
    ]),
  )
}

/** A PDF with one page per size, each page holding the given Helvetica text. */
async function makePdf(pages: Array<{ w: number; h: number; text: string }>): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const p of pages) {
    const page = doc.addPage([p.w, p.h])
    page.drawText(p.text, { x: 20, y: p.h / 2, size: 18, font })
  }
  return doc.save()
}

const FORM = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]) // "%PDF-1.4\n" stands in for the form

function photo(id: string, label: string, bytes: Uint8Array): AttachmentItem {
  return { id, label, mime: 'image/png', bytes }
}

/** Fake encoder: records each call and returns a small PNG, so no test depends on a browser. */
function spyEncoder(output: (step: EncodeStep) => Uint8Array = () => makePng(20, 20)) {
  const calls: EncodeStep[] = []
  const encode: ImageEncoder = async (_bytes, step) => {
    calls.push(step)
    return output(step)
  }
  return { encode, calls }
}

async function readDoc(bytes: Uint8Array) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true }).promise
  const pages: Array<{ width: number; height: number; items: string[] }> = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    pages.push({
      width: page.getViewport({ scale: 1 }).width,
      height: page.getViewport({ scale: 1 }).height,
      items: content.items.map((it) => ('str' in it ? it.str : '')).filter((s) => s.trim() !== ''),
    })
  }
  return pages
}

// --- tests ----------------------------------------------------------------

describe('buildAttachments', () => {
  it('claim-submission.attachments.two-files: returns the form as given and one document PDF', async () => {
    const { encode } = spyEncoder()
    const result = await buildAttachments(
      { form: FORM, items: [photo('p1', 'Đơn thuốc', makePng(40, 30))] },
      { maxBytes: MB15, labelFont, encode },
    )
    if (!('files' in result)) throw new Error('expected files')
    expect(result.files.form).toBe(FORM)
    expect(new TextDecoder().decode(result.files.document.slice(0, 5))).toBe('%PDF-')
  })

  it('claim-submission.attachments.order: photos keep checklist order with labels, PDF pages are copied as they are', async () => {
    const invoice = await makePdf([{ w: 300, h: 400, text: 'HOA DON' }])
    const result = await buildAttachments(
      {
        form: FORM,
        items: [
          photo('rx1', 'Đơn thuốc', makePng(40, 30)),
          photo('rx2', 'Đơn thuốc', makePng(30, 40)),
          { id: 'inv', label: 'Hóa đơn', mime: 'application/pdf', bytes: invoice },
        ],
      },
      { maxBytes: MB15, labelFont, encode: spyEncoder().encode },
    )
    if (!('files' in result)) throw new Error('expected files')
    const pages = await readDoc(result.files.document)
    expect(pages).toHaveLength(3)
    expect(pages[0].items).toContain('Đơn thuốc')
    expect(pages[1].items).toContain('Đơn thuốc')
    expect(pages[2].items.join(' ')).toContain('HOA DON')
    expect(pages[2].width).toBe(300)
    expect(pages[2].height).toBe(400)
  })

  it('claim-submission.attachments.order: a landscape photo gets a landscape A4 page and a portrait one a portrait page', async () => {
    const result = await buildAttachments(
      { form: FORM, items: [photo('wide', 'Hóa đơn', makePng(400, 200)), photo('tall', 'Hóa đơn', makePng(200, 400))] },
      { maxBytes: MB15, labelFont, encode: spyEncoder().encode },
    )
    if (!('files' in result)) throw new Error('expected files')
    const [wide, tall] = await readDoc(result.files.document)
    expect(wide.width).toBeGreaterThan(wide.height)
    expect(tall.height).toBeGreaterThan(tall.width)
  })

  it('claim-submission.attachments.size: photos are re-encoded step by step only until the total fits, from the stored bytes', async () => {
    // The document embeds the label font, so measure that overhead first and leave room for about 100 kB of photos.
    const overhead = await buildAttachments(
      { form: FORM, items: [photo('tiny', 'Đơn thuốc', makePng(4, 4))] },
      { maxBytes: MB15, labelFont, encode: spyEncoder().encode },
    )
    if (!('files' in overhead)) throw new Error('expected files')
    const stored = makePng(300, 300, true) // about 270 kB of noise
    const { encode, calls } = spyEncoder((step) => (step.maxEdge === 2000 ? makePng(20, 20) : makePng(10, 10)))
    const result = await buildAttachments(
      { form: FORM, items: [photo('p1', 'Đơn thuốc', stored)] },
      { maxBytes: overhead.files.document.byteLength + 100_000, labelFont, encode },
    )
    expect('files' in result).toBe(true)
    expect(calls).toEqual([ENCODE_STEPS[0]])
  })

  it('claim-submission.attachments.size: the encode ladder is 2000 px q 0.8, 1600 px q 0.75, 1600 px q 0.65', () => {
    expect(ENCODE_STEPS).toEqual([
      { maxEdge: 2000, quality: 0.8 },
      { maxEdge: 1600, quality: 0.75 },
      { maxEdge: 1600, quality: 0.65 },
    ])
  })

  it('claim-submission.attachments.keep-quality: when the stored photos fit, no photo is re-encoded', async () => {
    const { encode, calls } = spyEncoder()
    const result = await buildAttachments(
      { form: FORM, items: [photo('p1', 'Đơn thuốc', makePng(40, 30)), photo('p2', 'Đơn thuốc', makePng(40, 30))] },
      { maxBytes: MB15, labelFont, encode },
    )
    expect('files' in result).toBe(true)
    expect(calls).toHaveLength(0)
  })

  it('claim-submission.attachments.einvoice: e-invoice pages are copied, not rasterised, next to the photo pages', async () => {
    const einvoice = await makePdf([
      { w: 500, h: 700, text: 'HOA DON 1' },
      { w: 500, h: 700, text: 'HOA DON 2' },
    ])
    const result = await buildAttachments(
      {
        form: FORM,
        items: [
          photo('p1', 'Đơn thuốc', makePng(40, 30)),
          photo('p2', 'Đơn thuốc', makePng(40, 30)),
          { id: 'e', label: 'Hóa đơn điện tử', mime: 'application/pdf', bytes: einvoice },
        ],
      },
      { maxBytes: MB15, labelFont, encode: spyEncoder().encode },
    )
    if (!('files' in result)) throw new Error('expected files')
    const pages = await readDoc(result.files.document)
    expect(pages).toHaveLength(4)
    expect(pages[2].items.join(' ')).toContain('HOA DON 1')
    expect(pages[3].items.join(' ')).toContain('HOA DON 2')
    expect(pages[2].width).toBe(500)
  })

  it('claim-submission.attachments.too-large: above the floor quality it returns tooLarge with the total and the largest items', async () => {
    // Leave 10 kB above the document overhead (label font): the 120 px photo never fits.
    const overhead = await buildAttachments(
      { form: FORM, items: [photo('tiny', 'Đơn thuốc', makePng(4, 4))] },
      { maxBytes: MB15, labelFont, encode: spyEncoder().encode },
    )
    if (!('files' in overhead)) throw new Error('expected files')
    const maxBytes = overhead.files.document.byteLength + 10_000
    // The big photo stays big after every step; the small one shrinks to a few bytes.
    const calls: EncodeStep[] = []
    const encode: ImageEncoder = async (bytes, step) => {
      calls.push(step)
      return bytes.byteLength > 1000 ? makePng(120, 120, true) : makePng(10, 10, true)
    }
    const result = await buildAttachments(
      { form: FORM, items: [photo('a', 'Đơn thuốc', makePng(120, 120, true)), photo('b', 'Hóa đơn', makePng(10, 10, true))] },
      { maxBytes, labelFont, encode },
    )
    expect(calls).toEqual(ENCODE_STEPS.flatMap((step) => [step, step]))
    if (!('tooLarge' in result)) throw new Error('expected tooLarge')
    expect(result.tooLarge.total).toBeGreaterThan(maxBytes)
    expect(result.tooLarge.largest[0].id).toBe('a')
    expect(result.tooLarge.largest.length).toBeLessThanOrEqual(3)
  })

  it('claim-submission.attachments.too-large: no file is produced when it does not fit', async () => {
    const result = await buildAttachments(
      { form: FORM, items: [photo('a', 'Đơn thuốc', makePng(120, 120, true))] },
      { maxBytes: 1_000, labelFont, encode: spyEncoder(() => makePng(120, 120, true)).encode },
    )
    expect('files' in result).toBe(false)
  })

  it('claim-submission.supplement.bundle: a supplementary bundle with one new photo is a one-page document', async () => {
    const result = await buildAttachments(
      { form: FORM, items: [photo('new', 'Ảnh bổ sung', makePng(60, 80))] },
      { maxBytes: MB15, labelFont, encode: spyEncoder().encode },
    )
    if (!('files' in result)) throw new Error('expected files')
    const pages = await readDoc(result.files.document)
    expect(pages).toHaveLength(1)
    expect(pages[0].items).toContain('Ảnh bổ sung')
  })

  it('claim-submission.attachments.offline: building needs no network request', async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('network is not allowed')
    })
    vi.stubGlobal('fetch', fetchSpy)
    const result = await buildAttachments(
      { form: FORM, items: [photo('p1', 'Đơn thuốc', makePng(40, 30))] },
      { maxBytes: MB15, labelFont, encode: spyEncoder().encode },
    )
    expect('files' in result).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('claim-submission.attachments.order: an empty item list is rejected', async () => {
    await expect(buildAttachments({ form: FORM, items: [] }, { maxBytes: MB15, labelFont })).rejects.toThrow(RangeError)
  })
})
