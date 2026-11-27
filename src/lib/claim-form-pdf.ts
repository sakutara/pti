/*
 * Dựng giấy yêu cầu bồi thường đã điền: viết dữ liệu lên mẫu trống public/forms/gyc-template.pdf theo vị trí trong
 * public/forms/gyc-fields.json, bằng Noto Sans (thường và đậm) đã nhúng để giữ dấu tiếng Việt.
 * Module này import pdf-lib và fontkit tĩnh, nên chỉ được nạp lười (dynamic import) từ giao diện.
 * Chạy hoàn toàn trên thiết bị: `renderClaimForm` không gọi mạng; `loadFormAssets` chỉ đọc các tệp đã precache.
 */
import { PDFDict, PDFDocument, PDFName, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit, { type Font as FontkitFont } from '@pdf-lib/fontkit'
import type { ClaimFormData, ExpenseRow } from '../domain/claim-form'
import { formatAmountText } from '../domain/claim-form'

export interface FieldSpec {
  /** 1-based page on the template. */
  page: number
  /** Left edge (or right edge when `align` is 'right'), PDF points, origin bottom-left. */
  x: number
  y: number
  /** Starting font size in points. */
  size: number
  bold: boolean
  color: [number, number, number]
  /** Baselines of the lines the value may occupy, top first. */
  lineYs: number[]
  maxWidth: number
  align?: 'left' | 'right'
  /** x of the lines after the first, when the first one follows a printed label on the template. */
  continuationX?: number
}

export interface FormLayout {
  pageSize: [number, number]
  fields: Record<string, FieldSpec>
  table: {
    /** 1-based page holding the expense table on the template. */
    page: number
    rowsPerPage: number
    /** Distance between two table rows, points. */
    rowPitch: number
  }
}

export interface FormAssets {
  template: Uint8Array
  layout: FormLayout
  regularFont: Uint8Array
  boldFont: Uint8Array
}

const ASSET_FILES = {
  template: 'forms/gyc-template.pdf',
  layout: 'forms/gyc-fields.json',
  regularFont: 'fonts/NotoSans-Regular.ttf',
  boldFont: 'fonts/NotoSans-Bold.ttf',
} as const

/** Fields filled per table row, and the total fields filled only on the last table page. */
const ROW_FIELDS = ['rowNo', 'rowDate', 'rowAmount'] as const
const TOTAL_FIELDS = ['totalNumber', 'totalWords'] as const
const TABLE_FIELDS = new Set<string>([...ROW_FIELDS, ...TOTAL_FIELDS])

/** Smallest font size before a value is allowed to run past its lines. */
const MIN_FONT_SIZE = 6
/** Line spacing of extra lines, as a multiple of the font size (only used past the template's lines). */
const LINE_GAP = 1.25

/** Đọc các tệp mẫu từ đường dẫn đã precache (cùng gốc với app). Chỉ chạy trên trình duyệt. */
export async function loadFormAssets(baseUrl: string = import.meta.env.BASE_URL): Promise<FormAssets> {
  const fetchBytes = async (path: string): Promise<Uint8Array> => {
    const res = await fetch(`${baseUrl}${path}`)
    if (!res.ok) throw new Error(`Không tải được tệp mẫu: ${path}`)
    return new Uint8Array(await res.arrayBuffer())
  }
  const fetchJson = async (path: string): Promise<FormLayout> => {
    const res = await fetch(`${baseUrl}${path}`)
    if (!res.ok) throw new Error(`Không tải được tệp mẫu: ${path}`)
    return (await res.json()) as FormLayout
  }
  const [template, layout, regularFont, boldFont] = await Promise.all([
    fetchBytes(ASSET_FILES.template),
    fetchJson(ASSET_FILES.layout),
    fetchBytes(ASSET_FILES.regularFont),
    fetchBytes(ASSET_FILES.boldFont),
  ])
  return { template, layout, regularFont, boldFont }
}

/** Giá trị của từng trường không thuộc bảng kê. Trường lạ trong gyc-fields.json là lỗi cấu hình và ném lỗi. */
const VALUE_OF: Record<string, (d: ClaimFormData) => string | null> = {
  policyholderName: (d) => d.policyholderName,
  contractCode: (d) => d.contractCode,
  patientName: (d) => d.patientName,
  patientDob: (d) => d.patientDob,
  patientTier: (d) => d.patientTier,
  patientPhone: (d) => d.patientPhone,
  employeeName: (d) => d.employeeName,
  employeeCode: (d) => d.employeeCode,
  jobTitle: (d) => d.jobTitle,
  email: (d) => d.employeeEmail,
  accountNumber: (d) => d.accountNumber,
  bankName: (d) => d.bankName,
  bankAddress: (d) => d.bankAddress,
  beneficiary: (d) => d.beneficiary,
  daysOff: (d) => String(d.daysOff),
  visitDate: (d) => d.visitDate,
  diagnosis: (d) => d.diagnosis,
  facilityName: (d) => d.facilityName,
  admissionDate: (d) => d.admissionDate,
  dischargeDate: (d) => d.dischargeDate,
  totalAmount: (d) => (d.totalAmount > 0 ? d.totalAmountText : null),
  claimantName: (d) => d.employeeName,
}

/** Một phông Noto đã nhúng cùng các mã Unicode đã vẽ bằng nó (để dựng bảng ToUnicode). */
export interface TextFace {
  font: PDFFont
  fk: FontkitFont
  used: Set<number>
}

/**
 * Tắt thay thế glyph để mỗi ký tự là đúng một glyph: fontkit mặc định tách ệ/ị/ọ/ụ… thành chữ cái + dấu chấm dùng
 * chung, nên không lập được bảng ToUnicode 1-1 và trình đọc PDF đọc sai chữ.
 */
const SINGLE_GLYPH_FEATURES = { ccmp: false, liga: false, clig: false, rlig: false, calt: false }

/**
 * Gắn bảng ToUnicode (mã glyph → ký tự) cho các ký tự đã vẽ bằng `face`. pdf-lib không tự tạo bảng này, nên không có
 * bảng thì trình đọc PDF đoán chữ từ phông và đọc sai ẹ ị ọ ụ. Gọi sau khi vẽ xong, trước khi lưu.
 */
export async function attachTextMap(doc: PDFDocument, face: TextFace): Promise<void> {
  const byGlyph = new Map<number, number>()
  for (const cp of face.used) {
    const gid = face.fk.glyphForCodePoint(cp).id
    if (gid !== 0 && !byGlyph.has(gid)) byGlyph.set(gid, cp)
  }
  if (byGlyph.size === 0) return

  const hex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, '0')
  const pairs = [...byGlyph.entries()]
  let body = ''
  for (let i = 0; i < pairs.length; i += 100) {
    const chunk = pairs.slice(i, i + 100)
    body += `${chunk.length} beginbfchar\n`
    for (const [gid, cp] of chunk) {
      const units = String.fromCodePoint(cp)
      let code = ''
      for (let u = 0; u < units.length; u++) code += hex4(units.charCodeAt(u))
      body += `<${hex4(gid)}> <${code}>\n`
    }
    body += 'endbfchar\n'
  }
  const cmap =
    '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n' +
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n' +
    '/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n' +
    '1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n' +
    body +
    'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n'

  // pdf-lib chỉ ghi từ điển phông khi nhúng; embed() là idempotent nên gọi trước để có từ điển ngay.
  await face.font.embed()
  const stream = doc.context.register(doc.context.flateStream(cmap))
  const dict = doc.context.lookup(face.font.ref, PDFDict)
  if (!dict) throw new Error('Phông nhúng không có từ điển')
  dict.set(PDFName.of('ToUnicode'), stream)
}

