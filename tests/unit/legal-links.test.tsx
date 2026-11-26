import { render, screen, within } from '@testing-library/preact'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/db/db'
import { createAccount } from '../../src/data/account-repo'
import { accountState, loadAccount } from '../../src/data/account-state'
import type { PersonInput } from '../../src/domain/types'
import { AccountPage } from '../../src/pages/AccountPage'
import { Onboarding } from '../../src/pages/Onboarding'
import { LegalLinks } from '../../src/ui/LegalLinks'

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

/** Asserts the legal nav holds exactly the two plain full-navigation links with 44 px targets. */
function expectLegalLinks(nav: HTMLElement) {
  const about = within(nav).getByRole('link', { name: 'Giới thiệu', exact: true })
  const privacy = within(nav).getByRole('link', { name: 'Chính sách quyền riêng tư', exact: true })
  expect(about).toHaveAttribute('href', '/about/')
  expect(privacy).toHaveAttribute('href', '/privacy/')
  expect(about).toHaveClass('min-h-11')
  expect(privacy).toHaveClass('min-h-11')
  expect(within(nav).getAllByRole('link')).toHaveLength(2)
}

describe('public-pages.links', () => {
  it('public-pages.links.onboarding: LegalLinks renders a labelled nav with /about/ and /privacy/ links', () => {
    render(<LegalLinks />)
    expectLegalLinks(screen.getByRole('navigation', { name: 'Thông tin pháp lý' }))
  })

  it('public-pages.links.onboarding: onboarding screen shows the two legal links', () => {
    render(<Onboarding today={TODAY} />)
    expectLegalLinks(screen.getByRole('navigation', { name: 'Thông tin pháp lý' }))
  })

  it('public-pages.links.account: Tài khoản page shows the same two legal links', async () => {
    const result = await createAccount(db, holderInput(), TODAY)
    if (!result.ok) throw new Error('seed failed')
    await loadAccount(db)

    render(<AccountPage />)
    expectLegalLinks(await screen.findByRole('navigation', { name: 'Thông tin pháp lý' }))
  })
})
