import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDatasetCache } from '../../src/data/datasets'
import type { FacilitiesDataset, Facility } from '../../src/domain/facilities-schema'
import { refreshRoute, route } from '../../src/router'
import { FacilitiesPage } from '../../src/pages/FacilitiesPage'
import { db } from '../../src/db/db'
import { DataNotice } from '../../src/ui/DataNotice'
import { Shell } from '../../src/ui/Shell'

const base: Omit<Facility, 'id' | 'name' | 'address'> = {
  nameEn: null,
  phone: null,
  provinceCode: '01',
  provinceName: 'Thành phố Hà Nội',
  hours: null,
  specialty: null,
  inpatient: true,
  outpatient: true,
  dental: false,
  blacklisted: false,
  network: 'pti',
}

const BACH_MAI: Facility = {
  ...base,
  id: 'f-bachmai0001',
  name: 'Bệnh viện Bạch Mai',
  nameEn: 'BACH MAI HOSPITAL',
  address: 'Số 78, đường Giải Phóng, Hà Nội',
}
const XANH_PON: Facility = {
  ...base,
  id: 'f-xanhpon00002',
  name: 'BỆNH VIỆN ĐA KHOA XANH PÔN',
  address: '12 Chu Văn An, Ba Đình, Hà Nội',
}
const DONG_DA_DENTAL: Facility = {
  ...base,
  id: 'f-dongda000003',
  name: 'Phòng khám Nha Khoa Đống Đa',
  address: '5 Tôn Thất Tùng, Đống Đa, Hà Nội',
  outpatient: false,
  dental: true,
}
const SAIGON_DENTAL: Facility = {
  ...base,
  id: 'f-saigon000004',
  name: 'Nha khoa Sài Gòn',
  address: '1 Nguyễn Huệ, Quận 1, Thành phố Hồ Chí Minh',
  provinceCode: '79',
  provinceName: 'Thành phố Hồ Chí Minh',
  dental: true,
}
const EXCLUDED: Facility = {
  ...base,
  id: 'f-excluded00005',
  name: 'Bệnh viện Loại Trừ Demo',
  address: '9 Phố Huế, Hai Bà Trưng, Hà Nội',
  blacklisted: true,
}

const DATASET: FacilitiesDataset = {
  fetchedAt: '2026-11-01T02:00:00Z',
  source: 'https://example.test/pti',
  count: { directBilling: 4, blacklisted: 1 },
  provinces: [
    { code: '01', name: 'Thành phố Hà Nội' },
    { code: '79', name: 'Thành phố Hồ Chí Minh' },
  ],
  facilities: [BACH_MAI, XANH_PON, DONG_DA_DENTAL, SAIGON_DENTAL, EXCLUDED],
}

const MANIFEST = {
  schema: 1,
  datasets: {
    facilities: {
      files: ['facilities/pti.json'],
      updatedAt: '2026-11-01',
      version: '2026-11',
      changes: { added: 0, removed: 0, changed: 0 },
    },
  },
}

/** Serves the manifest and the facilities file; no other URL is expected. */
function stubFetch(dataset: unknown = DATASET, manifest: unknown = MANIFEST) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const body = url.endsWith('manifest.json') ? manifest : url.endsWith('pti.json') ? dataset : null
    if (body === null) return new Response('not found', { status: 404 })
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** Sets the hash the way a visitor's address bar would, then re-reads it into the route signal. */
function openHash(hash: string) {
  location.hash = hash
  refreshRoute()
}

/** Names (first span of each result link, without the address) of the results currently listed. */
function resultNames(): string[] {
  return screen
    .queryAllByRole('link')
    .filter((link) => (link.getAttribute('href') ?? '').startsWith('#/facilities/'))
    .map((link) => link.querySelector('span')?.textContent ?? '')
}

beforeEach(() => {
  resetDatasetCache()
  stubFetch()
  openHash('#/facilities')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  openHash('#/')
})

describe('facilities.search.diacritics', () => {
  it('facilities.search.diacritics: "bach mai" finds "Bệnh viện Bạch Mai"', async () => {
    render(<FacilitiesPage />)
    expect(await screen.findByText('4 cơ sở')).toBeInTheDocument()

    fireEvent.input(screen.getByRole('searchbox', { name: 'Tìm theo tên hoặc địa chỉ' }), {
      target: { value: 'bach mai' },
    })

    await waitFor(() => expect(resultNames()).toEqual(['Bệnh viện Bạch Mai']))
    expect(screen.getByText('1 cơ sở')).toBeInTheDocument()
  })

  it('facilities.search.diacritics: typing waits 150 ms and replaces the history entry instead of pushing one per keystroke', async () => {
    const push = vi.spyOn(history, 'pushState')
    render(<FacilitiesPage />)
    await screen.findByText('4 cơ sở')
    const input = screen.getByRole('searchbox', { name: 'Tìm theo tên hoặc địa chỉ' })

    fireEvent.input(input, { target: { value: 'b' } })
    fireEvent.input(input, { target: { value: 'ba' } })
    fireEvent.input(input, { target: { value: 'bach' } })
    expect(location.hash).toBe('#/facilities')

    await waitFor(() => expect(location.hash).toBe('#/facilities?q=bach'))
    expect(push).not.toHaveBeenCalled()
  })
})

