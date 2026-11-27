import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runRefresh } from '../../scripts/refresh-facilities.mjs'
import {
  buildFacilities,
  collectFacilities,
  facilityId,
  normalizeRecord,
  sortFacilities,
} from '../../scripts/lib/facilities.mjs'

// Unit tests never touch the network: fetch and sleep are injected.
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function rawRecord(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Bệnh viện Bạch Mai',
    nameEn: 'BACH MAI HOSPITAL',
    phoneNumber: '0969 851 616',
    address: 'Số 78 Giải Phóng, Phương Mai, Thành phố Hà Nội',
    timeReceiveGuarantee: 'T2-6, 7h-11:30',
    medicalSpecialty: 'Đa khoa',
    inpatientGuarantee: { code: 'NVCN028.1', name: 'Có bảo lãnh' },
    outpatientGuarantee: { code: 'NVCN032.2', name: 'Không bảo lãnh' },
    dentalGuarantee: { code: 'NVCN030.1', name: 'Có bảo lãnh' },
    blacklist: { code: 'PLC040.0', name: 'Không thuộc Blacklist' },
    isPtiGuarantee: { code: 'NVCN031.1', name: 'Có bảo lãnh' },
    ...overrides,
  }
}

describe('data-refresh.normalize.codes', () => {
  it('data-refresh.normalize.codes: maps guarantee codes to booleans and PLC040.0 to not blacklisted', () => {
    const facility = normalizeRecord(rawRecord(), { code: '01', name: 'Thành phố Hà Nội' })

    expect(facility.inpatient).toBe(true)
    expect(facility.outpatient).toBe(false)
    expect(facility.dental).toBe(true)
    expect(facility.blacklisted).toBe(false)
    expect(facility.network).toBe('pti')
  })

  it('data-refresh.normalize.codes: PLC040.1 marks the facility as blacklisted', () => {
    const facility = normalizeRecord(
      rawRecord({ blacklist: { code: 'PLC040.1', name: 'Blacklist' } }),
      null,
    )

    expect(facility.blacklisted).toBe(true)
  })

  it('data-refresh.normalize.codes: unknown codes are false, not errors', () => {
    const facility = normalizeRecord(
      rawRecord({
        inpatientGuarantee: { code: 'NVCN999.9' },
        outpatientGuarantee: null,
        dentalGuarantee: undefined,
      }),
      null,
    )

    expect(facility.inpatient).toBe(false)
    expect(facility.outpatient).toBe(false)
    expect(facility.dental).toBe(false)
  })
})

describe('data-refresh.normalize.stable-id', () => {
  it('data-refresh.normalize.stable-id: same facility with extra spaces and other letter case gets the same id', () => {
    const a = normalizeRecord(rawRecord({ address: 'Số 78 Giải Phóng, Phương Mai' }), null)
    const b = normalizeRecord(rawRecord({ address: '  số 78   giải phóng,  PHƯƠNG MAI  ' }), null)

    expect(a.id).toBe(b.id)
    expect(a.id).toMatch(/^f-[0-9a-f]{12}$/)
    expect(facilityId('Bệnh viện Bạch Mai', 'Số 78 Giải Phóng, Phương Mai')).toBe(a.id)
  })

  it('data-refresh.normalize.stable-id: the same facility returned twice is output once', () => {
    const once = normalizeRecord(rawRecord({ address: 'Số 78 Giải Phóng' }), { code: '01', name: 'Hà Nội' })
    const again = normalizeRecord(rawRecord({ address: '  SỐ 78   giải phóng ' }), { code: '01', name: 'Hà Nội' })

    const out = buildFacilities([
      { raw: rawRecord({ address: 'Số 78 Giải Phóng' }), province: { code: '01', name: 'Hà Nội' } },
      { raw: rawRecord({ address: '  SỐ 78   giải phóng ' }), province: { code: '01', name: 'Hà Nội' } },
    ])

    expect(again.id).toBe(once.id)
    expect(out).toHaveLength(1)
  })

  it('data-refresh.normalize.stable-id: text fields are trimmed and empty optional fields become null', () => {
    const facility = normalizeRecord(
      rawRecord({ name: '  Phòng khám A  ', nameEn: '   ', phoneNumber: '', medicalSpecialty: null }),
      null,
    )

    expect(facility.name).toBe('Phòng khám A')
    expect(facility.nameEn).toBeNull()
    expect(facility.phone).toBeNull()
    expect(facility.specialty).toBeNull()
  })
})

