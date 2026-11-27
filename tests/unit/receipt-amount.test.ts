import { describe, it, expect } from 'vitest'
import { extractTotal } from '../../src/domain/receipt-amount'
import { extractDate } from '../../src/domain/receipt-date'

// Fake receipt lines only.
const TODAY = '2026-11-27'

describe('document-ocr.extract: total amount from recognised lines', () => {
  it('document-ocr.extract.total-label: the patient-payable total beats the subtotal', () => {
    const { best, candidates } = extractTotal(['Cộng tiền hàng 2.500.000', 'Tổng tiền thanh toán: 2.718.900'])

    expect(best).toEqual({ amount: 2718900, label: 'tong tien thanh toan', confidence: 'high' })
    expect(candidates).toHaveLength(1)
  })

  it('document-ocr.extract.patient-share: the amount the patient pays is preferred over the grand total', () => {
    const { best } = extractTotal([
      'Tổng cộng 1.000.000',
      'BHYT chi trả 600.000',
      'Người bệnh phải trả 400.000',
    ])

    expect(best?.amount).toBe(400000)
    expect(best?.confidence).toBe('high')
  })

  it('document-ocr.extract.ignore: cash tendered, change, tax code and phone lines are not used', () => {
    const { best } = extractTotal([
      'Tổng cộng 450.000',
      'Tiền khách đưa 500.000',
      'Tiền thừa 50.000',
      'MST: 0100774631',
    ])

    expect(best?.amount).toBe(450000)
  })

  it('document-ocr.extract.ignore: a labelled line that holds an ignored phrase is skipped', () => {
    const { best, candidates } = extractTotal(['Tổng tiền khách đưa 500.000', 'Điện thoại 0901.234.567'])

    expect(best).toBeNull()
    expect(candidates).toEqual([])
  })

  it('document-ocr.extract.next-line: the amount on the line after the label is used', () => {
    const { best } = extractTotal(['TỔNG THANH TOÁN', '350.000 đ'])

    expect(best?.amount).toBe(350000)
    expect(best?.confidence).toBe('high')
  })

  it('document-ocr.extract.low-confidence: without a label the largest grouped amount is low confidence', () => {
    const { best, candidates } = extractTotal(['Thuốc A 120.000', 'Thuốc B 300.000'])

    expect(best).toEqual({ amount: 300000, label: '', confidence: 'low' })
    expect(candidates.map((c) => c.amount)).toEqual([300000, 120000])
  })

  it('document-ocr.extract.none: no valid amount gives no proposal and no candidates', () => {
    const result = extractTotal(['Ngày 04 tháng 10 năm 2026', 'Cảm ơn quý khách'])

    expect(result).toEqual({ best: null, candidates: [] })
  })
})