describe('facilities.search.combined', () => {
  it('facilities.search.combined: province Hà Nội and nha khoa leaves exactly one facility and reads "1 cơ sở"', async () => {
    render(<FacilitiesPage />)
    await screen.findByText('4 cơ sở')

    fireEvent.change(screen.getByLabelText('Tỉnh/thành'), { target: { value: '01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Nha khoa' }))

    expect(await screen.findByText('1 cơ sở')).toBeInTheDocument()
    expect(resultNames()).toEqual(['Phòng khám Nha Khoa Đống Đa'])
    expect(screen.getByRole('button', { name: 'Nha khoa' })).toHaveAttribute('aria-pressed', 'true')
    expect(location.hash).toBe('#/facilities?p=01&s=dental')
  })

  it('facilities.search.combined: filters in the hash query are applied on open', async () => {
    openHash('#/facilities?p=79&s=dental')
    render(<FacilitiesPage />)

    expect(await screen.findByText('1 cơ sở')).toBeInTheDocument()
    expect(resultNames()).toEqual(['Nha khoa Sài Gòn'])
  })
})

describe('facilities.search.empty', () => {
  it('facilities.search.empty: no match says so and offers a reset that clears the filters', async () => {
    openHash('#/facilities?q=zzzz')
    render(<FacilitiesPage />)

    expect(await screen.findByText('Không có cơ sở nào khớp bộ lọc.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Đặt lại bộ lọc' }))

    expect(await screen.findByText('4 cơ sở')).toBeInTheDocument()
    expect(location.hash).toBe('#/facilities')
  })
})