describe('data-refresh.normalize.deterministic', () => {
  it('data-refresh.normalize.deterministic: two orders of the same responses give identical output', async () => {
    const records = [
      rawRecord({ name: 'Bệnh viện B', address: 'Địa chỉ 2' }),
      rawRecord({ name: 'Bệnh viện A', address: 'Địa chỉ 1' }),
      rawRecord({ name: 'Phòng khám C', address: 'Địa chỉ 3', blacklist: { code: 'PLC040.1' } }),
    ]
    const provinces = [
      { code: '01', name: 'Thành phố Hà Nội' },
      { code: '79', name: 'Thành phố Hồ Chí Minh' },
    ]
    const run = (order: 'asc' | 'desc') =>
      collectFacilities(fakeApi({ provinces, records, order }), { delayMs: 500, sleep: async () => {} })

    const first = await run('asc')
    const second = await run('desc')

    expect(second).toEqual(first)
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })

  it('data-refresh.normalize.deterministic: output is sorted by province code then name, unknown province last', () => {
    const list = buildFacilities([
      { raw: rawRecord({ name: 'Z', address: 'a' }), province: null },
      { raw: rawRecord({ name: 'B', address: 'b' }), province: { code: '79', name: 'HCM' } },
      { raw: rawRecord({ name: 'A', address: 'c' }), province: { code: '79', name: 'HCM' } },
      { raw: rawRecord({ name: 'C', address: 'd' }), province: { code: '01', name: 'HN' } },
    ])

    expect(list.map((f) => f.name)).toEqual(['C', 'A', 'B', 'Z'])
    expect(sortFacilities([...list].reverse()).map((f) => f.name)).toEqual(['C', 'A', 'B', 'Z'])
  })
})

describe('data-refresh.fetch.province', () => {
  it('data-refresh.fetch.province: a facility returned by the province=01 query gets provinceCode 01 and its name', async () => {
    const api = fakeApi({
      provinces: [{ code: '01', name: 'Thành phố Hà Nội' }],
      records: [rawRecord({ name: 'Bệnh viện Bạch Mai' })],
      provinceFor: { 'Bệnh viện Bạch Mai': '01' },
    })

    const { facilities } = await collectFacilities(api, { delayMs: 500, sleep: async () => {} })

    const bachMai = facilities.find((f: { name: string }) => f.name === 'Bệnh viện Bạch Mai')
    expect(bachMai).toMatchObject({ provinceCode: '01', provinceName: 'Thành phố Hà Nội' })
  })

  it('data-refresh.fetch.province: a facility only in the unfiltered query gets provinceCode null', async () => {
    const api = fakeApi({
      provinces: [{ code: '01', name: 'Thành phố Hà Nội' }],
      records: [rawRecord({ name: 'Phòng khám Lạ' })],
      provinceFor: {},
    })

    const { facilities } = await collectFacilities(api, { delayMs: 500, sleep: async () => {} })

    const lone = facilities.find((f: { name: string }) => f.name === 'Phòng khám Lạ')
    expect(lone).toMatchObject({ provinceCode: null, provinceName: null })
  })
})

/**
 * Fake PTI API. The province codebook answers `/query`; search answers by query string:
 * an unfiltered query returns every record; `province=<code>` returns records mapped to that code.
 * Blacklisted records are returned only for `blacklist=PLC040.1` queries, others for `PLC040.0`.
 */
function fakeApi({
  provinces,
  records,
  provinceFor = {},
  order = 'asc',
}: {
  provinces: { code: string; name: string }[]
  records: Record<string, unknown>[]
  provinceFor?: Record<string, string>
  order?: 'asc' | 'desc'
}): FetchLike {
  const ordered = order === 'asc' ? [...records] : [...records].reverse()
  return async (url) => {
    const u = new URL(url)
    if (u.pathname.endsWith('/query')) {
      return jsonResponse({ content: provinces.map((p) => ({ ...p, children: [] })), totalPages: 1 })
    }
    const province = u.searchParams.get('province')
    const blacklist = u.searchParams.get('blacklist')
    const direct = u.searchParams.get('isPtiGuarantee') === 'NVCN031.1'
    let matched = ordered.filter((r) => {
      const isBlack = (r.blacklist as { code: string }).code === 'PLC040.1'
      if (blacklist === 'PLC040.1') return isBlack
      if (blacklist === 'PLC040.0') return !isBlack && direct
      return false
    })
    if (province !== null) {
      matched = matched.filter((r) => provinceFor[r.name as string] === province)
    }
    return jsonResponse({ data: matched, pageIndex: 1, pageSize: 100, totalElements: matched.length, totalPages: 1 })
  }
}

