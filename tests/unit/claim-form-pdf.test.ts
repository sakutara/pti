import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
// pdf.js reads its worker from a global when one is present (same setup as pdf-read.test.ts).
import 'pdfjs-dist/legacy/build/pdf.worker.min.mjs'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { loadFormAssets, renderClaimForm, type FormAssets } from '../../src/lib/claim-form-pdf'
import type { ClaimFormData, ExpenseRow } from '../../src/domain/claim-form'
import { formatAmountText } from '../../src/domain/claim-form'
import { amountInWords } from '../../src/domain/vn-number-words'

// Vitest runs from the project root; import.meta.url is an http URL under jsdom.
const ROOT = `${process.cwd()}/`
const read = (rel: string) => new Uint8Array(readFileSync(ROOT + rel))

function loadAssetsFromDisk(): FormAssets {
  return {
    template: read('public/forms/gyc-template.pdf'),
    layout: JSON.parse(readFileSync(ROOT + 'public/forms/gyc-fields.json', 'utf8')),
    regularFont: read('public/fonts/NotoSans-Regular.ttf'),
    boldFont: read('public/fonts/NotoSans-Bold.ttf'),
  }
}

const assets = loadAssetsFromDisk()

afterEach(() => vi.unstubAllGlobals())
afterAll(() => vi.unstubAllGlobals())

interface TextItem {
  str: string
  x: number
  y: number
  width: number
}

/** Text items of every page, in drawing order. */
async function pagesOf(bytes: Uint8Array): Promise<TextItem[][]> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true }).promise
  const pages: TextItem[][] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent()
    pages.push(
      content.items
        .filter((it): it is typeof it & { str: string } => 'str' in it && it.str.trim() !== '')
        .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width })),
    )
  }
  return pages
}

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()
const pageText = (items: TextItem[]) => normalize(items.map((it) => it.str).join(' '))

function sample(overrides: Partial<ClaimFormData> = {}, expenses: ExpenseRow[] = [
  { date: '18/11/2026', amount: 300000 },
  { date: '20/11/2026', amount: 450000 },
]): ClaimFormData {
  const totalAmount = expenses.reduce((sum, row) => sum + row.amount, 0)
  return {
    reason: 'khám mắt',
    policyholderName: 'Công ty Mẫu',
    contractCode: 'HD-001',
    patientName: 'Nguyễn Thị B',
    patientDob: '06/05/2015',
    patientTier: '2',
    patientPhone: '0900000001',
    employeeName: 'Nguyễn Văn A',
    employeeCode: 'NV-001',
    jobTitle: 'Kỹ sư phần mềm',
    employeeEmail: 'holder@example.com',
    accountNumber: '000111222333',
    bankName: 'Ngân hàng Mẫu',
    bankAddress: null,
    beneficiary: 'NGUYEN VAN A',
    daysOff: 0,
    visitDate: '18/11/2026',
    diagnosis: 'Tật khúc xạ, cận thị',
    facilityName: 'Phòng khám Mẫu',
    admissionDate: null,
    dischargeDate: null,
    expenses,
    totalAmount,
    totalAmountText: formatAmountText(totalAmount),
    totalWords: totalAmount > 0 ? amountInWords(totalAmount) : null,
    unconfirmedInvoices: 0,
    ...overrides,
  }
}

function expenseRows(count: number): ExpenseRow[] {
  return Array.from({ length: count }, (_, i) => ({
    date: `${String((i % 28) + 1).padStart(2, '0')}/11/2026`,
    amount: 100000 + i * 1000,
  }))
}

