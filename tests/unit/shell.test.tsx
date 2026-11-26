import { render, screen, waitFor, within } from '@testing-library/preact'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '../../src/app'
import { db } from '../../src/db/db'
import { createAccount } from '../../src/data/account-repo'
import { MISSING } from '../../src/i18n'
import type { PersonInput } from '../../src/domain/types'
import { accountState } from '../../src/data/account-state'

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
  location.hash = ''
})

async function seedAccount() {
  const result = await createAccount(db, holderInput(), TODAY)
  if (!result.ok) throw new Error('seed failed')
}

describe('app-shell.nav', () => {
  it('app-shell.nav.active: marks Cơ sở y tế as current on #/facilities and no other destination', async () => {
    await seedAccount()
    location.hash = '#/facilities'
    render(<App />)

    for (const name of ['Điều hướng chính', 'Thanh tab']) {
      const nav = await screen.findByRole('navigation', { name })
      expect(within(nav).getByRole('link', { name: 'Cơ sở y tế' })).toHaveAttribute('aria-current', 'page')
      for (const other of ['Trang chủ', 'Hồ sơ', 'Tài khoản']) {
        expect(within(nav).getByRole('link', { name: other })).not.toHaveAttribute('aria-current')
      }
    }
    expect(document.body.textContent ?? '').not.toContain(MISSING)
  })

  it('app-shell.nav.unknown-route: shows Trang chủ and replaces the hash with #/', async () => {
    await seedAccount()
    location.hash = '#/does-not-exist'
    render(<App />)

    expect(await screen.findByRole('heading', { level: 2, name: 'Nguyễn Văn A' })).toBeInTheDocument()
    await waitFor(() => expect(location.hash).toBe('#/'))
    expect(document.body.textContent ?? '').not.toContain(MISSING)
  })

  it('app-shell.home.no-account: shows onboarding instead of any route and no tab nav', async () => {
    location.hash = '#/claims'
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Bắt đầu' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Thanh tab' })).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Điều hướng chính' })).toBeNull()
    expect(document.body.textContent ?? '').not.toContain(MISSING)
  })
})