describe('data-refresh.safety.drop', () => {
  it('data-refresh.safety.drop: a direct-billing drop above 30% exits 1 and leaves pti.json and manifest.json untouched', async () => {
    const dir = tempDir()
    const seeded = await seed(dir, directRecords(10))
    const before = readFileSync(seeded.out, 'utf8')
    const manifestBefore = readFileSync(seeded.manifest, 'utf8')

    const result = await runRefresh({
      ...paths(dir),
      fetchImpl: fakeApi({ provinces: [], records: directRecords(6) }),
      sleep: async () => {},
      now: NOW_LATER,
    })

    expect(result.code).toBe(1)
    expect(result.summary).toMatch(/30|giảm/)
    expect(readFileSync(seeded.out, 'utf8')).toBe(before)
    expect(readFileSync(seeded.manifest, 'utf8')).toBe(manifestBefore)
  })

  it('data-refresh.safety.drop: a drop of exactly 30% or less is accepted', async () => {
    const dir = tempDir()
    await seed(dir, directRecords(10))

    const result = await runRefresh({
      ...paths(dir),
      fetchImpl: fakeApi({ provinces: [], records: directRecords(7) }),
      sleep: async () => {},
      now: NOW_LATER,
    })

    expect(result.code).toBe(0)
  })

  it('data-refresh.safety.drop: a facility without a name aborts with exit 1 and no write', async () => {
    const dir = tempDir()
    const seeded = await seed(dir, directRecords(3))
    const before = readFileSync(seeded.out, 'utf8')

    const result = await runRefresh({
      ...paths(dir),
      fetchImpl: fakeApi({ provinces: [], records: [...directRecords(3), rawRecord({ name: '   ' })] }),
      sleep: async () => {},
      now: NOW_LATER,
    })

    expect(result.code).toBe(1)
    expect(readFileSync(seeded.out, 'utf8')).toBe(before)
  })
})

describe('data-refresh.timezone.vn', () => {
  it('data-refresh.timezone.vn: manifest updatedAt and version month use the Asia/Ho_Chi_Minh date', async () => {
    const dir = tempDir()
    await seed(dir, directRecords(4))

    // 2026-11-30T20:00Z is already 2026-12-01 in Ho Chi Minh City (UTC+7).
    const result = await runRefresh({
      ...paths(dir),
      fetchImpl: fakeApi({ provinces: [], records: directRecords(5) }),
      sleep: async () => {},
      now: new Date('2026-11-30T20:00:00Z'),
    })

    expect(result.code).toBe(0)
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
    expect(manifest.datasets.facilities.updatedAt).toBe('2026-12-01')
    expect(manifest.datasets.facilities.version).toBe('2026-12')
  })
})

