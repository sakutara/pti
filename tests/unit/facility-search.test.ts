import { describe, expect, it } from 'vitest'
import { foldVi } from '../../src/lib/text'
import { parseFacilities, type Facility } from '../../src/domain/facilities-schema'
import { mapUrl, searchFacilities, splitPhones } from '../../src/domain/facility-search'

function facility(over: Partial<Facility> = {}): Facility {
  return {
    id: 'f-bachmai',
    name: 'Bệnh viện Bạch Mai',
    nameEn: 'Bach Mai Hospital',
    phone: null,
    address: '78 Đường Giải Phóng, Đống Đa, Hà Nội',
    provinceCode: 'HN',
    provinceName: 'Hà Nội',
    hours: null,
    specialty: null,
    inpatient: true,
    outpatient: true,
    dental: false,
    blacklisted: false,
    network: 'pti',
    ...over,
  }
}

const HN_A = facility({ id: 'f-a', name: 'Phòng khám A', nameEn: null, address: 'Cầu Giấy, Hà Nội', dental: false })
const HN_B = facility({ id: 'f-b', name: 'Nha khoa B', nameEn: null, address: 'Hai Bà Trưng, Hà Nội', dental: true, inpatient: false, outpatient: true })
const HN_C = facility({ id: 'f-c', name: 'Bệnh viện C', nameEn: null, address: 'Thanh Xuân, Hà Nội', dental: false })
const HCM_D = facility({ id: 'f-d', name: 'Nha khoa D', nameEn: null, address: 'Quận 1, TP. Hồ Chí Minh', provinceCode: 'HCM', provinceName: 'TP. Hồ Chí Minh', dental: true })
const BLACK_E = facility({ id: 'f-e', name: 'Phòng khám loại trừ E', nameEn: null, address: 'Hà Nội', blacklisted: true })

const ALL = [facility(), HN_A, HN_B, HN_C, HCM_D, BLACK_E]

describe('facilities.search.diacritics', () => {
  it('facilities.search.diacritics: "bach mai" matches "Bệnh viện Bạch Mai"', () => {
    const found = searchFacilities(ALL, { q: 'bach mai', blacklisted: false })
    expect(found.map((f) => f.id)).toContain('f-bachmai')
  })

  it('facilities.search.diacritics: "duong" matches the address "Đường Giải Phóng"', () => {
    const found = searchFacilities(ALL, { q: 'duong', blacklisted: false })
    expect(found.map((f) => f.id)).toContain('f-bachmai')
  })

  it('facilities.search.diacritics: matching ignores case and surrounding spaces', () => {
    const found = searchFacilities(ALL, { q: '   BACH   MAI  ', blacklisted: false })
    expect(found.map((f) => f.id)).toEqual(['f-bachmai'])
  })

  it('facilities.search.diacritics: matches the English name too', () => {
    const found = searchFacilities(ALL, { q: 'bach mai hospital', blacklisted: false })
    expect(found.map((f) => f.id)).toEqual(['f-bachmai'])
  })

  it('facilities.search.diacritics: foldVi removes marks, maps đ to d and collapses spaces', () => {
    expect(foldVi('Bạch  Mai')).toBe('bach mai')
    expect(foldVi('Đường Giải Phóng')).toBe('duong giai phong')
  })

  it('facilities.search.diacritics: an empty query returns every facility in the chosen list', () => {
    const found = searchFacilities(ALL, { q: '', blacklisted: false })
    expect(found).toHaveLength(5)
  })
})

describe('facilities.search.combined', () => {
  it('facilities.search.combined: province Hà Nội and service nha khoa leave exactly 1 facility', () => {
    const found = searchFacilities(ALL, {
      province: 'HN',
      services: ['dental'],
      blacklisted: false,
    })
    expect(found.map((f) => f.id)).toEqual(['f-b'])
  })

  it('facilities.search.combined: a service filter requires every selected service', () => {
    const found = searchFacilities(ALL, {
      province: 'HN',
      services: ['inpatient', 'dental'],
      blacklisted: false,
    })
    expect(found).toEqual([])
  })

  it('facilities.search.combined: text, province and service filters combine', () => {
    const found = searchFacilities(ALL, {
      q: 'nha khoa',
      province: 'HCM',
      services: ['dental'],
      blacklisted: false,
    })
    expect(found.map((f) => f.id)).toEqual(['f-d'])
  })

  it('facilities.search.combined: null or missing province means all provinces', () => {
    expect(searchFacilities(ALL, { province: null, blacklisted: false })).toHaveLength(5)
    expect(searchFacilities(ALL, { blacklisted: false })).toHaveLength(5)
  })

  it('facilities.search.combined: no match returns an empty list', () => {
    expect(searchFacilities(ALL, { q: 'không có', blacklisted: false })).toEqual([])
  })
})

