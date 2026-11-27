import { describe, expect, it } from 'vitest'
import {
  benefitsFor,
  formatBenefit,
  pickPolicyYear,
} from '../../src/domain/benefits'
import { parseBenefits, type Benefit, type BenefitsDataset } from '../../src/domain/benefits-schema'
import fixture from '../fixtures/benefits-2026.json'

function dataset(json: unknown): BenefitsDataset {
  const result = parseBenefits(json)
  if (!result.ok) throw new Error(`fixture invalid: ${result.error}`)
  return result.data
}

const base = dataset(fixture)

function withYear(year: number, from: string, to: string): BenefitsDataset {
  return { ...base, policyYear: year, effectiveFrom: from, effectiveTo: to }
}

function benefit(id: string): Benefit {
  const found = base.benefits.find((b) => b.id === id)
  if (!found) throw new Error(`no benefit ${id} in fixture`)
  return found
}

describe('benefits.year.by-date', () => {
  const y2025 = withYear(2025, '2025-01-01', '2025-12-31')
  const y2026 = withYear(2026, '2026-01-01', '2026-12-31')

  it('benefits.year.by-date: 2026-03-15 applies policy year 2026', () => {
    expect(pickPolicyYear([y2025, y2026], '2026-03-15')?.policyYear).toBe(2026)
  })

  it('benefits.year.by-date: the first and last day of a range are inside it', () => {
    expect(pickPolicyYear([y2025, y2026], '2026-01-01')?.policyYear).toBe(2026)
    expect(pickPolicyYear([y2025, y2026], '2026-12-31')?.policyYear).toBe(2026)
    expect(pickPolicyYear([y2025, y2026], '2025-01-01')?.policyYear).toBe(2025)
    expect(pickPolicyYear([y2025, y2026], '2025-12-31')?.policyYear).toBe(2025)
  })

  it('benefits.year.by-date: the day after a range end is outside it', () => {
    expect(pickPolicyYear([y2025], '2026-01-01')).toBeNull()
  })
})

describe('benefits.year.none', () => {
  it('benefits.year.none: returns null when no policy year covers 2027-02-01', () => {
    expect(pickPolicyYear([base], '2027-02-01')).toBeNull()
  })

  it('benefits.year.none: returns null when there are no datasets', () => {
    expect(pickPolicyYear([], '2026-03-15')).toBeNull()
  })
})

describe('benefits.person.format', () => {
  it('benefits.person.format: employee tier 2 outpatient reads "13.000.000 đ/năm" and "3.200.000 đ/lần khám"', () => {
    expect(formatBenefit(benefit('outpatient.annual'), 2, 'employee')).toBe('13.000.000 đ/năm')
    expect(formatBenefit(benefit('outpatient.visit'), 2, 'employee')).toBe('3.200.000 đ/lần khám')
  })

  it('benefits.person.format: day unit uses /ngày and sumInsured has no suffix', () => {
    expect(formatBenefit(benefit('inpatient.hospital'), 1, 'employee')).toBe('1.000.000 đ/ngày')
    expect(formatBenefit(benefit('life.death'), 1, 'employee')).toBe('100.000.000 đ')
  })

  it('benefits.person.format: a member type without the benefit gives null', () => {
    expect(formatBenefit(benefit('optical.annual'), 1, 'sponsored')).toBeNull()
  })
})

describe('benefits.person.special-values', () => {
  it('benefits.person.special-values: "actual" reads "Chi trả thực tế đến hạn mức"', () => {
    expect(formatBenefit(benefit('inpatient.icu'), 3, 'employee')).toBe('Chi trả thực tế đến hạn mức')
  })

  it('benefits.person.special-values: a text value is shown as written', () => {
    expect(formatBenefit(benefit('accident.death'), 2, 'employee')).toBe('30 tháng lương')
  })

  it('benefits.person.special-values: a null element reads "Theo giới hạn chung"', () => {
    expect(formatBenefit(benefit('maternity.hospital'), 1, 'employee')).toBe('Theo giới hạn chung')
  })
})

describe('benefits.person.copay', () => {
  it('benefits.person.copay: a voluntary dependent carries 30% in inpatient, maternity, outpatient and dental', () => {
    const groups = benefitsFor(base, 3, 'voluntary')
    const copay = (category: string) => groups.find((g) => g.category === category)?.copayPercent
    expect(copay('inpatient')).toBe(30)
    expect(copay('maternity')).toBe(30)
    expect(copay('outpatient')).toBe(30)
    expect(copay('dental')).toBe(30)
  })

  it('benefits.person.copay: an employee has no copay in any category', () => {
    const groups = benefitsFor(base, 2, 'employee')
    expect(groups.every((g) => g.copayPercent === null)).toBe(true)
  })
})

describe('benefits.person.not-covered', () => {
  it('benefits.person.not-covered: a dependent is not covered for optical', () => {
    const optical = benefitsFor(base, 2, 'sponsored').find((g) => g.category === 'optical')
    expect(optical?.covered).toBe(false)
    expect(optical?.benefits).toEqual([])
  })

  it('benefits.person.not-covered: an employee is covered for optical', () => {
    const optical = benefitsFor(base, 2, 'employee').find((g) => g.category === 'optical')
    expect(optical?.covered).toBe(true)
    expect(optical?.benefits.map((b) => b.text)).toEqual(['600.000 đ/năm'])
  })

  it('benefits.person.not-covered: benefitsFor returns the 8 categories in fixed order', () => {
    const groups = benefitsFor(base, 1, 'voluntary')
    expect(groups.map((g) => g.category)).toEqual([
      'outpatient',
      'dental',
      'optical',
      'inpatient',
      'maternity',
      'accident',
      'life',
      'income',
    ])
  })

  it('benefits.person.not-covered: life is not covered for a voluntary dependent', () => {
    const life = benefitsFor(base, 1, 'voluntary').find((g) => g.category === 'life')
    expect(life?.covered).toBe(false)
  })
})
