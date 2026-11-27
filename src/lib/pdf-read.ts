/*
 * Đọc PDF (hoá đơn điện tử) trên trình duyệt bằng pdf.js (bản legacy, pin 4.10.38). Hai việc:
 * - `readPdf`: số trang, có mật khẩu không, và các dòng chữ của lớp chữ (gom mảnh chữ theo đường cơ sở).
 * - `renderPage`: dựng một trang thành ảnh JPEG theo cạnh dài cho PDF chỉ có ảnh quét (đưa vào OCR).
 * pdf.js và worker được nạp lười (dynamic import) để không làm nặng bundle chính. Port từ fee-calculator (pdfText.ts, pdfImport.ts).
 */

/** Số ký tự (không tính khoảng trắng) tối thiểu để coi cả PDF có lớp chữ. */
export const MIN_TEXT_CHARS = 20

export interface PdfReading {
  pages: number
  /** true khi PDF cần mật khẩu mà mật khẩu rỗng không mở được. Khi đó `pages` = 0 và `textLines` rỗng. */
  encrypted: boolean
  /** Dòng chữ của mọi trang, theo thứ tự trang; trang không có chữ không đóng góp dòng nào. */
  textLines: string[]
}

export interface PdfTextItem {
  str: string
  /** Mép trái và đường cơ sở của mảnh chữ (toạ độ PDF: y tăng dần lên trên). */
  x: number
  y: number
  width: number
  height: number
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)]
}

/** Các dòng của trang, từ trên xuống dưới. Rỗng nếu trang không có chữ. */
export function textItemsToLines(items: ReadonlyArray<PdfTextItem>): string[] {
  const pieces = items.filter((it) => it.str.trim().length > 0)
  if (pieces.length === 0) return []

  const lineHeight = median(pieces.map((p) => p.height).filter((h) => h > 0)) || 10
  const tolerance = Math.max(1.5, lineHeight * 0.5)

  // Từ trên xuống: y lớn trước. Mảnh thuộc dòng hiện tại khi lệch đường cơ sở không quá nửa chiều cao chữ.
  const sorted = [...pieces].sort((a, b) => b.y - a.y)
  const rows: PdfTextItem[][] = []
  let rowY = Number.NaN
  for (const piece of sorted) {
    if (rows.length > 0 && Math.abs(piece.y - rowY) <= tolerance) {
      rows[rows.length - 1].push(piece)
    } else {
      rows.push([piece])
      rowY = piece.y
    }
  }

  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x)
    let line = ''
    let end = Number.NaN
    for (const piece of row) {
      const text = piece.str.trim()
      if (line !== '') {
        const gap = piece.x - end
        const unit = Math.max(piece.height, 1)
        // Chữ liền nhau (một từ bị PDF cắt thành nhiều mảnh) thì không chèn khoảng trắng; cách xa thì chèn nhiều.
        line += gap < unit * 0.15 ? '' : gap > unit * 2.5 ? '   ' : ' '
      }
      line += text
      end = piece.x + piece.width
    }
    return line
  })
}

/** Có đủ chữ để coi PDF có lớp chữ (đọc số tiền từ chữ, không cần OCR). */
export function hasTextLayer(lines: ReadonlyArray<string>): boolean {
  return lines.join('').replace(/\s/g, '').length >= MIN_TEXT_CHARS
}

interface TextContentItem {
  str?: string
  transform?: number[]
  width?: number
  height?: number
}

function toTextItems(items: ReadonlyArray<unknown>): PdfTextItem[] {
  const out: PdfTextItem[] = []
  for (const raw of items as TextContentItem[]) {
    if (typeof raw.str !== 'string' || !raw.transform) continue
    out.push({
      str: raw.str,
      x: raw.transform[4],
      y: raw.transform[5],
      width: raw.width ?? 0,
      height: raw.height ?? Math.abs(raw.transform[3]),
    })
  }
  return out
}

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs')

/** Nạp pdf.js và trỏ worker tới tệp được Vite đóng gói (được precache để đọc hoá đơn điện tử khi offline). */
async function loadPdfJs(): Promise<PdfJs> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default
  }
  return pdfjs
}

async function openPdf(pdfjs: PdfJs, file: Blob) {
  const data = new Uint8Array(await file.arrayBuffer())
  return pdfjs.getDocument({ data }).promise
}

/**
 * Đọc PDF: số trang và dòng chữ của mọi trang. Mật khẩu → `encrypted: true` (không ném lỗi); tệp không phải PDF
 * hoặc hỏng → ném lỗi để người gọi báo `file.unreadable`.
 */
export async function readPdf(file: Blob): Promise<PdfReading> {
  const pdfjs = await loadPdfJs()
  let pdf: Awaited<ReturnType<typeof openPdf>>
  try {
    pdf = await openPdf(pdfjs, file)
  } catch (err) {
    if ((err as { name?: string }).name === 'PasswordException') return { pages: 0, encrypted: true, textLines: [] }
    throw err
  }

  try {
    if (pdf.numPages < 1) throw new Error('PDF không có trang nào')
    const textLines: string[] = []
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n)
      try {
        const content = await page.getTextContent()
        textLines.push(...textItemsToLines(toTextItems(content.items)))
      } finally {
        page.cleanup()
      }
    }
    return { pages: pdf.numPages, encrypted: false, textLines }
  } finally {
    void pdf.destroy()
  }
}

/** Dựng trang `pageNumber` (từ 1) thành JPEG có cạnh dài `longEdge` px. Chỉ chạy trên trình duyệt (Canvas). */
export async function renderPage(file: Blob, pageNumber: number, longEdge: number): Promise<Blob> {
  const pdfjs = await loadPdfJs()
  const pdf = await openPdf(pdfjs, file)
  try {
    const page = await pdf.getPage(pageNumber)
    try {
      const natural = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: longEdge / Math.max(natural.width, natural.height) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(viewport.width))
      canvas.height = Math.max(1, Math.round(viewport.height))
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas không khả dụng.')
      // PDF nền trong suốt: tô trắng để JPEG không thành đen.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, viewport }).promise
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
      if (!blob) throw new Error('Không tạo được ảnh trang PDF.')
      return blob
    } finally {
      page.cleanup()
    }
  } finally {
    void pdf.destroy()
  }
}