/** Chia chữ thành dòng không vượt `maxWidth`. Từ quá dài thì cắt theo ký tự. */
function wrap(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const width = (s: string) => font.widthOfTextAtSize(s, size)
  const lines: string[] = []
  let line = ''
  for (const word of value.split(/\s+/)) {
    const candidate = line === '' ? word : `${line} ${word}`
    if (width(candidate) <= maxWidth) {
      line = candidate
      continue
    }
    if (line !== '') lines.push(line)
    line = ''
    let piece = ''
    for (const ch of word) {
      if (piece !== '' && width(piece + ch) > maxWidth) {
        lines.push(piece)
        piece = ch
      } else {
        piece += ch
      }
    }
    line = piece
  }
  if (line !== '') lines.push(line)
  return lines
}

/**
 * Viết một giá trị vào ô: cỡ chữ giảm dần từ cỡ gốc tới 6 pt cho tới khi vừa số dòng của ô; nếu vẫn không vừa thì
 * dòng thừa đi tiếp xuống dưới với khoảng cách 6 pt.
 */
function drawField(page: PDFPage, value: string, spec: FieldSpec, face: TextFace): void {
  const font = face.font
  let size = MIN_FONT_SIZE
  let lines = wrap(value, font, MIN_FONT_SIZE, spec.maxWidth)
  for (let s = spec.size; s >= MIN_FONT_SIZE; s -= 0.5) {
    const candidate = wrap(value, font, s, spec.maxWidth)
    if (candidate.length <= spec.lineYs.length) {
      size = s
      lines = candidate
      break
    }
  }

  const color = rgb(spec.color[0], spec.color[1], spec.color[2])
  const lastY = spec.lineYs[spec.lineYs.length - 1]
  lines.forEach((line, i) => {
    const y = i < spec.lineYs.length ? spec.lineYs[i] : lastY - (i - spec.lineYs.length + 1) * size * LINE_GAP
    const textWidth = font.widthOfTextAtSize(line, size)
    const left = i > 0 && spec.continuationX !== undefined ? spec.continuationX : spec.x
    const x = spec.align === 'right' ? left - textWidth : left
    drawTextLine(page, face, line, x, y, size, color)
  })
}

