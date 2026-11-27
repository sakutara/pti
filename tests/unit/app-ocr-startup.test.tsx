import { render, waitFor } from '@testing-library/preact'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app'
import { createAccount } from '../../src/data/account-repo'
import { accountState } from '../../src/data/account-state'
import { initOcrModel } from '../../src/data/ocr-model'
import { startOcrQueue } from '../../src/data/ocr-queue'
import { db } from '../../src/db/db'
import type { PersonInput } from '../../src/domain/types'

vi.mock('../../src/data/ocr-model', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/data/ocr-model')>()
  return { ...actual, initOcrModel: vi.fn(async () => {}) }
})
vi.mock('../../src/data/ocr-queue', () => ({ startOcrQueue: vi.fn(async () => {}) }))

const TODAY = '2026-11-27'

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
  await Promise.all([db.account.clear(), db.persons.clear(), db.outbox.clear(), db.settings.clear()])
  accountState.value = { status: 'loading' }
  vi.mocked(initOcrModel).mockClear()
  vi.mocked(startOcrQueue).mockClear()
  location.hash = '#/'
})

describe('document-ocr.queue.resync: OCR starts at app startup', () => {
  it('document-ocr.queue.resync: initialises the model, then starts the queue once the account is ready', async () => {
    const result = await createAccount(db, holderInput(), TODAY)
    if (!result.ok) throw new Error('seed failed')

    render(<App />)

    await waitFor(() => expect(startOcrQueue).toHaveBeenCalledTimes(1))
    expect(initOcrModel).toHaveBeenCalledTimes(1)
    const init = vi.mocked(initOcrModel).mock.invocationCallOrder[0]
    const start = vi.mocked(startOcrQueue).mock.invocationCallOrder[0]
    expect(init).toBeLessThan(start)
  })

  it('document-ocr.queue.resync: does not start OCR while no account exists', async () => {
    render(<App />)

    await waitFor(() => expect(accountState.value.status).toBe('none'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(initOcrModel).not.toHaveBeenCalled()
    expect(startOcrQueue).not.toHaveBeenCalled()
  })
})
