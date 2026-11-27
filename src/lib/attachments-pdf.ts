/*
 * Tệp "Chứng từ <lý do>.pdf": mọi ảnh và hóa đơn điện tử của hồ sơ gộp vào một PDF theo thứ tự checklist.
 * Ảnh: mỗi ảnh một trang A4 (ngang hoặc dọc theo ảnh), vừa khung giữ tỉ lệ, có nhãn loại ở trên. PDF: copy nguyên trang.
 * Chỉ hạ chất lượng ảnh khi tổng (cả giấy yêu cầu) vượt `maxBytes`, theo thang ENCODE_STEPS; mức cuối là sàn.
 * Module này import pdf-lib tĩnh nên được nạp lười từ giao diện. Chạy trên thiết bị, không gọi mạng.
 */
import { PDFDocument, type PDFImage, type PDFPage } from 'pdf-lib'
import { attachTextMap, drawTextLine, embedTextFace, type TextFace } from './claim-form-pdf'
import { downscaleImage } from './image'

export interface AttachmentItem {
  id: string
  /** Nhãn in trên đầu trang ảnh, ví dụ "Đơn thuốc". Không dùng cho trang PDF. */
  label: string
  mime: 'image/jpeg' | 'image/png' | 'application/pdf'
  bytes: Uint8Array
}

export interface EncodeStep {
  /** Cạnh dài tối đa, px. */
  maxEdge: number
  /** Chất lượng JPEG 0–1. */
  quality: number
}

/** Nén lại một ảnh thành JPEG theo `step`. Có thể thay trong test; mặc định là Canvas của trình duyệt. */
export type ImageEncoder = (bytes: Uint8Array, step: EncodeStep) => Promise<Uint8Array>

/** Thang nén khi tổng vượt `maxBytes`: ảnh gốc → 2000 px q 0.8 → 1600 px q 0.75 → 1600 px q 0.65 (sàn). */
export const ENCODE_STEPS: readonly EncodeStep[] = [
  { maxEdge: 2000, quality: 0.8 },
  { maxEdge: 1600, quality: 0.75 },
  { maxEdge: 1600, quality: 0.65 },
]

export interface BuildAttachmentsInput {
  /** Giấy yêu cầu đã dựng (PDF). Được tính vào tổng dung lượng và trả lại nguyên vẹn. */
  form: Uint8Array
  /** Chứng từ theo thứ tự checklist. */
  items: AttachmentItem[]
}

export interface BuildAttachmentsOptions {
  /** Tổng cả hai tệp tối đa (byte), ví dụ administrator.maxAttachmentBytes = 15e6. */
  maxBytes: number
  /** Bytes của Noto Sans thường, dùng để viết nhãn. */
  labelFont: Uint8Array
  /** Bộ nén ảnh; mặc định dùng Canvas trình duyệt. */
  encode?: ImageEncoder
}

export interface TooLarge {
  total: number
  /** Ba chứng từ lớn nhất ở mức nén cuối, để người dùng bỏ hoặc thay. */
  largest: Array<{ id: string; label: string; bytes: number }>
}

export type AttachmentResult = { files: { form: Uint8Array; document: Uint8Array } } | { tooLarge: TooLarge }

const A4_PORTRAIT: [number, number] = [595.28, 841.89]
const A4_LANDSCAPE: [number, number] = [841.89, 595.28]
const MARGIN = 36
const LABEL_SIZE = 12
/** Khoảng trên trang ảnh dành cho nhãn. */
const LABEL_BAND = 24

/** Mặc định: giảm cạnh dài xuống `maxEdge` (không phóng to) và mã hoá JPEG ở `quality`. */
export const browserEncodeJpeg: ImageEncoder = async (bytes, step) => {
  const { blob } = await downscaleImage(new Blob([new Uint8Array(bytes)]), step.maxEdge, step.quality)
  return new Uint8Array(await blob.arrayBuffer())
}