/** Dòng bảng thứ `index` (0-based) trên trang: cùng cột với dòng đầu, lùi xuống theo `rowPitch`. */
function rowSpec(spec: FieldSpec, index: number, pitch: number): FieldSpec {
  const y = spec.lineYs[0] - index * pitch
  return { ...spec, y, lineYs: [y] }
}

/** Nhúng một phông Noto (đầy đủ, không cắt tập glyph, mỗi ký tự một glyph) và chuẩn bị tập mã đã dùng. */
export async function embedTextFace(doc: PDFDocument, bytes: Uint8Array): Promise<TextFace> {
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(bytes, { subset: false, features: SINGLE_GLYPH_FEATURES })
  return { font, fk: fontkit.create(bytes), used: new Set() }
}

/** Vẽ một dòng chữ bằng phông đã nhúng và ghi nhớ các ký tự đã dùng. */
export function drawTextLine(
  page: PDFPage,
  face: TextFace,
  text: string,
  x: number,
  y: number,
  size: number,
  color = rgb(0, 0, 0),
): void {
  page.drawText(text, { x, y, size, font: face.font, color })
  for (const ch of text) face.used.add(ch.codePointAt(0) ?? 0)
}

/** Viết các trường cố định (không thuộc bảng kê) nằm trên trang `pageNo` của mẫu. */
function drawFixedFields(
  page: PDFPage,
  pageNo: number,
  layout: FormLayout,
  data: ClaimFormData,
  faces: { regular: TextFace; bold: TextFace },
): void {
  for (const [name, spec] of Object.entries(layout.fields)) {
    if (TABLE_FIELDS.has(name) || spec.page !== pageNo) continue
    const getValue = VALUE_OF[name]
    if (!getValue) throw new Error(`gyc-fields.json: không có nguồn dữ liệu cho trường "${name}"`)
    const value = getValue(data)
    if (value) drawField(page, value, spec, spec.bold ? faces.bold : faces.regular)
  }
}

/**
 * Dựng PDF: trang 1 là giấy yêu cầu đã điền; sau đó là trang bảng kê (trang 2 của mẫu), mỗi trang tối đa
 * `rowsPerPage` hóa đơn. Hóa đơn nhiều hơn một trang thì thêm bản sao trang 2, tổng tiền chỉ ghi ở trang cuối.
 * Chữ ký và ô dấu để trống. Không ghi gì khi không có dữ liệu.
 */
export async function renderClaimForm(data: ClaimFormData, assets: FormAssets): Promise<Uint8Array> {
  const { layout } = assets
  const template = await PDFDocument.load(assets.template)
  const out = await PDFDocument.create()
  out.registerFontkit(fontkit)
  // Mỗi ký tự một glyph (SINGLE_GLYPH_FEATURES) nên bảng ToUnicode ánh xạ đúng từng mã glyph.
  const regular = await embedTextFace(out, assets.regularFont)
  const bold = await embedTextFace(out, assets.boldFont)

  const tableIndex = layout.table.page - 1
  const [first] = await out.copyPages(template, [0])
  out.addPage(first)
  const page1 = out.getPage(0)

  drawFixedFields(page1, 1, layout, data, { regular, bold })

  const expenses: ExpenseRow[] = data.expenses
  const perPage = layout.table.rowsPerPage
  const tablePages = Math.max(1, Math.ceil(expenses.length / perPage))
  for (let p = 0; p < tablePages; p++) {
    const [copy] = await out.copyPages(template, [tableIndex])
    out.addPage(copy)
    const page = out.getPage(out.getPageCount() - 1)
    const rows = expenses.slice(p * perPage, (p + 1) * perPage)

    rows.forEach((row, k) => {
      const index = p * perPage + k
      const values = { rowNo: String(index + 1), rowDate: row.date, rowAmount: formatAmountText(row.amount) }
      for (const name of ROW_FIELDS) {
        const spec = layout.fields[name]
        drawField(page, values[name], rowSpec(spec, k, layout.table.rowPitch), regular)
      }
    })

    drawFixedFields(page, layout.table.page, layout, data, { regular, bold })

    if (p === tablePages - 1 && data.totalWords !== null) {
      drawField(page, formatAmountText(data.totalAmount), layout.fields.totalNumber, bold)
      drawField(page, data.totalWords, layout.fields.totalWords, bold)
    }
  }

  await attachTextMap(out, regular)
  await attachTextMap(out, bold)
  return out.save()
}