describe('renderClaimForm', () => {
  it('claim-submission.form.fields: page 1 shows patient, employee, payout and treatment values with diacritics', async () => {
    const pages = await pagesOf(await renderClaimForm(sample({ daysOff: 0 }), assets))
    const page1 = pages[0].map((it) => it.str)
    for (const value of [
      'Công ty Mẫu', 'HD-001', 'Nguyễn Thị B', '06/05/2015', '2', '0900000001', 'Nguyễn Văn A', 'NV-001',
      'Kỹ sư phần mềm', 'holder@example.com', '000111222333', 'Ngân hàng Mẫu', 'NGUYEN VAN A', '0',
      '18/11/2026', 'Tật khúc xạ, cận thị', 'Phòng khám Mẫu',
    ]) {
      expect(page1, value).toContain(value)
    }
  })

  it('claim-submission.form.expenses: table lists 18/11 before 20/11 and the total "750.000" is on page 1 and page 2', async () => {
    const pages = await pagesOf(await renderClaimForm(sample(), assets))
    expect(pages).toHaveLength(2)
    const page2 = pages[1].map((it) => it.str)
    expect(page2.indexOf('18/11/2026')).toBeGreaterThanOrEqual(0)
    expect(page2.indexOf('18/11/2026')).toBeLessThan(page2.indexOf('20/11/2026'))
    expect(page2).toContain('300.000')
    expect(page2).toContain('450.000')
    expect(pages[0].map((it) => it.str)).toContain('750.000')
    expect(page2).toContain('750.000')
  })

  it('claim-submission.form.words: the total in words is written on page 2', async () => {
    const pages = await pagesOf(await renderClaimForm(sample(), assets))
    expect(pageText(pages[1])).toContain('bảy trăm năm mươi nghìn đồng chẵn')
  })

  it('claim-submission.form.many-rows: 20 invoices make a four-page PDF with every row listed', async () => {
    const rows = expenseRows(20)
    const pages = await pagesOf(await renderClaimForm(sample({}, rows), assets))
    expect(pages).toHaveLength(4)
    const listed = pages.slice(1).flatMap((items) => items.map((it) => it.str))
    for (const row of rows) expect(listed).toContain(formatAmountText(row.amount))
  })

  it('claim-submission.form.many-rows: 40 invoices fill extra table pages and the total is only on the last one', async () => {
    const rows = expenseRows(40)
    const total = rows.reduce((sum, row) => sum + row.amount, 0)
    const pages = await pagesOf(await renderClaimForm(sample({}, rows), assets))
    expect(pages).toHaveLength(6)
    const listed = pages.slice(1).flatMap((items) => items.map((it) => it.str))
    for (const row of rows) expect(listed.filter((s) => s === formatAmountText(row.amount)), row.date).toHaveLength(1)
    for (const n of [1, 2, 3, 4]) {
      expect(pageText(pages[n]), `page ${n + 1}`).not.toContain('đồng chẵn')
    }
    expect(pageText(pages[5])).toContain(amountInWords(total))
    expect(pages[5].map((it) => it.str)).toContain(formatAmountText(total))
  })

  it('claim-submission.form.long-values: a long diagnosis wraps inside its field and keeps every word', async () => {
    const diagnosis =
      'Viêm mũi dị ứng mạn tính kèm viêm xoang hàm hai bên và viêm amidan, đã điều trị nội khoa ngoại trú theo đơn của bác sỹ chuyên khoa tai mũi họng.'
    const pages = await pagesOf(await renderClaimForm(sample({ diagnosis }), assets))
    const field = assets.layout.fields.diagnosis
    const diagnosisItems = pages[0].filter((it) => it.x >= field.x - 1 && it.y <= field.lineYs[0] + 1 && it.y >= field.lineYs[field.lineYs.length - 1] - 10)
    expect(normalize(diagnosisItems.map((it) => it.str).join(' '))).toBe(normalize(diagnosis))
    for (const item of diagnosisItems) {
      expect(item.x + item.width, item.str).toBeLessThanOrEqual(field.x + field.maxWidth + 0.5)
    }
  })

  it('claim-submission.form.long-values: a long facility name is shrunk to stay inside its field', async () => {
    const facilityName = 'Bệnh viện Đa khoa Quốc tế Mẫu Chi nhánh Thành phố Mẫu Tầng ba Khu B Toà nhà Đông'
    const pages = await pagesOf(await renderClaimForm(sample({ facilityName }), assets))
    const field = assets.layout.fields.facilityName
    const items = pages[0].filter((it) => it.y > field.y - 3 && it.y < field.y + 14 && it.x >= field.x - 1)
    expect(normalize(items.map((it) => it.str).join(' '))).toBe(normalize(facilityName))
    for (const item of items) expect(item.x + item.width).toBeLessThanOrEqual(field.x + field.maxWidth + 0.5)
  })

  it('claim-submission.form.blank-template: the shipped template has the form labels and no person data', async () => {
    const template = await pagesOf(assets.template)
    const text = template.map(pageText).join('\n')
    expect(text).toContain('Policyholder')
    expect(text).toContain('Name of the Patient')
    expect(text).toContain('SPECIFICATION OF MEDICAL EXPENSES')
    expect(text).not.toMatch(/\d{5,}\/HD\//)
    expect(text).not.toMatch(/Công\s+Ty/)
    expect(text).not.toContain('@')
  })

  it('claim-submission.form.blank-template: a blank claim writes nothing on top of the template', async () => {
    const blank = sample({
      reason: null, policyholderName: null, contractCode: null, patientName: null, patientDob: null, patientTier: null,
      patientPhone: null, employeeName: null, employeeCode: null, jobTitle: null, employeeEmail: null, accountNumber: null,
      bankName: null, beneficiary: null, visitDate: null, diagnosis: null, facilityName: null, expenses: [], totalAmount: 0,
      totalAmountText: '0', totalWords: null,
    })
    // "Số ngày nghỉ" defaults to 0 and is the only value a blank claim writes.
    const filled = await pagesOf(await renderClaimForm(blank, assets))
    const template = await pagesOf(assets.template)
    const withoutDaysOff = (pages: TextItem[][]) => pages.map((items) => items.filter((it) => it.str !== '0'))
    expect(withoutDaysOff(filled).map(pageText)).toEqual(withoutDaysOff(template).map(pageText))
    expect(filled[0].filter((it) => it.str === '0')).toHaveLength(1)
  })

  it('claim-submission.form.blank-template: the signature band stays blank on a filled form', async () => {
    // Signature and date boxes sit between y 140 and 185 pt on page 1 of the template; nothing may be written there.
    const band = (items: TextItem[]) => items.filter((it) => it.y >= 140 && it.y <= 185).map((it) => it.str)
    const filled = await pagesOf(await renderClaimForm(sample(), assets))
    const template = await pagesOf(assets.template)
    expect(band(filled[0])).toEqual(band(template[0]))
    expect(band(template[0]).length).toBeGreaterThan(0)
  })

  it('claim-submission.form.preview: rendering uses only the bytes it is given and makes no network request', async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('network is not allowed')
    })
    vi.stubGlobal('fetch', fetchSpy)
    const bytes = await renderClaimForm(sample(), assets)
    expect(bytes.byteLength).toBeGreaterThan(1000)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('claim-submission.form.preview: loadFormAssets reads the four precached public files', async () => {
    const requested: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      requested.push(url)
      const path = url.replace(/^\/+/, '')
      const body = readFileSync(ROOT + 'public/' + path)
      return {
        ok: true,
        arrayBuffer: async () => new Uint8Array(body).buffer,
        json: async () => JSON.parse(body.toString('utf8')),
      }
    })
    const loaded = await loadFormAssets('/')
    expect(requested.sort()).toEqual([
      '/fonts/NotoSans-Bold.ttf',
      '/fonts/NotoSans-Regular.ttf',
      '/forms/gyc-fields.json',
      '/forms/gyc-template.pdf',
    ])
    expect(loaded.template.byteLength).toBe(assets.template.byteLength)
    expect(loaded.layout.table.rowsPerPage).toBe(assets.layout.table.rowsPerPage)
  })
})