describe('facilities.blacklist.view', () => {
  it('facilities.blacklist.view: blacklisted true lists only excluded facilities', () => {
    const found = searchFacilities(ALL, { blacklisted: true })
    expect(found.map((f) => f.id)).toEqual(['f-e'])
  })

  it('facilities.blacklist.view: the same text search applies to the excluded list', () => {
    expect(searchFacilities(ALL, { q: 'loai tru', blacklisted: true }).map((f) => f.id)).toEqual(['f-e'])
    expect(searchFacilities(ALL, { q: 'bach mai', blacklisted: true })).toEqual([])
  })
})

describe('facilities.blacklist.separate', () => {
  it('facilities.blacklist.separate: the default view never contains a blacklisted facility', () => {
    const found = searchFacilities(ALL, { blacklisted: false })
    expect(found.some((f) => f.blacklisted)).toBe(false)
    expect(found).toHaveLength(5)
  })
})

describe('facilities.detail.phones', () => {
  it('facilities.detail.phones: splits "0969 851 616 / 1900 888 866" into two numbers', () => {
    expect(splitPhones('0969 851 616 / 1900 888 866')).toEqual(['0969851616', '1900888866'])
  })

  it('facilities.detail.phones: splits on commas and semicolons and drops dots and dashes', () => {
    expect(splitPhones('024.3869.3731, 0912-345-678; 1900 888 866')).toEqual([
      '02438693731',
      '0912345678',
      '1900888866',
    ])
  })

  it('facilities.detail.phones: a missing or blank phone gives no numbers', () => {
    expect(splitPhones(null)).toEqual([])
    expect(splitPhones('  ')).toEqual([])
  })
})

describe('facilities.detail.map', () => {
  it('facilities.detail.map: mapUrl encodes the name and address into the maps search link', () => {
    const f = facility({ name: 'Bệnh viện Bạch Mai', address: '78 Giải Phóng, Đống Đa' })
    expect(mapUrl(f)).toBe(
      'https://www.google.com/maps/search/?api=1&query=' +
        encodeURIComponent('Bệnh viện Bạch Mai 78 Giải Phóng, Đống Đa'),
    )
  })
})

describe('facilities.dataset.load', () => {
  const dataset = {
    fetchedAt: '2026-11-01T02:00:00Z',
    source: 'https://example.test/api',
    count: { directBilling: 1, blacklisted: 1 },
    provinces: [{ code: 'HN', name: 'Hà Nội' }],
    facilities: [facility(), BLACK_E],
  }

  it('facilities.dataset.load: accepts a valid facilities dataset', () => {
    const result = parseFacilities(structuredClone(dataset))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.facilities).toHaveLength(2)
    expect(result.data.provinces[0]).toEqual({ code: 'HN', name: 'Hà Nội' })
  })

  it('facilities.dataset.load: rejects a non-object value without throwing', () => {
    const result = parseFacilities('nope')
    expect(result.ok).toBe(false)
  })

  it('facilities.dataset.load: rejects a facility with a non-boolean service flag', () => {
    const bad = structuredClone(dataset) as any
    bad.facilities[0].dental = 'yes'
    const result = parseFacilities(bad)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('facilities[0].dental')
  })

  it('facilities.dataset.load: rejects a duplicate facility id', () => {
    const bad = structuredClone(dataset) as any
    bad.facilities[1].id = bad.facilities[0].id
    expect(parseFacilities(bad).ok).toBe(false)
  })

  it('facilities.dataset.load: rejects a fetchedAt that is not ISO 8601 UTC', () => {
    const bad = structuredClone(dataset) as any
    bad.fetchedAt = '01/11/2026'
    expect(parseFacilities(bad).ok).toBe(false)
  })
})
