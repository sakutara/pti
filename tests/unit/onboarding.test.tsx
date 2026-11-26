import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/db/db'
import { Onboarding } from '../../src/pages/Onboarding'
import { t } from '../../src/i18n'

const TODAY = '2026-11-26'
const persistMock = vi.fn(async () => true)

function setStandalone(standalone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: standalone && query === '(display-mode: standalone)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

beforeEach(async () => {
  await Promise.all([db.account.clear(), db.persons.clear(), db.outbox.clear(), db.settings.clear()])
  location.hash = ''
  persistMock.mockClear()
  Object.defineProperty(navigator, 'storage', { configurable: true, value: { persist: persistMock } })
  setStandalone(false)
})

function fillHolder(over: { fullName?: string; dateOfBirth?: string; tier?: string } = {}) {
  const { fullName = 'Nguyễn Văn A', dateOfBirth = '1990-05-01', tier = '2' } = over
  fireEvent.input(screen.getByLabelText('Họ và tên'), { target: { value: fullName } })
  fireEvent.input(screen.getByLabelText('Ngày sinh'), { target: { value: dateOfBirth } })
  fireEvent.change(screen.getByLabelText('Hạng bảo hiểm'), { target: { value: tier } })
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu sử dụng' }))

describe('account.onboarding', () => {
  it('account.onboarding.create: stores one marsh account and one self holder, then navigates to Trang chủ', async () => {
    setStandalone(true)
    render(<Onboarding today={TODAY} />)
    fillHolder()
    submit()

    await waitFor(() => expect(location.hash).toBe('#/'))
    const accounts = await db.account.toArray()
    expect(accounts).toHaveLength(1)
    expect(accounts[0].administrator).toBe('marsh')

    const persons = await db.persons.toArray()
    expect(persons).toHaveLength(1)
    expect(persons[0]).toMatchObject({
      role: 'holder',
      relation: 'self',
      memberType: 'employee',
      fullName: 'Nguyễn Văn A',
      dateOfBirth: '1990-05-01',
      tier: 2,
    })
    expect(await db.outbox.count()).toBe(2)
    expect(document.body.textContent ?? '').not.toContain('⟦')
  })

  it('account.onboarding.validation: empty full name stores nothing and marks the field invalid', async () => {
    setStandalone(true)
    render(<Onboarding today={TODAY} />)
    fillHolder({ fullName: '' })
    submit()

    const name = screen.getByLabelText('Họ và tên')
    await waitFor(() => expect(name).toHaveAttribute('aria-invalid', 'true'))
    const describedBy = name.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy!)).toHaveTextContent(t('error.required'))

    expect(await db.account.count()).toBe(0)
    expect(await db.persons.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
    expect(persistMock).not.toHaveBeenCalled()
  })

  it('account.onboarding.validation: a date of birth in the future stores nothing and marks the field invalid', async () => {
    setStandalone(true)
    render(<Onboarding today={TODAY} />)
    fillHolder({ dateOfBirth: '2027-01-01' })
    submit()

    const dob = screen.getByLabelText('Ngày sinh')
    await waitFor(() => expect(dob).toHaveAttribute('aria-invalid', 'true'))
    const describedBy = dob.getAttribute('aria-describedby')
    expect(document.getElementById(describedBy!)).toHaveTextContent(t('error.dateFuture'))

    expect(await db.account.count()).toBe(0)
    expect(await db.persons.count()).toBe(0)
    expect(persistMock).not.toHaveBeenCalled()
  })

  it('account.onboarding.install-hint: shows a one-time hint when not standalone and navigates to Trang chủ after closing it', async () => {
    render(<Onboarding today={TODAY} />)
    fillHolder()
    submit()

    const dialog = await screen.findByRole('dialog', { name: 'Cài ứng dụng lên điện thoại' })
    expect(dialog).toHaveTextContent(t('onboarding.installHint'))
    expect(location.hash).not.toBe('#/')
    await waitFor(() => expect(screen.getByRole('button', { name: t('common.close') })).toHaveFocus())

    fireEvent.click(screen.getByRole('button', { name: t('common.close') }))
    await waitFor(() => expect(location.hash).toBe('#/'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect((await db.settings.get('installHintShown'))?.value).toBe(true)
  })

  it('account.onboarding.install-hint: does not show the hint again once installHintShown is set', async () => {
    await db.settings.put({ key: 'installHintShown', value: true, updatedAt: Date.now() })
    render(<Onboarding today={TODAY} />)
    fillHolder()
    submit()

    await waitFor(() => expect(location.hash).toBe('#/'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('backup.storage.persist: calls navigator.storage.persist once and stores the result as settings persisted', async () => {
    setStandalone(true)
    render(<Onboarding today={TODAY} />)
    fillHolder()
    submit()

    await waitFor(() => expect(location.hash).toBe('#/'))
    expect(persistMock).toHaveBeenCalledTimes(1)
    expect((await db.settings.get('persisted'))?.value).toBe(true)
  })
})
