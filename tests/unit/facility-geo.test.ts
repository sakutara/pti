import { describe, expect, it } from 'vitest'
import type { Facility } from '../../src/domain/facilities-schema'
import { distanceKm, formatDistance, parseFacilityGeo, sortByDistance } from '../../src/domain/facility-geo'

const facility = (id: string): Facility => ({
  id,
  name: id,
  nameEn: null,
  phone: null,
  address: 'x',
  provinceCode: null,
  provinceName: null,
  hours: null,
  specialty: null,
  inpatient: true,
  outpatient: true,
  dental: false,
  blacklisted: false,
  network: 'pti',
})

const HANOI = { lat: 21.0285, lng: 105.8542 }

describe('facilities.geo', () => {
  it('distanceKm: Hà Nội to TP.HCM is about 1,140 km', () => {
    const km = distanceKm(HANOI, { lat: 10.7769, lng: 106.7009 })
    expect(km).toBeGreaterThan(1100)
    expect(km).toBeLessThan(1180)
  })

  it('facilities.nearby.sort: precise points nearest first, province centres next, unknown last', () => {
    const list = ['none', 'far', 'province', 'near'].map(facility)
    const points = {
      far: { lat: 10.7769, lng: 106.7009, by: 'name' as const },
      near: { lat: 21.03, lng: 105.85, by: 'address' as const },
      province: { lat: 21.0285, lng: 105.8542, by: 'province' as const },
    }
    const sorted = sortByDistance(list, points, HANOI)
    expect(sorted.map((r) => r.facility.id)).toEqual(['near', 'far', 'province', 'none'])
    expect(sorted[2].approximate).toBe(true)
    expect(sorted[3].km).toBeNull()
  })

  it('facilities.nearby.no-location: keeps the input order without a position', () => {
    const list = ['b', 'a'].map(facility)
    expect(sortByDistance(list, {}, null).map((r) => r.facility.id)).toEqual(['b', 'a'])
  })

  it('parseFacilityGeo skips malformed points', () => {
    const parsed = parseFacilityGeo({ points: { a: { lat: 1, lng: 2, by: 'name' }, b: { lat: 'x' }, c: { lat: 1, lng: 2, by: '?' } } })
    expect(parsed.ok && Object.keys(parsed.data.points)).toEqual(['a'])
  })

  it('formatDistance', () => {
    expect(formatDistance(0.347)).toBe('350 m')
    expect(formatDistance(1.24)).toBe('1,2 km')
    expect(formatDistance(15.6)).toBe('16 km')
  })
})
