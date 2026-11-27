import { render, screen, fireEvent, waitFor } from '@testing-library/preact'
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { Blob as NodeBlob } from 'node:buffer'
import { db } from '../../src/db/db'
import type { Person, PersonInput } from '../../src/domain/types'
import { createAccount } from '../../src/data/account-repo'
import { savePerson } from '../../src/data/persons-repo'
import { saveImage, type Downscale } from '../../src/data/files-repo'
import { accountState } from '../../src/data/account-state'
import { route } from '../../src/router'
import { setOnline } from '../setup'
import { CardWallet } from '../../src/pages/CardWallet'

// fake-indexeddb drops jsdom Blobs on round trip; Node's Blob survives. Same workaround as backup.test.ts.
vi.stubGlobal('Blob', NodeBlob)
URL.createObjectURL = vi.fn(() => 'blob:x')
URL.revokeObjectURL = vi.fn()
afterAll(() => vi.unstubAllGlobals())

const TODAY = '2026-11-26'

/** Fake downscale: returns a 2000×1500 JPEG-typed blob regardless of input. */
const fakeDownscale = vi.fn<Downscale>(async () => ({
  blob: new NodeBlob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }) as unknown as Blob,
  width: 2000,
  height: 1500,
}))

function holderInput(overrides: Partial<PersonInput> = {}): PersonInput {
  return {
    role: 'holder',
    relation: 'self',
    memberType: 'employee',
    fullName: 'Nguyen Van A',
    dateOfBirth: '1990-01-01',
    idNumber: null,
    phone: null,
    email: null,
    address: null,
    employeeCode: null,
    jobTitle: null,
    tier: 1,
    policyholderName: null,
    contractCode: null,
    cardNumber: 'PTI-123456',
    cardValidFrom: '2026-01-01',
    cardValidTo: '2027-12-31',
    bank: null,
    ...overrides,
  }
}

function dependentInput(overrides: Partial<PersonInput> = {}): PersonInput {
  return {
    ...holderInput(),
    role: 'dependent',
    relation: 'child',
    memberType: 'sponsored',
    fullName: 'Nguyen Thi B',
    cardNumber: 'PTI-654321',
    ...overrides,
  }
}

/** Seeds an account with a holder (and optionally a dependent), each with a card front image. */
async function seed(holderOverrides: Partial<PersonInput> = {}) {
  const created = await createAccount(db, holderInput(holderOverrides), TODAY)
  if (!created.ok) throw new Error('seed holder invalid')
  const holder = created.holder
  const dep = await savePerson(db, created.account.id, dependentInput(), TODAY)
  if (!dep.ok) throw new Error('seed dependent invalid')
  const dependent: Person = dep.person

  for (const p of [holder, dependent]) {
    await saveImage(db, { type: 'person', id: p.id }, 'card-front', new NodeBlob([new Uint8Array([9])]) as unknown as Blob, {
      downscale: fakeDownscale,
    })
  }
  const fresh = await db.persons.get(holder.id)
  accountState.value = { status: 'ready', account: created.account }
  return { account: created.account, holder: fresh!, dependent }
}

beforeEach(async () => {
  await Promise.all([db.files.clear(), db.persons.clear(), db.account.clear(), db.outbox.clear()])
  vi.clearAllMocks()
  setOnline(true)
  accountState.value = { status: 'loading' }
  route.value = { path: '/wallet', params: {} }
})

describe('account.card.view-offline', () => {
  it('account.card.view-offline: shows the front image with name, card number and validity while offline', async () => {
    await seed()
    setOnline(false)
    const originalFetch = globalThis.fetch
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    try {
      render(<CardWallet today={TODAY} />)

      const img = await screen.findByRole('img', { name: /Nguyen Van A/ })
      expect(img).toHaveAttribute('src', 'blob:x')
      expect(screen.getByText('Nguyen Van A')).toBeInTheDocument()
      expect(screen.getByText('PTI-123456')).toBeInTheDocument()
      expect(screen.getByText('01/01/2026 – 31/12/2027')).toBeInTheDocument()
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('account.card.expired-warning', () => {
  it('account.card.expired-warning: warns when cardValidTo is before today', async () => {
    await seed({ cardValidTo: '2026-11-01' })

    render(<CardWallet today={TODAY} />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Thẻ đã hết hiệu lực')
  })

  it('account.card.expired-warning: no warning when the card is still valid', async () => {
    await seed({ cardValidTo: '2027-12-31' })

    render(<CardWallet today={TODAY} />)

    await screen.findByRole('img', { name: /Nguyen Van A/ })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('account.card.a11y', () => {
  it('account.card.a11y: icon-only controls are buttons with accessible names; previous is disabled on the first person', async () => {
    await seed()

    render(<CardWallet today={TODAY} />)
    await screen.findByRole('img', { name: /Nguyen Van A/ })

    expect(screen.getByRole('button', { name: 'Trước' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Tiếp' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeEnabled()
  })

  it('account.card.a11y: next moves to the dependent and enables previous', async () => {
    await seed()

    render(<CardWallet today={TODAY} />)
    await screen.findByRole('img', { name: /Nguyen Van A/ })

    fireEvent.click(screen.getByRole('button', { name: 'Tiếp' }))

    expect(await screen.findByRole('img', { name: /Nguyen Thi B/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trước' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Tiếp' })).toBeDisabled()
  })
})