describe('facilities.blacklist.view', () => {
  it('facilities.blacklist.view: the excluded view lists only blacklisted facilities under the warning', async () => {
    render(<FacilitiesPage />)
    await screen.findByText('4 cơ sở')

    const toggle = screen.getByRole('button', { name: 'Cơ sở loại trừ' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)

    expect(await screen.findByText('1 cơ sở')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cơ sở loại trừ' })).toHaveAttribute('aria-pressed', 'true')
    expect(resultNames()).toEqual(['Bệnh viện Loại Trừ Demo'])
    expect(screen.getByText(/PTI không chi trả chi phí khám, điều trị tại các cơ sở loại trừ/)).toBeInTheDocument()
    expect(location.hash).toBe('#/facilities?v=blacklist')
  })
})

describe('facilities.blacklist.separate', () => {
  it('facilities.blacklist.separate: the default view never lists a blacklisted facility', async () => {
    render(<FacilitiesPage />)
    await screen.findByText('4 cơ sở')

    expect(resultNames()).not.toContain('Bệnh viện Loại Trừ Demo')
    expect(screen.queryByText(/PTI không chi trả chi phí khám/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Cơ sở loại trừ' })).toHaveAttribute('aria-pressed', 'false')
  })
})

/** DD/MM/YYYY of an instant on the device's local calendar, so the expectation holds in any timezone. */
function localDdMmYyyy(iso: string): string {
  const local = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(local.getDate())}/${pad(local.getMonth() + 1)}/${local.getFullYear()}`
}

describe('facilities.freshness.date', () => {
  it('facilities.freshness.date: shows the fetch date and a call-first note', async () => {
    render(<FacilitiesPage />)

    expect(await screen.findByText(`Dữ liệu PTI cập nhật ngày ${localDdMmYyyy(DATASET.fetchedAt)}`)).toBeInTheDocument()
    expect(screen.getByText('Nên gọi điện xác nhận với cơ sở trước khi đến khám.')).toBeInTheDocument()
  })

  it('facilities.freshness.date: uses the device-local date of fetchedAt, not its UTC date', async () => {
    // 20:00Z is the next day in UTC+7 and the same day in UTC-5, so the expected text follows the local clock.
    const fetchedAt = '2026-11-01T20:00:00Z'
    stubFetch({ ...DATASET, fetchedAt })
    render(<FacilitiesPage />)

    expect(await screen.findByText(`Dữ liệu PTI cập nhật ngày ${localDdMmYyyy(fetchedAt)}`)).toBeInTheDocument()
  })
})

describe('facilities.layout.narrow', () => {
  it('facilities.layout.narrow: the filter button opens a dialog and shows a dot only while a filter is set', async () => {
    render(<FacilitiesPage />)
    await screen.findByText('4 cơ sở')

    const open = screen.getByRole('button', { name: 'Mở bộ lọc' })
    expect(open).toHaveAttribute('data-active', 'false')

    fireEvent.click(open)
    const sheet = screen.getByRole('dialog', { name: 'Bộ lọc' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Nội trú' }))

    expect(screen.getByRole('button', { name: 'Mở bộ lọc' })).toHaveAttribute('data-active', 'true')
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Bộ lọc' })).getByRole('button', { name: 'Đóng bộ lọc' }))
    expect(screen.queryByRole('dialog', { name: 'Bộ lọc' })).toBeNull()
  })

  it('facilities.layout.escape: Escape closes the filter sheet', async () => {
    render(<FacilitiesPage />)
    await screen.findByText('4 cơ sở')

    fireEvent.click(screen.getByRole('button', { name: 'Mở bộ lọc' }))
    expect(screen.getByRole('dialog', { name: 'Bộ lọc' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Bộ lọc' })).toBeNull()
  })
})

describe('facilities.detail.open', () => {
  it('facilities.detail.open: a result link opens its detail, keeping the filters in the link', async () => {
    openHash('#/facilities?p=01')
    render(<FacilitiesPage />)
    await screen.findByText('3 cơ sở')

    const link = screen.getByRole('link', { name: /Bệnh viện Bạch Mai/ })
    expect(link).toHaveAttribute('href', `#/facilities/${BACH_MAI.id}?p=01`)

    openHash(`#/facilities/${BACH_MAI.id}?p=01`)
    expect(await screen.findByRole('heading', { level: 2, name: 'Bệnh viện Bạch Mai' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Quay lại danh sách' })).toBeInTheDocument()
    expect(route.value.params).toEqual({ id: BACH_MAI.id })
  })

  it('facilities.detail.open: an unknown id says the facility was not found', async () => {
    openHash('#/facilities/f-missing00000')
    render(<FacilitiesPage />)

    expect(await screen.findByText('Không tìm thấy cơ sở này')).toBeInTheDocument()
  })
})

describe('facilities.search.empty (load)', () => {
  it('facilities.search.empty: a failed dataset load shows the error instead of a list', async () => {
    stubFetch(null, MANIFEST)
    render(<FacilitiesPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được danh sách cơ sở y tế')
  })
})

const NOTICE = 'Danh sách cơ sở y tế đã cập nhật: thêm 3, bỏ 1, thay đổi 2'

function manifestAt(version: string) {
  return {
    ...MANIFEST,
    datasets: {
      facilities: { ...MANIFEST.datasets.facilities, version, changes: { added: 3, removed: 1, changed: 2 } },
    },
  }
}

async function seedSeen(version: string) {
  await db.settings.put({ key: 'seenFacilitiesVersion', value: version, updatedAt: Date.now() })
}

describe('facilities.freshness.notice', () => {
  beforeEach(async () => {
    await db.settings.clear()
  })

  it('facilities.freshness.notice: shows the counts at startup when the bundled version is newer than the one seen', async () => {
    await seedSeen('2026-10')
    stubFetch(DATASET, manifestAt('2026-11'))
    render(<DataNotice />)

    expect(await screen.findByText(NOTICE)).toBeInTheDocument()
  })

  it('facilities.freshness.notice: the notice is shown from the Shell', async () => {
    await seedSeen('2026-10')
    stubFetch(DATASET, manifestAt('2026-11'))
    render(
      <Shell>
        <p>contenu</p>
      </Shell>,
    )

    expect(await screen.findByText(NOTICE)).toBeInTheDocument()
  })

  it('facilities.freshness.notice: after the user dismisses it, it does not show again for that version', async () => {
    await seedSeen('2026-10')
    stubFetch(DATASET, manifestAt('2026-11'))
    const first = render(<DataNotice />)
    fireEvent.click(await screen.findByRole('button', { name: 'Đóng thông báo' }))

    await waitFor(() => expect(screen.queryByText(NOTICE)).toBeNull())
    expect(await db.settings.get('seenFacilitiesVersion')).toMatchObject({ value: '2026-11' })
    first.unmount()

    render(<DataNotice />)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(screen.queryByText(NOTICE)).toBeNull()
  })

  it('facilities.freshness.notice: a first install gets no notice and only stores the bundled version', async () => {
    stubFetch(DATASET, manifestAt('2026-11'))
    render(<DataNotice />)

    await waitFor(async () => expect(await db.settings.get('seenFacilitiesVersion')).toMatchObject({ value: '2026-11' }))
    expect(screen.queryByText(NOTICE)).toBeNull()
  })

  it('facilities.freshness.notice: a failed manifest load is silent', async () => {
    await seedSeen('2026-10')
    stubFetch(DATASET, null)
    render(<DataNotice />)

    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(screen.queryByText(NOTICE)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
