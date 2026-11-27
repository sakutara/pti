import { fireEvent, render, screen, within } from '@testing-library/preact'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/db/db'
import { createAccount } from '../../src/data/account-repo'
import { accountState, loadAccount } from '../../src/data/account-state'
import { loadDataset, loadManifest } from '../../src/data/datasets'
import { savePerson } from '../../src/data/persons-repo'
import type { PersonInput } from '../../src/domain/types'
import { BenefitsPage } from '../../src/pages/BenefitsPage'
import { HomePage } from '../../src/pages/HomePage'
import { PersonEdit } from '../../src/pages/PersonEdit'
import { route } from '../../src/router'
import { vi as messages } from '../../src/i18n/vi'
import fixture from '../fixtures/benefits-2026.json'

vi.mock('../../src/data/datasets', () => ({
  loadManifest: vi.fn(),
  loadDataset: vi.fn(),
}))
vi.mock('../../src/data/claims-summary', () => ({ countOpenClaims: vi.fn(async () => 0) }))

const TODAY = '2026-11-26'

// Every key the benefits page and its components read through t().
const BENEFIT_KEYS = [
  'benefits.title',
  'benefits.category.outpatient',
  'benefits.category.dental',
  'benefits.category.optical',
  'benefits.category.inpatient',
  'benefits.category.maternity',
  'benefits.category.accident',
  'benefits.category.life',
  'benefits.category.income',
  'benefits.unit.year',
  'benefits.unit.visit',
  'benefits.unit.day',
  'benefits.unit.case',
  'benefits.copay',
  'benefits.maxDays',
  'benefits.notCovered',
  'benefits.waiting',
  'benefits.extensions',
  'benefits.extensionLimit',
  'benefits.exclusions',
  'benefits.exception',
  'benefits.claimDeadline',
  'benefits.hotline',
  'benefits.policyYear',
  'benefits.effective',
  'benefits.accidentNote',
  'benefits.unverified',
  'benefits.unverifiedExplain',
  'benefits.error',
  'benefits.noYear',
  'benefits.noPerson',
  'benefits.compare',
  'benefits.compareColumn',
  'benefits.personLabel',
] as const

describe('benefits.person.format', () => {
  it('benefits.person.format: every benefits page string has a Vietnamese translation', () => {
    const missing = BENEFIT_KEYS.filter((key) => {
      const value = (messages as Record<string, string>)[key]
      return typeof value !== 'string' || value.trim() === ''
    })
    expect(missing).toEqual([])
  })
})

describe('benefits.verified.unverified (keys)', () => {
  it('benefits.verified.unverified: the unverified label and its explanation are translated', () => {
    expect(messages['benefits.unverified']).toBe('Chưa xác minh')
    expect(messages['benefits.unverifiedExplain']).toContain('tài liệu')
  })
})

const holderInput = (): PersonInput => ({
  role: 'holder',
  relation: 'self',
  memberType: 'employee',
  fullName: 'Nguyen Van A',
  dateOfBirth: '1990-05-01',
  idNumber: null,
  phone: null,
  email: null,
  address: null,
  employeeCode: null,
  jobTitle: null,
  tier: 2,
  policyholderName: null,
  contractCode: null,
  cardNumber: null,
  cardValidFrom: null,
  cardValidTo: null,
  bank: null,
})

const dependentInput = (): PersonInput => ({
  ...holderInput(),
  role: 'dependent',
  relation: 'child',
  memberType: 'voluntary',
  fullName: 'Nguyen Thi B',
  dateOfBirth: '2015-03-02',
  tier: 3,
})

/** Points the datasets mock at `json` (default: the fixture); loadDataset runs the real parser. */
function useDataset(json: unknown = fixture) {
  vi.mocked(loadManifest).mockResolvedValue({
    ok: true,
    data: {
      schema: 1,
      datasets: { benefits: { files: ['benefits/2026.json'], updatedAt: '2026-11-26', version: '2026.1' } },
    },
  })
  vi.mocked(loadDataset).mockImplementation((async (_path: string, parse: (j: unknown) => unknown) =>
    parse(json)) as never)
}

