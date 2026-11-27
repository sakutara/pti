import { describe, expect, it } from 'vitest'
import { parseBenefits } from '../../src/domain/benefits-schema'
import fixture from '../fixtures/benefits-2026.json'

// Deep copy so each test can break one field without affecting the others.
function fresh(): any {
  return structuredClone(fixture)
}

describe('benefits.dataset.load', () => {
  it('benefits.dataset.load: accepts the valid fixture', () => {
    const result = parseBenefits(fresh())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.policyYear).toBe(2026)
    expect(result.data.tiers).toHaveLength(4)
    expect(result.data.benefits.length).toBeGreaterThan(0)
  })

  it('benefits.dataset.load: rejects a value that is not an object', () => {
    const result = parseBenefits('not json object')
    expect(result.ok).toBe(false)
  })
})

describe('benefits.dataset.invalid', () => {
  function expectRejected(mutate: (d: any) => void) {
    const d = fresh()
    mutate(d)
    const result = parseBenefits(d)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
  }

  it('benefits.dataset.invalid: rejects copay 150', () => {
    expectRejected((d) => {
      d.copayPercent.inpatient.voluntary = 150
    })
  })

  it('benefits.dataset.invalid: rejects a missing tier', () => {
    expectRejected((d) => {
      d.tiers = d.tiers.filter((x: { tier: number }) => x.tier !== 3)
    })
  })

  it('benefits.dataset.invalid: rejects a duplicate tier', () => {
    expectRejected((d) => {
      d.tiers[3].tier = 3
    })
  })

  it('benefits.dataset.invalid: rejects a decimal money amount', () => {
    expectRejected((d) => {
      d.benefits[0].values.employee[0] = 1000.5
    })
  })

  it('benefits.dataset.invalid: rejects a value array that is not length 4', () => {
    expectRejected((d) => {
      d.benefits[0].values.employee = [1, 2, 3]
    })
  })

  it('benefits.dataset.invalid: rejects an exclusion pointing to an unknown extension id', () => {
    expectRejected((d) => {
      d.exclusions[0].extensionIds = ['no-such-id']
    })
  })

  it('benefits.dataset.invalid: rejects a malformed date', () => {
    expectRejected((d) => {
      d.effectiveFrom = '01/01/2026'
    })
  })

  it('benefits.dataset.invalid: rejects a date that does not exist in the calendar', () => {
    expectRejected((d) => {
      d.effectiveFrom = '2026-02-30'
    })
  })

  it('benefits.dataset.invalid: rejects effectiveFrom after effectiveTo', () => {
    expectRejected((d) => {
      d.effectiveFrom = '2027-01-01'
    })
  })
})
