import { describe, expect, it } from 'vitest'
import { formatVnd } from '../../src/lib/money'

describe('benefits.person.format', () => {
  it('benefits.person.format: formats thousands with dot separators and the đ suffix', () => {
    expect(formatVnd(10000000)).toBe('10.000.000 đ')
  })

  it('benefits.person.format: formats zero as "0 đ"', () => {
    expect(formatVnd(0)).toBe('0 đ')
  })

  it('benefits.person.format: formats small amounts without separators', () => {
    expect(formatVnd(500)).toBe('500 đ')
    expect(formatVnd(16500000)).toBe('16.500.000 đ')
  })

  it('benefits.person.format: throws on a negative amount', () => {
    expect(() => formatVnd(-1)).toThrow()
  })

  it('benefits.person.format: throws on a non-integer amount', () => {
    expect(() => formatVnd(1.5)).toThrow()
  })

  it('benefits.person.format: throws on NaN and Infinity', () => {
    expect(() => formatVnd(Number.NaN)).toThrow()
    expect(() => formatVnd(Number.POSITIVE_INFINITY)).toThrow()
  })
})
