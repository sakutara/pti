import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setOnline } from '../setup'
import { newId, now } from '../../src/db/db'
import type { Person } from '../../src/domain/types'
import { parseClaimRequirements, type InvoiceGuidance } from '../../src/domain/requirements-schema'
import { InvoiceGuide } from '../../src/ui/InvoiceGuide'
import { MISSING } from '../../src/i18n'

const PUBLIC = join(process.cwd(), 'public')

/** The guidance text comes from the bundled dataset, so the card is checked against what ships. */
function shippedGuidance(): InvoiceGuidance {
  const parsed = parseClaimRequirements(JSON.parse(readFileSync(join(PUBLIC, 'data/claim-requirements.json'), 'utf8')))
  if (!parsed.ok) throw new Error(parsed.error)
  return parsed.data.invoiceGuidance
}

function personOf(over: Partial<Person> = {}): Person {
  return {
    id: newId(),
    accountId: 'account-1',
    role: 'dependent',
    relation: 'child',
    memberType: 'sponsored',
    fullName: 'Nguyễn Thị B',
    dateOfBirth: '2012-06-01',
    idNumber: '079212000456',
    phone: null,
    email: null,
    address: 'Số 12 Đường Nguyễn Huệ, Quận 1',
    employeeCode: null,
    jobTitle: null,
    tier: 2,
    policyholderName: null,
    contractCode: null,
    cardNumber: null,
    cardValidFrom: null,
    cardValidTo: null,
    cardFrontFileId: null,
    cardBackFileId: null,
    bank: null,
    updatedAt: now(),
    deleted: 0,
    ...over,
  }
}

const fetchSpy = vi.fn(async () => new Response('{}'))

beforeEach(() => {
  setOnline(true)
  fetchSpy.mockClear()
  vi.stubGlobal('fetch', fetchSpy)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async () => {}) },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('claims.invoice.person-name: the buyer is the insured person of the claim', () => {
  it('claims.invoice.person-name: the card for dependent "Nguyễn Thị B" shows her name, address and ID number', () => {
    const person = personOf()
    render(<InvoiceGuide person={person} guidance={shippedGuidance()} />)

    expect(screen.getByText('Nguyễn Thị B')).toBeInTheDocument()
    expect(screen.getByText('Số 12 Đường Nguyễn Huệ, Quận 1')).toBeInTheDocument()
    expect(screen.getByText('079212000456')).toBeInTheDocument()
    expect(document.body.textContent ?? '').not.toContain(MISSING)
  })

  it('claims.invoice.person-name: the shipped warnings are listed', () => {
    render(<InvoiceGuide person={personOf()} guidance={shippedGuidance()} />)
    expect(screen.getByText('Người mua trên hóa đơn là người được bảo hiểm, không phải người khác')).toBeInTheDocument()
  })
})

describe('claims.invoice.copy: one-tap copy of each value', () => {
  it('claims.invoice.copy: tapping copy next to the address writes it to the clipboard and confirms', async () => {
    render(<InvoiceGuide person={personOf()} guidance={shippedGuidance()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Sao chép địa chỉ cư trú' }))

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Số 12 Đường Nguyễn Huệ, Quận 1')
    })
    expect(await screen.findByText('Đã sao chép địa chỉ cư trú')).toBeInTheDocument()
  })

  it('claims.invoice.copy: a failed copy tells the user to copy the selected text', async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('denied'))
    render(<InvoiceGuide person={personOf()} guidance={shippedGuidance()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Sao chép số CCCD' }))

    expect(await screen.findByText('Không sao chép được. Chữ đã được chọn sẵn, hãy tự sao chép.')).toBeInTheDocument()
  })
})

describe('claims.invoice.missing-address: the person has no address', () => {
  it('claims.invoice.missing-address: the card offers to add the address to the person', () => {
    const person = personOf({ address: null })
    render(<InvoiceGuide person={person} guidance={shippedGuidance()} />)

    expect(screen.getByText('Người này chưa có địa chỉ. Hãy thêm địa chỉ để in đúng trên hóa đơn.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sao chép địa chỉ cư trú' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Thêm địa chỉ' }))
    expect(location.hash).toBe(`#/account/person/${person.id}`)
  })
})

describe('claims.invoice.offline: the card works without a network', () => {
  it('claims.invoice.offline: all values are shown and no request is made while offline', () => {
    setOnline(false)
    render(<InvoiceGuide person={personOf()} guidance={shippedGuidance()} />)

    expect(screen.getByText('Nguyễn Thị B')).toBeInTheDocument()
    expect(screen.getByText('Số 12 Đường Nguyễn Huệ, Quận 1')).toBeInTheDocument()
    expect(screen.getByText('079212000456')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