describe('document-ocr.extract: amount rules', () => {
  it('document-ocr.extract.total-label: labels match without accents and case', () => {
    expect(extractTotal(['TONG THANH TOAN 900.000']).best).toEqual({
      amount: 900000,
      label: 'tong thanh toan',
      confidence: 'high',
    })
  })

  it('document-ocr.extract.total-label: a trailing ,00 or .00 decimal part is dropped', () => {
    expect(extractTotal(['Tổng cộng 350.000,00']).best?.amount).toBe(350000)
    expect(extractTotal(['Tổng cộng 350.000.00']).best?.amount).toBe(350000)
  })

  it('document-ocr.extract.total-label: spaces are accepted as thousand separators', () => {
    expect(extractTotal(['Tổng cộng 2 718 900']).best?.amount).toBe(2718900)
  })

  it('document-ocr.extract.total-label: a number with a non-zero decimal part is not an amount', () => {
    expect(extractTotal(['Tổng cộng 1.234.567,89']).best).toBeNull()
  })

  it('document-ocr.extract.total-label: a quantity before a price is not joined into the amount', () => {
    expect(extractTotal(['Tổng cộng 1 350.000']).best?.amount).toBe(350000)
  })

  it('document-ocr.extract.total-label: ungrouped numbers are not amounts', () => {
    expect(extractTotal(['Tổng cộng 450000']).best).toBeNull()
  })

  it('document-ocr.extract.total-label: amounts outside 1.000 to 1.000.000.000 are not used', () => {
    expect(extractTotal(['Tổng cộng 999']).best).toBeNull()
    expect(extractTotal(['Tổng cộng 1.000.000.001']).best).toBeNull()
    expect(extractTotal(['Tổng cộng 1.000']).best?.amount).toBe(1000)
    expect(extractTotal(['Tổng cộng 1.000.000.000']).best?.amount).toBe(1000000000)
  })

  it('document-ocr.extract.total-label: when labels tie, the amount that appears last wins', () => {
    const { best, candidates } = extractTotal(['Tổng cộng 100.000', 'Dòng khác', 'Tổng cộng 200.000'])

    expect(best?.amount).toBe(200000)
    expect(candidates.map((c) => c.amount)).toEqual([200000, 100000])
  })

  it('document-ocr.extract.total-label: a thanh tien label is low confidence', () => {
    expect(extractTotal(['Thành tiền 500.000']).best).toEqual({ amount: 500000, label: 'thanh tien', confidence: 'low' })
  })

  it('document-ocr.extract.total-label: a higher priority label on the same line is used', () => {
    expect(extractTotal(['Tổng tiền thanh toán 700.000']).best?.label).toBe('tong tien thanh toan')
  })

  it('document-ocr.extract.ignore: tax rate and account number lines are ignored', () => {
    const { best } = extractTotal(['Thuế suất 10.000', 'Số tài khoản 123.456.789', 'Tổng cộng 60.000'])
    expect(best?.amount).toBe(60000)
  })

  it('document-ocr.extract.total-label: candidates are de-duplicated, best first', () => {
    const { candidates } = extractTotal(['Tổng cộng 300.000', 'Tổng tiền 300.000', 'Thành tiền 150.000'])

    expect(candidates).toEqual([
      { amount: 300000, label: 'tong tien', confidence: 'high' },
      { amount: 150000, label: 'thanh tien', confidence: 'low' },
    ])
  })
})

describe('document-ocr.extract.date: document date from recognised lines', () => {
  it('document-ocr.extract.date: "Ngày dd tháng mm năm yyyy" gives YYYY-MM-DD', () => {
    expect(extractDate(['Ngày 04 tháng 10 năm 2026'], TODAY)).toBe('2026-10-04')
  })

  it('document-ocr.extract.date: dd/mm/yyyy and dd-mm-yyyy are read', () => {
    expect(extractDate(['Ngày lập: 04/10/2026'], TODAY)).toBe('2026-10-04')
    expect(extractDate(['04-10-2026'], TODAY)).toBe('2026-10-04')
  })

  it('document-ocr.extract.date: the words format wins over a numeric date on another line', () => {
    expect(extractDate(['04/10/2026', 'Ngày 05 tháng 10 năm 2026'], TODAY)).toBe('2026-10-05')
  })

  it('document-ocr.extract.date: future dates are ignored', () => {
    expect(extractDate(['Ngày 01 tháng 12 năm 2026'], TODAY)).toBeNull()
    expect(extractDate(['Ngày 01 tháng 12 năm 2026', '27/11/2026'], TODAY)).toBe('2026-11-27')
  })

  it('document-ocr.extract.date: a date of birth line is ignored', () => {
    expect(extractDate(['Ngày sinh: 01/01/1990'], TODAY)).toBeNull()
    expect(extractDate(['Ngày sinh: 01/01/1990', '04/10/2026'], TODAY)).toBe('2026-10-04')
  })

  it('document-ocr.extract.date: impossible calendar dates are ignored', () => {
    expect(extractDate(['31/02/2026'], TODAY)).toBeNull()
    expect(extractDate(['Ngày 32 tháng 10 năm 2026'], TODAY)).toBeNull()
  })

  it('document-ocr.extract.date: no date gives null', () => {
    expect(extractDate(['Tổng cộng 450.000'], TODAY)).toBeNull()
  })
})
