import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/db/db'
import { createAccount } from '../../src/data/account-repo'
import { accountState, loadAccount } from '../../src/data/account-state'
import { savePerson } from '../../src/data/persons-repo'
import type { PersonInput } from '../../src/domain/types'
import { MISSING } from '../../src/i18n'
import { route } from '../../src/router'
import { AccountPage } from '../../src/pages/AccountPage'
import { PersonEdit } from '../../src/pages/PersonEdit'

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

const dependentInput = (): PersonInput => ({
  ...holderInput(),
  role: 'dependent',
  relation: 'child',
  memberType: 'sponsored',
  fullName: 'Lê Văn C',
  dateOfBirth: '2015-07-01',
  tier: 2,
})

function setRoute(id: string) {
  route.value = { path: `/account/person/${id}`, params: { id } }
}

beforeEach(async () => {
  await db.transaction('rw', db.account, db.persons, db.outbox, db.files, async () => {
    await db.account.clear()
    await db.persons.clear()
    await db.outbox.clear()
    await db.files.clear()
  })
  accountState.value = { status: 'loading' }
  location.hash = ''
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function seedAccount() {
  const result = await createAccount(db, holderInput(), TODAY)
  if (!result.ok) throw new Error('seed failed')
  await loadAccount(db)
  return result
}

function fillDependent(over: { fullName?: string; dateOfBirth?: string; tier?: string; memberType?: string } = {}) {
  const { fullName = 'Nguyễn Thị B', dateOfBirth = '1992-03-10', tier = '3', memberType = 'voluntary' } = over
  fireEvent.input(screen.getByLabelText('Họ và tên'), { target: { value: fullName } })
  fireEvent.input(screen.getByLabelText('Ngày sinh'), { target: { value: dateOfBirth } })
  fireEvent.change(screen.getByLabelText('Hạng bảo hiểm'), { target: { value: tier } })
  fireEvent.change(screen.getByLabelText('Loại người được bảo hiểm'), { target: { value: memberType } })
}

describe('account.settings', () => {
  it('account.settings.claim-email: saves claim email and CC addresses to the account', async () => {
    await seedAccount()
    const { container } = render(<AccountPage />)

    fireEvent.input(await screen.findByLabelText('Email nhận hồ sơ (để trống để dùng mặc định)'), {
      target: { value: 'claims@example.com' },
    })
    fireEvent.input(screen.getByLabelText('CC thêm (phân cách bằng dấu phẩy)'), {
      target: { value: 'me@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))

    await waitFor(async () => {
      const account = (await db.account.toArray())[0]
      expect(account.claimEmail).toBe('claims@example.com')
      expect(account.claimCc).toEqual(['me@example.com'])
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Đã lưu')
    expect(container.textContent ?? '').not.toContain(MISSING)
  })

  it('account.settings.invalid-email: does not save "abc" and shows an email-format error', async () => {
    await seedAccount()
    render(<AccountPage />)

    const field = await screen.findByLabelText('Email nhận hồ sơ (để trống để dùng mặc định)')
    fireEvent.input(field, { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(await screen.findByText('Email không hợp lệ')).toBeInTheDocument()
    expect(field).toHaveAttribute('aria-invalid', 'true')
    const account = (await db.account.toArray())[0]
    expect(account.claimEmail).toBeNull()
  })
})

describe('account.dependents', () => {
  it('account.dependents.add: stores a dependent through PersonEdit and lists it on the account page', async () => {
    await seedAccount()
    setRoute('new')
    render(<PersonEdit />)

    await screen.findByLabelText('Họ và tên')
    fillDependent()
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))

    await waitFor(async () => {
      const stored = (await db.persons.toArray()).find((p) => p.fullName === 'Nguyễn Thị B')
      expect(stored).toBeDefined()
      expect(stored).toMatchObject({ role: 'dependent', dateOfBirth: '1992-03-10', tier: 3, memberType: 'voluntary' })
    })

    render(<AccountPage />)
    expect(await screen.findByRole('link', { name: /Nguyễn Thị B/ })).toHaveAttribute(
      'href',
      expect.stringMatching(/^#\/account\/person\//),
    )
  })

  it('account.dependents.delete: soft-deletes the dependent, removes it from the list and queues person.delete', async () => {
    await seedAccount()
    const dependent = await savePerson(db, (await db.account.toArray())[0].id, dependentInput(), TODAY)
    if (!dependent.ok) throw new Error('seed dependent failed')
    const dependentId = dependent.person.id

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    setRoute(dependentId)
    render(<PersonEdit />)

    fireEvent.click(await screen.findByRole('button', { name: 'Xóa' }))

    await waitFor(async () => {
      expect((await db.persons.get(dependentId))?.deleted).toBe(1)
    })
    const ops = (await db.outbox.toArray()).filter((op) => op.type === 'person.delete')
    expect(ops).toHaveLength(1)
    expect(ops[0].entityId).toBe(dependentId)

    render(<AccountPage />)
    expect(await screen.findByRole('link', { name: /Nguyễn Văn A/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Lê Văn C/ })).toBeNull()
  })

  it('account.dependents.holder-not-deletable: offers no delete action on the holder', async () => {
    await seedAccount()
    const holder = (await db.persons.toArray()).find((p) => p.role === 'holder')
    if (!holder) throw new Error('no holder')
    setRoute(holder.id)
    const { container } = render(<PersonEdit />)

    await screen.findByLabelText('Họ và tên')
    expect(screen.queryByRole('button', { name: 'Xóa' })).toBeNull()
    expect(container.textContent ?? '').not.toContain(MISSING)
  })
})
