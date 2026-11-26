import { render, screen } from '@testing-library/preact'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from '../../src/pages/HomePage'
import { db } from '../../src/db/db'
import { createAccount } from '../../src/data/account-repo'
import { accountState, loadAccount } from '../../src/data/account-state'
import type { PersonInput } from '../../src/domain/types'

vi.mock('../../src/data/claims-summary', () => ({ countOpenClaims: vi.fn(async () => 2) }))

const TODAY = '2026-11-26'

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

beforeEach(async () => {
  await db.transaction('rw', db.account, db.persons, db.outbox, async () => {
    await db.account.clear()
    await db.persons.clear()
    await db.outbox.clear()
  })
  accountState.value = { status: 'loading' }
})

describe('app-shell.home', () => {
  it('app-shell.home.summary: shows holder name, tier, open claims count and shortcuts', async () => {
    const result = await createAccount(db, holderInput(), TODAY)
    if (!result.ok) throw new Error('seed failed')
    await loadAccount(db)

    const { container } = render(<HomePage />)

    expect(await screen.findByText('Nguyễn Văn A')).toBeInTheDocument()
    expect(await screen.findByText('Hạng 2')).toBeInTheDocument()
    expect(await screen.findByText('2 hồ sơ đang xử lý')).toBeInTheDocument()

    expect(screen.getByRole('heading', { level: 2, name: 'Nguyễn Văn A' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Thẻ bảo hiểm' })).toHaveAttribute('href', '#/wallet')
    expect(screen.getByRole('link', { name: 'Tạo hồ sơ' })).toHaveAttribute('href', '#/claims')
    expect(container.textContent ?? '').not.toContain('⟦')
  })
})
