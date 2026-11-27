import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { Blob as NodeBlob } from 'node:buffer'
// pdf.js reads its worker from a global when one is present, so tests skip the browser-only worker URL.
import 'pdfjs-dist/legacy/build/pdf.worker.min.mjs'
import { hasTextLayer, MIN_TEXT_CHARS, readPdf, textItemsToLines, type PdfTextItem } from '../../src/lib/pdf-read'
import { extractTotal } from '../../src/domain/receipt-amount'

vi.stubGlobal('Blob', NodeBlob)
afterAll(() => vi.unstubAllGlobals())

/**
 * Minimal PDF with one Helvetica text line per entry, one entry per page. A page given no lines has no text layer.
 * With `encrypted`, the Encrypt dictionary carries a user password the empty password does not open.
 */
function buildPdf(pages: string[][], encrypted = false): Uint8Array {
  const n = pages.length
  const fontId = 3 + 2 * n
  const encryptId = 4 + 2 * n
  const objects = new Map<number, string>()
  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>')
  objects.set(2, `<< /Type /Pages /Kids [${pages.map((_, k) => `${3 + 2 * k} 0 R`).join(' ')}] /Count ${n} >>`)
  objects.set(fontId, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  pages.forEach((lines, k) => {
    const contentId = 4 + 2 * k
    objects.set(3 + 2 * k, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`)
    const body = lines
      .map((line, i) => `BT /F1 12 Tf 50 ${800 - 20 * i} Td (${line.replace(/[\\()]/g, '\\$&')}) Tj ET`)
      .join('\n')
    objects.set(contentId, `<< /Length ${body.length} >>\nstream\n${body}\nendstream`)
  })
  if (encrypted) objects.set(encryptId, `<< /Filter /Standard /V 1 /R 2 /O <${'11'.repeat(32)}> /U <${'22'.repeat(32)}> /P -4 >>`)

  const maxId = encrypted ? encryptId : fontId
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let id = 1; id <= maxId; id++) {
    offsets[id] = out.length
    out += `${id} 0 obj\n${objects.get(id)}\nendobj\n`
  }
  const xref = out.length
  out += `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`
  for (let id = 1; id <= maxId; id++) out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  const id = '<00112233445566778899aabbccddeeff>'
  const encrypt = encrypted ? `/Encrypt ${encryptId} 0 R /ID [${id} ${id}] ` : ''
  out += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R ${encrypt}>>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(out)
}

const pdfBlob = (bytes: Uint8Array) => new NodeBlob([bytes], { type: 'application/pdf' }) as unknown as Blob

describe('document-ocr.pdf.text: text layer of e-invoices', () => {
  let text: Blob
  beforeAll(() => {
    text = pdfBlob(buildPdf([['Tong tien thanh toan 2.718.900'], ['Ghi chu khong quan trong']]))
  })

  it('document-ocr.pdf.text: readPdf returns the text lines of every page in page order', async () => {
    const reading = await readPdf(text)
    expect(reading.encrypted).toBe(false)
    expect(reading.pages).toBe(2)
    expect(reading.textLines).toEqual(['Tong tien thanh toan 2.718.900', 'Ghi chu khong quan trong'])
  })

  it('document-ocr.pdf.text: the amount is proposed from the text layer without any model', async () => {
    const reading = await readPdf(text)
    expect(hasTextLayer(reading.textLines)).toBe(true)
    expect(extractTotal(reading.textLines).best).toMatchObject({ amount: 2718900, confidence: 'high' })
  })
})

describe('document-ocr.pdf.scanned: a PDF without a text layer', () => {
  it('document-ocr.pdf.scanned: pages with no text give no lines and no text layer', async () => {
    const reading = await readPdf(pdfBlob(buildPdf([[], []])))
    expect(reading.pages).toBe(2)
    expect(reading.textLines).toEqual([])
    expect(hasTextLayer(reading.textLines)).toBe(false)
  })

  it('document-ocr.pdf.scanned: fewer than MIN_TEXT_CHARS non-space characters do not count as a text layer', () => {
    expect(MIN_TEXT_CHARS).toBe(20)
    expect(hasTextLayer(['ab cd ef gh ij', 'kl mn op'])).toBe(false)
    expect(hasTextLayer(['abcdefghij klmnopqrst'])).toBe(true)
  })
})

describe('document-library.add.protected-pdf: readPdf reports protection', () => {
  it('document-library.add.protected-pdf: a PDF that needs a password reports encrypted', async () => {
    const reading = await readPdf(pdfBlob(buildPdf([['Tong tien thanh toan 2718900']], true)))
    expect(reading.encrypted).toBe(true)
    expect(reading.textLines).toEqual([])
  })

  it('document-library.add.einvoice-pdf: bytes that are not a PDF reject so the caller reports file.unreadable', async () => {
    await expect(readPdf(pdfBlob(new TextEncoder().encode('not a pdf at all')))).rejects.toBeDefined()
  })
})

describe('document-ocr.pdf.text: textItemsToLines', () => {
  const item = (str: string, x: number, y: number, width = str.length * 5, height = 10): PdfTextItem => ({ str, x, y, width, height })

  it('document-ocr.pdf.text: pieces on one baseline form one line, top to bottom, left to right', () => {
    const lines = textItemsToLines([item('Thành tiền', 300, 700), item('Tên món', 20, 700), item('Phở bò', 20, 680), item('60.000', 300, 680.4)])
    expect(lines).toEqual(['Tên món   Thành tiền', 'Phở bò   60.000'])
  })

  it('document-ocr.pdf.text: touching pieces join without a space, a single gap gives one space', () => {
    expect(textItemsToLines([item('Xin', 20, 700, 15), item('chào', 35, 700, 20), item('bạn', 62, 700, 15)])).toEqual(['Xinchào bạn'])
  })

  it('document-ocr.pdf.text: blank pieces are dropped', () => {
    expect(textItemsToLines([item('   ', 0, 0), item('', 5, 5)])).toEqual([])
  })
})