interface Prepared {
  id: string
  label: string
  mime: AttachmentItem['mime']
  bytes: Uint8Array
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]

function isPng(bytes: Uint8Array): boolean {
  return PNG_MAGIC.every((b, i) => bytes[i] === b)
}

async function embedImage(doc: PDFDocument, bytes: Uint8Array): Promise<PDFImage> {
  return isPng(bytes) ? doc.embedPng(bytes) : doc.embedJpg(bytes)
}

function addPhotoPage(doc: PDFDocument, face: TextFace, image: PDFImage, label: string): void {
  const landscape = image.width > image.height
  const [width, height] = landscape ? A4_LANDSCAPE : A4_PORTRAIT
  const page: PDFPage = doc.addPage([width, height])
  drawTextLine(page, face, label, MARGIN, height - MARGIN - LABEL_SIZE, LABEL_SIZE)

  const areaWidth = width - 2 * MARGIN
  const areaHeight = height - 2 * MARGIN - LABEL_BAND
  const scale = Math.min(areaWidth / image.width, areaHeight / image.height)
  const drawWidth = image.width * scale
  const drawHeight = image.height * scale
  page.drawImage(image, {
    x: (width - drawWidth) / 2,
    y: MARGIN + (areaHeight - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  })
}

/** Dựng tệp chứng từ: một trang cho mỗi ảnh (có nhãn), các trang PDF được copy theo thứ tự. */
async function buildDocument(items: Prepared[], labelFont: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const face = await embedTextFace(doc, labelFont)
  for (const item of items) {
    if (item.mime === 'application/pdf') {
      const source = await PDFDocument.load(item.bytes)
      const pages = await doc.copyPages(source, source.getPageIndices())
      for (const page of pages) doc.addPage(page)
    } else {
      addPhotoPage(doc, face, await embedImage(doc, item.bytes), item.label)
    }
  }
  await attachTextMap(doc, face)
  return doc.save()
}

/** Mọi ảnh (từ bản gốc) được nén lại theo `step`; trang PDF giữ nguyên. */
async function reencode(items: AttachmentItem[], step: EncodeStep, encode: ImageEncoder): Promise<Prepared[]> {
  const out: Prepared[] = []
  for (const item of items) {
    if (item.mime === 'application/pdf') {
      out.push(item)
    } else {
      out.push({ id: item.id, label: item.label, mime: 'image/jpeg', bytes: await encode(item.bytes, step) })
    }
  }
  return out
}

/**
 * Dựng hai tệp: giấy yêu cầu (trả lại nguyên vẹn) và tệp chứng từ. Thử lần lượt: ảnh đã lưu, rồi từng mức trong
 * ENCODE_STEPS, dừng ở mức đầu tiên làm tổng ≤ `maxBytes`. Hết mức mà vẫn vượt thì trả `tooLarge` và không có tệp nào.
 */
export async function buildAttachments(
  input: BuildAttachmentsInput,
  options: BuildAttachmentsOptions,
): Promise<AttachmentResult> {
  if (input.items.length === 0) throw new RangeError('buildAttachments cần ít nhất một chứng từ')
  const encode = options.encode ?? browserEncodeJpeg
  const levels: Array<EncodeStep | null> = [null, ...ENCODE_STEPS]

  let last: { total: number; items: Prepared[] } | null = null
  for (const step of levels) {
    const items = step === null ? input.items : await reencode(input.items, step, encode)
    const document = await buildDocument(items, options.labelFont)
    const total = input.form.byteLength + document.byteLength
    if (total <= options.maxBytes) return { files: { form: input.form, document } }
    last = { total, items }
  }

  const sized = (last?.items ?? [])
    .map((item) => ({ id: item.id, label: item.label, bytes: item.bytes.byteLength }))
    .sort((a, b) => b.bytes - a.bytes)
  return { tooLarge: { total: last?.total ?? 0, largest: sized.slice(0, 3) } }
}
