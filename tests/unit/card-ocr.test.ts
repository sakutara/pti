import { describe, expect, it } from 'vitest'
import { applyCardFields, datesIn, parseCardText } from '../../src/domain/card-ocr'
import type { PersonInput } from '../../src/domain/types'

const TODAY = '2026-11-27'

describe('datesIn', () => {
  it('reads d/m/y with /, - and . and drops impossible dates', () => {
    expect(datesIn('01/02/1990 - 3-4-2026, 31.12.26, 31/02/2020')).toEqual(['1990-02-01', '2026-04-03', '2026-12-31'])
  })
})

describe('parseCardText', () => {
  it('card-scan.ocr.labelled: reads every labelled field on the same line', () => {
    const fields = parseCardText(
      [
        'BẢO HIỂM BƯU ĐIỆN PTI',
        'THẺ BẢO HIỂM SỨC KHỎE',
        'Họ tên/Full name: NGUYỄN VĂN THẾ',
        'Ngày sinh/DOB: 05/03/1990',
        'Số thẻ/Card No: PTI-2026-000123',
        'Số hợp đồng/Policy No: 26/HĐ/PTI/0456',
        'Công ty TNHH Ví Dụ Việt Nam',
        'Hiệu lực/Valid: 01/01/2026 - 31/12/2026',
        'Hạng: 2',
      ],
      TODAY,
    )
    expect(fields).toEqual({
      fullName: 'Nguyễn Văn Thế',
      dateOfBirth: '1990-03-05',
      cardNumber: 'PTI-2026-000123',
      contractCode: '26/HĐ/PTI/0456',
      policyholderName: 'Công ty TNHH Ví Dụ Việt Nam',
      cardValidFrom: '2026-01-01',
      cardValidTo: '2026-12-31',
      tier: 2,
    })
  })

  it('card-scan.ocr.next-line: takes the value from the next line when the label stands alone', () => {
    const fields = parseCardText(['Họ và tên', 'TRẦN THỊ BÌNH', 'Ngày sinh', '12-11-2015', 'Mã thẻ', 'A 123 456 78'], TODAY)
    expect(fields.fullName).toBe('Trần Thị Bình')
    expect(fields.dateOfBirth).toBe('2015-11-12')
    expect(fields.cardNumber).toBe('A12345678')
  })

  it('card-scan.ocr.unlabelled: falls back to an upper-case name line and a two-date validity line', () => {
    const fields = parseCardText(['PTI CARE', 'LE MINH ANH', '01/07/2026  30/06/2027'], TODAY)
    expect(fields.fullName).toBe('Le Minh Anh')
    expect(fields.cardValidFrom).toBe('2026-07-01')
    expect(fields.cardValidTo).toBe('2027-06-30')
  })

  it('card-scan.ocr.unsure: leaves out a birth date in the future and text that is not a name', () => {
    const fields = parseCardText(['Ngày sinh: 01/01/2030', 'Họ tên: 0123 456'], TODAY)
    expect(fields).toEqual({})
  })

  it('reads a roman-numeral plan and an expiry-only line', () => {
    const fields = parseCardText(['Chương trình: III', 'Ngày hết hạn: 31/12/2026'], TODAY)
    expect(fields.tier).toBe(3)
    expect(fields.cardValidTo).toBe('2026-12-31')
  })
})

describe('applyCardFields', () => {
  it('card-scan.ocr.autofill: overwrites only the fields read from the card', () => {
    const form = { fullName: 'typed', dateOfBirth: '', phone: '0909' } as unknown as PersonInput
    const next = applyCardFields(form, { fullName: 'Nguyễn A', dateOfBirth: '1990-01-01' })
    expect(next).toMatchObject({ fullName: 'Nguyễn A', dateOfBirth: '1990-01-01', phone: '0909' })
  })
})
