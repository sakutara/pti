import { describe, expect, it, vi } from 'vitest'
import { baseName, queriesFor, runGeocode, streetQuery, wardQuery } from '../../scripts/geocode-facilities.mjs'

const F = {
  id: 'f1',
  name: 'Bệnh viện Tim Hà Nội - CS Lạc Long Quân',
  address: 'Số 92 Trần Hưng Đạo, Phường Cửa Nam, Thành phố Hà Nội',
  provinceName: 'Thành phố Hà Nội',
}

const ok = (rows: unknown) => new Response(JSON.stringify(rows), { status: 200 })

describe('scripts/geocode-facilities', () => {
  it('builds street and base-name queries', () => {
    expect(streetQuery(F.address, F.provinceName)).toBe('92 Trần Hưng Đạo, Thành phố Hà Nội')
    expect(baseName('Bệnh viện Nội tiết Trung ương (Ngọc Hồi)')).toBe('Bệnh viện Nội tiết Trung ương')
    expect(baseName(F.name)).toBe('Bệnh viện Tim Hà Nội')
    expect(wardQuery(F.address, F.provinceName)).toBe('92 Trần Hưng Đạo, Phường Cửa Nam, Thành phố Hà Nội')
    expect(queriesFor(F).map((q) => q.by)).toEqual(['name', 'name', 'address', 'address', 'name', 'province'])
  })

  it('facilities.geo.lookup: keeps precise points, looks up new ones and retries province centres, never leaving Viet Nam', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const q = new URL(url).searchParams.get('q') ?? ''
      if (q.startsWith('Bệnh viện Tim Hà Nội - CS')) return ok([{ lat: '48.85', lon: '2.35' }]) // Paris: dropped
      if (q === 'Bệnh viện Tim Hà Nội - CS Lạc Long Quân') return ok([])
      if (q === '92 Trần Hưng Đạo, Thành phố Hà Nội') return ok([{ lat: '21.0241', lon: '105.8460' }])
      return ok([])
    })
    const previous = {
      points: {
        kept: { lat: 1, lng: 2, by: 'name', key: 'Kept|addr' },
        coarse: { lat: 21, lng: 105, by: 'province', key: 'Coarse|addr' },
        gone: { lat: 1, lng: 2, by: 'name', key: 'Gone|addr' },
      },
    }
    const result = await runGeocode({
      facilities: [
        { id: 'kept', name: 'Kept', address: 'addr', provinceName: null },
        { id: 'coarse', name: 'Coarse', address: 'addr', provinceName: null },
        F,
      ],
      previous,
      fetchImpl,
      sleep: async () => {},
    })
    expect(result.file.points.kept).toEqual(previous.points.kept)
    expect(result.file.points.gone).toBeUndefined()
    expect(result.file.points.f1).toMatchObject({ lat: 21.0241, lng: 105.846, by: 'address' })
    expect(result.file.points.coarse).toBeUndefined()
    expect(result.looked).toBe(2)
    expect(result.missing).toBe(1)
    for (const call of fetchImpl.mock.calls) expect(String(call[0])).toContain('countrycodes=vn')
  })
})
