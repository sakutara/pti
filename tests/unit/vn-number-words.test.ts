import { describe, expect, it } from 'vitest'
import { amountInWords } from '../../src/domain/vn-number-words'

describe('amountInWords', () => {
  it('claim-submission.form.words: 2718900 reads as "hai triệu bảy trăm mười tám nghìn chín trăm đồng chẵn"', () => {
    expect(amountInWords(2718900)).toBe('hai triệu bảy trăm mười tám nghìn chín trăm đồng chẵn')
  })

  it('claim-submission.form.words: 1000 reads as "một nghìn đồng chẵn"', () => {
    expect(amountInWords(1000)).toBe('một nghìn đồng chẵn')
  })

  it('claim-submission.form.words: 1005000 keeps "không trăm linh năm" inside the thousands group', () => {
    expect(amountInWords(1005000)).toBe('một triệu không trăm linh năm nghìn đồng chẵn')
  })

  it('claim-submission.form.words: 15000000 uses "mười lăm" for 15', () => {
    expect(amountInWords(15000000)).toBe('mười lăm triệu đồng chẵn')
  })

  it('claim-submission.form.words: 1000000000 reads as "một tỷ đồng chẵn"', () => {
    expect(amountInWords(1000000000)).toBe('một tỷ đồng chẵn')
  })

  it('claim-submission.form.words: 21 and 25 use "mốt" and "lăm" after tens', () => {
    expect(amountInWords(21000)).toBe('hai mươi mốt nghìn đồng chẵn')
    expect(amountInWords(25000)).toBe('hai mươi lăm nghìn đồng chẵn')
  })

  it('claim-submission.form.words: a single unit reads "một" or "năm" and a tens-free hundred block reads "linh"', () => {
    expect(amountInWords(1)).toBe('một đồng chẵn')
    expect(amountInWords(5)).toBe('năm đồng chẵn')
    expect(amountInWords(101)).toBe('một trăm linh một đồng chẵn')
  })

  it('claim-submission.form.words: rejects zero, negatives, fractions and amounts of 10^12 or more', () => {
    expect(() => amountInWords(0)).toThrow(RangeError)
    expect(() => amountInWords(-1)).toThrow(RangeError)
    expect(() => amountInWords(1.5)).toThrow(RangeError)
    expect(() => amountInWords(1e12)).toThrow(RangeError)
  })
})