async function seed(): Promise<{ holderId: string; dependentId: string }> {
  const created = await createAccount(db, holderInput(), TODAY)
  if (!created.ok) throw new Error('seed holder invalid')
  const dep = await savePerson(db, created.account.id, dependentInput(), TODAY)
  if (!dep.ok) throw new Error('seed dependent invalid')
  await loadAccount(db)
  return { holderId: created.holder.id, dependentId: dep.person.id }
}

/** Sets the hash and the route signal the same way the router would. */
function openBenefits(personId?: string) {
  const path = personId ? `/benefits/${personId}` : '/benefits'
  location.hash = `#${path}`
  route.value = { path, params: personId ? { personId } : {} }
}

/** The <section> that holds a category heading. */
function sectionFor(heading: string): HTMLElement {
  const section = screen.getByRole('heading', { name: heading }).closest('section')
  if (!section) throw new Error(`no section for ${heading}`)
  return section
}

beforeEach(async () => {
  await db.transaction('rw', db.account, db.persons, db.outbox, async () => {
    await db.account.clear()
    await db.persons.clear()
    await db.outbox.clear()
  })
  accountState.value = { status: 'loading' }
  vi.clearAllMocks()
  useDataset()
  location.hash = ''
  route.value = { path: '/', params: {} }
})

describe('benefits.person.default-holder', () => {
  it('benefits.person.default-holder: without a person id the holder is selected with tier, member type and employee values', async () => {
    await seed()
    openBenefits()

    render(<BenefitsPage today={TODAY} />)

    expect(await screen.findByRole('heading', { level: 2, name: 'Nguyen Van A' })).toBeInTheDocument()
    expect(screen.getByText('Hạng 2')).toBeInTheDocument()
    expect(screen.getByText('Nhân viên')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nguyen Van A' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Nguyen Thi B' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(sectionFor('Ngoại trú')).getByText('13.000.000 đ/năm')).toBeInTheDocument()
  })
})

