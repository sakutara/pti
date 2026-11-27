import { render, screen } from '@testing-library/preact'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from '../../src/pages/HomePage'
import { db, newId, now } from '../../src/db/db'
import { createAccount } from '../../src/data/account-repo'
import { accountState, loadAccount } from '../../src/data/account-state'
import { resetDatasetCache } from '../../src/data/datasets'
import type { Claim } from '../../src/domain/claim-types'
import type { PersonInput } from '../../src/domain/types'

const PUBLIC = join(process.cwd(), 'public')
const TODAY = '2026-11-26'

/** The overdue count reads the administrator's reply times over fetch; serve them from public/ like the app does. */
function serveFromPublic(input: string | URL | Request): Promise<Response> {
  const path = new URL(String(input), 'http://localhost').pathname
  const body = readFileSync(join(PUBLIC, path))
  return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }))
}

const holderInput = (): PersonInput => ({
  role: 'holder',
  relation: 'self',
  memberType: 'employee',
  fullName: 'Nguyễn Văn A',
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

function claimOf(personId: string, over: Partial<Claim>): Claim {
  return {
    id: newId(),
    personId,
    type: 'outpatient',
    status: 'submitted',
    treatmentDate: '2026-11-02',
    facilityId: null,
    facilityName: '',
    reason: '',
    originalsSubmittedAt: null,
    daysOff: 0,
    admissionDate: null,
    dischargeDate: null,
    bank: null,
    notApplicable: [],
    diagnosis: null,
    flags: {},
    totalClaimed: 750000,
    approvedAmount: null,
    rejectionReason: null,
    submittedAt: new Date(2026, 10, 2, 12).getTime(),
    bundleFileIds: [],
    wizardStep: 5,
    sentVia: 'mailto',
    gmailThreadId: null,
    lastSubmittedFileIds: [],
    updatedAt: now(),
    deleted: 0,
    ...over,
  }
}

async function seedHolder(): Promise<string> {
  await db.transaction('rw', db.account, db.persons, db.claims, db.outbox, async () => {
    await db.account.clear()
    await db.persons.clear()
    await db.claims.clear()
    await db.outbox.clear()
  })
  const result = await createAccount(db, holderInput(), TODAY)
  if (!result.ok) throw new Error('seed failed')
  await loadAccount(db)
  return result.holder.id
}

beforeEach(async () => {
  resetDatasetCache()
  vi.stubGlobal('fetch', vi.fn(serveFromPublic))
  accountState.value = { status: 'loading' }
})

afterAll(() => vi.unstubAllGlobals())

describe('app-shell.home', () => {
  it('app-shell.home.summary: shows holder name, tier, claims in progress and the shortcuts', async () => {
    const holderId = await seedHolder()
    const recent = new Date(2026, 10, 25, 12).getTime()
    await db.claims.bulkPut([
      claimOf(holderId, { status: 'submitted', submittedAt: recent }),
      claimOf(holderId, { status: 'need_info', submittedAt: recent }),
      claimOf(holderId, { status: 'paid', approvedAmount: 750000 }),
    ])

    const { container } = render(<HomePage today={TODAY} />)

    expect(await screen.findByText('Nguyễn Văn A')).toBeInTheDocument()
    expect(await screen.findByText('Hạng 2')).toBeInTheDocument()
    expect(await screen.findByText('2 hồ sơ đang xử lý')).toBeInTheDocument()

    expect(screen.getByRole('heading', { level: 2, name: 'Nguyễn Văn A' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Thẻ bảo hiểm' })).toHaveAttribute('href', '#/wallet')
    expect(screen.getByRole('link', { name: 'Tạo hồ sơ' })).toHaveAttribute('href', '#/claims/new')
    expect(screen.getByRole('link', { name: 'Xuất hóa đơn' })).toHaveAttribute('href', '#/invoice-guide')
    expect(screen.queryByText(/quá hạn phản hồi/)).toBeNull()
    expect(container.textContent ?? '').not.toContain('⟦')
  })

  it('app-shell.home.overdue: shows the number of overdue claims when there are any', async () => {
    const holderId = await seedHolder()
    await db.claims.bulkPut([
      // Submitted 2026-11-02: 18 working days before 2026-11-26, past the 7-day limit of a 750000 claim.
      claimOf(holderId, { status: 'submitted' }),
      claimOf(holderId, { status: 'submitted', submittedAt: new Date(2026, 10, 25, 12).getTime() }),
    ])

    render(<HomePage today={TODAY} />)

    expect(await screen.findByText('2 hồ sơ đang xử lý')).toBeInTheDocument()
    expect(await screen.findByText('1 hồ sơ quá hạn phản hồi')).toBeInTheDocument()
  })

  it('app-shell.home.overdue: shows no overdue line when no claim is overdue', async () => {
    const holderId = await seedHolder()
    await db.claims.put(claimOf(holderId, { status: 'submitted', submittedAt: new Date(2026, 10, 25, 12).getTime() }))

    render(<HomePage today={TODAY} />)

    expect(await screen.findByText('1 hồ sơ đang xử lý')).toBeInTheDocument()
    expect(screen.queryByText(/quá hạn phản hồi/)).toBeNull()
  })
})