describe('data-refresh.summary.changes', () => {
  it('data-refresh.summary.changes: adding 3 and removing 1 writes changes 3/1/0 and lists the 4 names', async () => {
    const dir = tempDir()
    await seed(dir, directRecords(4)) // H0..H3

    const next = [...directRecords(4).slice(1), rawRecord({ name: 'Mới 1' }), rawRecord({ name: 'Mới 2' }), rawRecord({ name: 'Mới 3' })]
    const result = await runRefresh({
      ...paths(dir),
      fetchImpl: fakeApi({ provinces: [], records: next }),
      sleep: async () => {},
      now: NOW_LATER,
    })

    expect(result.code).toBe(0)
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
    expect(manifest.datasets.facilities.changes).toEqual({ added: 3, removed: 1, changed: 0 })
    expect(manifest.datasets.facilities.updatedAt).toBe('2026-11-27')
    expect(manifest.datasets.facilities.version).toBe('2026-11.2')
    expect(manifest.datasets.facilities.files).toEqual(['facilities/pti.json'])
    expect(manifest.datasets.benefits).toBeDefined()
    for (const name of ['Mới 1', 'Mới 2', 'Mới 3', 'H0']) {
      expect(result.summary).toContain(name)
    }
  })

  it('data-refresh.summary.changes: a changed field counts as changed, not added or removed', async () => {
    const dir = tempDir()
    await seed(dir, directRecords(4))

    const next = directRecords(4).map((r) => (r.name === 'H1' ? { ...r, timeReceiveGuarantee: 'Mới' } : r))
    await runRefresh({
      ...paths(dir),
      fetchImpl: fakeApi({ provinces: [], records: next }),
      sleep: async () => {},
      now: NOW_LATER,
    })

    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
    expect(manifest.datasets.facilities.changes).toEqual({ added: 0, removed: 0, changed: 1 })
  })

  it('data-refresh.summary.changes: --dry-run prints the summary but writes nothing', async () => {
    const dir = tempDir()
    const seeded = await seed(dir, directRecords(4))
    const before = readFileSync(seeded.out, 'utf8')
    const manifestBefore = readFileSync(seeded.manifest, 'utf8')

    const result = await runRefresh({
      ...paths(dir),
      dryRun: true,
      fetchImpl: fakeApi({ provinces: [], records: [...directRecords(4), rawRecord({ name: 'Mới' })] }),
      sleep: async () => {},
      now: NOW_LATER,
    })

    expect(result.code).toBe(0)
    expect(result.summary).toContain('Mới')
    expect(readFileSync(seeded.out, 'utf8')).toBe(before)
    expect(readFileSync(seeded.manifest, 'utf8')).toBe(manifestBefore)
  })

  it('data-refresh.summary.changes: appends the summary to GITHUB_STEP_SUMMARY when it is set', async () => {
    const dir = tempDir()
    await seed(dir, directRecords(4))
    const stepSummary = join(dir, 'step-summary.md')

    await runRefresh({
      ...paths(dir),
      env: { GITHUB_STEP_SUMMARY: stepSummary },
      fetchImpl: fakeApi({ provinces: [], records: [...directRecords(4), rawRecord({ name: 'Mới' })] }),
      sleep: async () => {},
      now: NOW_LATER,
    })

    expect(readFileSync(stepSummary, 'utf8')).toContain('Mới')
  })
})

describe('data-refresh.summary.no-change', () => {
  it('data-refresh.summary.no-change: identical API data leaves pti.json and manifest.json byte-identical', async () => {
    const dir = tempDir()
    const seeded = await seed(dir, directRecords(4))
    const before = readFileSync(seeded.out, 'utf8')
    const manifestBefore = readFileSync(seeded.manifest, 'utf8')

    const result = await runRefresh({
      ...paths(dir),
      fetchImpl: fakeApi({ provinces: [], records: directRecords(4) }),
      sleep: async () => {},
      now: NOW_LATER,
    })

    expect(result.code).toBe(0)
    expect(result.summary).toMatch(/không có thay đổi/i)
    expect(readFileSync(seeded.out, 'utf8')).toBe(before)
    expect(readFileSync(seeded.manifest, 'utf8')).toBe(manifestBefore)
  })
})

// ---- helpers for the refresh CLI tests ----

const NOW = new Date('2026-11-26T02:00:00Z')
const NOW_LATER = new Date('2026-11-27T02:00:00Z')

const createdDirs: string[] = []

afterEach(() => {
  for (const dir of createdDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pti-refresh-'))
  createdDirs.push(dir)
  mkdirSync(join(dir, 'facilities'), { recursive: true })
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify({ schema: 1, datasets: { benefits: { files: ['benefits/2026.json'], updatedAt: '2026-11-26', version: '2026.1' } } }, null, 2) + '\n',
  )
  return dir
}

function paths(dir: string) {
  return { out: join(dir, 'facilities', 'pti.json'), manifest: join(dir, 'manifest.json') }
}

function directRecords(n: number) {
  return Array.from({ length: n }, (_, i) => rawRecord({ name: `H${i}`, address: `Địa chỉ ${i}` }))
}

/** Runs the refresh once against `records` to create the existing files. */
async function seed(dir: string, records: Record<string, unknown>[]) {
  const result = await runRefresh({
    ...paths(dir),
    fetchImpl: fakeApi({ provinces: [], records }),
    sleep: async () => {},
    now: NOW,
  })
  expect(result.code).toBe(0)
  return paths(dir)
}