describe('benefits.person.switch', () => {
  it('benefits.person.switch: choosing the voluntary dependent shows tier 3, member type and 11.000.000 đ/năm', async () => {
    const { dependentId } = await seed()
    openBenefits()
    render(<BenefitsPage today={TODAY} />)
    await screen.findByRole('heading', { level: 2, name: 'Nguyen Van A' })

    fireEvent.click(screen.getByRole('button', { name: 'Nguyen Thi B' }))

    expect(await screen.findByRole('heading', { level: 2, name: 'Nguyen Thi B' })).toBeInTheDocument()
    expect(location.hash).toBe(`#/benefits/${dependentId}`)
    expect(screen.getByRole('button', { name: 'Nguyen Thi B' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Hạng 3')).toBeInTheDocument()
    expect(screen.getByText('Người thân tự nguyện')).toBeInTheDocument()
    expect(within(sectionFor('Ngoại trú')).getByText('11.000.000 đ/năm')).toBeInTheDocument()
  })
})

describe('benefits.person.format', () => {
  it('benefits.person.format: employee of tier 2 reads outpatient annual and per-visit amounts', async () => {
    await seed()
    openBenefits()
    render(<BenefitsPage today={TODAY} />)

    await screen.findByRole('heading', { level: 2, name: 'Nguyen Van A' })
    const outpatient = sectionFor('Ngoại trú')
    expect(within(outpatient).getByText('13.000.000 đ/năm')).toBeInTheDocument()
    expect(within(outpatient).getByText('3.200.000 đ/lần khám')).toBeInTheDocument()
  })

  it('benefits.person.format: accident and death groups tell the reader to contact PTI directly', async () => {
    await seed()
    openBenefits()
    render(<BenefitsPage today={TODAY} />)
    await screen.findByRole('heading', { level: 2, name: 'Nguyen Van A' })

    expect(within(sectionFor('Tai nạn')).getByText('Hồ sơ tai nạn và tử vong liên hệ trực tiếp PTI')).toBeInTheDocument()
    expect(within(sectionFor('Sinh mạng')).getByText('Hồ sơ tai nạn và tử vong liên hệ trực tiếp PTI')).toBeInTheDocument()
  })
})

describe('benefits.person.copay', () => {
  it('benefits.person.copay: a voluntary dependent sees the co-pay in every group that has one', async () => {
    const { dependentId } = await seed()
    openBenefits(dependentId)
    render(<BenefitsPage today={TODAY} />)
    await screen.findByRole('heading', { level: 2, name: 'Nguyen Thi B' })

    expect(within(sectionFor('Nội trú')).getByText('Đồng chi trả 30%')).toBeInTheDocument()
    expect(screen.getAllByText('Đồng chi trả 30%')).toHaveLength(4)
  })

  it('benefits.person.copay: an employee sees no co-pay', async () => {
    await seed()
    openBenefits()
    render(<BenefitsPage today={TODAY} />)
    await screen.findByRole('heading', { level: 2, name: 'Nguyen Van A' })

    expect(screen.queryByText(/Đồng chi trả/)).not.toBeInTheDocument()
  })
})

describe('benefits.person.special-values', () => {
  it('benefits.person.special-values: "actual" and text values are shown as words', async () => {
    await seed()
    openBenefits()
    render(<BenefitsPage today={TODAY} />)
    await screen.findByRole('heading', { level: 2, name: 'Nguyen Van A' })

    expect(within(sectionFor('Nội trú')).getByText('Chi trả thực tế đến hạn mức')).toBeInTheDocument()
    expect(within(sectionFor('Tai nạn')).getByText('30 tháng lương')).toBeInTheDocument()
  })
})

describe('benefits.person.not-covered', () => {
  it('benefits.person.not-covered: a dependent sees "Không có quyền lợi này" for optical', async () => {
    const { dependentId } = await seed()
    openBenefits(dependentId)
    render(<BenefitsPage today={TODAY} />)
    await screen.findByRole('heading', { level: 2, name: 'Nguyen Thi B' })

    expect(within(sectionFor('Mắt (kính)')).getByText('Không có quyền lợi này')).toBeInTheDocument()
  })

  it('benefits.person.not-covered: the employee sees optical amounts instead', async () => {
    await seed()
    openBenefits()
    render(<BenefitsPage today={TODAY} />)
    await screen.findByRole('heading', { level: 2, name: 'Nguyen Van A' })

    expect(within(sectionFor('Mắt (kính)')).getByText('600.000 đ/năm')).toBeInTheDocument()
    expect(screen.queryByText('Không có quyền lợi này')).not.toBeInTheDocument()
  })
})

describe('benefits.year.none', () => {
  it('benefits.year.none: a date outside every policy year says so with the date', async () => {
    await seed()
    openBenefits()
    render(<BenefitsPage today="2027-02-01" />)

    expect(await screen.findByText('Chưa có dữ liệu quyền lợi cho ngày 01/02/2027')).toBeInTheDocument()
    expect(screen.queryByText('13.000.000 đ/năm')).not.toBeInTheDocument()
  })
})

describe('benefits.dataset.invalid', () => {
  it('benefits.dataset.invalid: an invalid dataset shows the error and no values', async () => {
    await seed()
    useDataset({ ...fixture, copayPercent: { outpatient: { voluntary: 150 } } })
    openBenefits()
    render(<BenefitsPage today={TODAY} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Dữ liệu quyền lợi bị lỗi')
    expect(screen.queryByText('13.000.000 đ/năm')).not.toBeInTheDocument()
  })

  it('benefits.dataset.invalid: a manifest that fails to load shows the same error', async () => {
    await seed()
    vi.mocked(loadManifest).mockResolvedValue({ ok: false, error: 'offline' })
    openBenefits()
    render(<BenefitsPage today={TODAY} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Dữ liệu quyền lợi bị lỗi')
  })
})

describe('benefits.verified.unverified', () => {
  it('benefits.verified.unverified: an unverified dataset shows the label and its explanation', async () => {
    await seed()
    openBenefits()
    render(<BenefitsPage today={TODAY} />)

    expect(await screen.findByText('Chưa xác minh')).toBeInTheDocument()
    expect(screen.getByText(/chưa được đối chiếu với tài liệu hợp đồng/)).toBeInTheDocument()
  })
})

describe('benefits.verified.verified', () => {
  it('benefits.verified.verified: a verified dataset shows no unverified label', async () => {
    await seed()
    useDataset({ ...fixture, verified: true })
    openBenefits()
    render(<BenefitsPage today={TODAY} />)
    await screen.findByRole('heading', { level: 2, name: 'Nguyen Van A' })

    expect(screen.queryByText('Chưa xác minh')).not.toBeInTheDocument()
  })
})

describe('benefits.conditions.waiting', () => {
  it('benefits.conditions.waiting: a voluntary dependent sees the 6-month waiting period', async () => {
    const { dependentId } = await seed()
    openBenefits(dependentId)
    render(<BenefitsPage today={TODAY} />)

    expect(await screen.findByText('Bệnh đặc biệt và bệnh có sẵn: 6 tháng')).toBeInTheDocument()
  })
})

describe('benefits.conditions.override', () => {
  it('benefits.conditions.override: the refractive-error exclusion points to the optical benefit', async () => {
    await seed()
    openBenefits()
    render(<BenefitsPage today={TODAY} />)

    const exclusion = await screen.findByText('Tật khúc xạ, cận thị không do bệnh lý')
    expect(exclusion.parentElement).toHaveTextContent('Ngoại lệ: Kính mắt')
  })
})

describe('benefits.conditions.deadline', () => {
  it('benefits.conditions.deadline: shows the claim deadline, policy year and a tel: hotline', async () => {
    await seed()
    openBenefits()
    render(<BenefitsPage today={TODAY} />)

    expect(await screen.findByText('Hạn nộp hồ sơ: 100 ngày')).toBeInTheDocument()
    expect(screen.getByText('Năm hợp đồng 2026')).toBeInTheDocument()
    expect(screen.getByText('Hiệu lực từ 01/01/2026 đến 31/12/2026')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '0000 000 000' })).toHaveAttribute('href', 'tel:0000000000')
  })
})

describe('benefits.entry.home', () => {
  it('benefits.entry.home: the Quyền lợi link on Trang chủ opens #/benefits', async () => {
    await seed()
    render(<HomePage />)

    const link = await screen.findByRole('link', { name: 'Quyền lợi' })
    expect(link).toHaveAttribute('href', '#/benefits')
  })
})

describe('benefits.entry.person', () => {
  it('benefits.entry.person: a dependent page links to #/benefits/<personId>', async () => {
    const { dependentId } = await seed()
    route.value = { path: `/account/person/${dependentId}`, params: { id: dependentId } }
    render(<PersonEdit />)

    const link = await screen.findByRole('link', { name: 'Quyền lợi' })
    expect(link).toHaveAttribute('href', `#/benefits/${dependentId}`)
  })

  it('benefits.entry.person: the holder page links to the holder benefits', async () => {
    const { holderId } = await seed()
    route.value = { path: `/account/person/${holderId}`, params: { id: holderId } }
    render(<PersonEdit />)

    const link = await screen.findByRole('link', { name: 'Quyền lợi' })
    expect(link).toHaveAttribute('href', `#/benefits/${holderId}`)
  })
})
