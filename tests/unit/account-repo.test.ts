import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppDB } from '../../src/db/db'
import { createAccount, getAccount, updateAccount } from '../../src/data/account-repo'
import { createSyncEngine } from '../../src/sync/sync-engine'
import type { SyncAdapter } from '../../src/sync/adapters'
import type { PersonInput } from '../../src/domain/types'
import { setOnline } from '../setup'

const TODAY = '2026-11-26'

let db: AppDB
beforeEach(async () => {
  db = new AppDB(`t-${crypto.randomUUID()}`)
  await db.open()
  setOnline(true)
})

afterEach(() => {
  setOnline(true)
  vi.restoreAllMocks()
})

const holderInput = (over: Partial<PersonInput> = {}): PersonInput => ({
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
  ...over,
})

async function onboard() {
  const result = await createAccount(db, holderInput(), TODAY)
  if (!result.ok) throw new Error('setup failed')
  return result
}

describe('account.onboarding', () => {
  it('account.onboarding.create: stores one marsh account and one self holder', async () => {
    const result = await createAccount(db, holderInput(), TODAY)

    expect(result.ok).toBe(true)
    expect(await db.account.count()).toBe(1)
    const accounts = await db.account.toArray()
    expect(accounts[0].administrator).toBe('marsh')
    expect(accounts[0].displayName).toBe('Nguyễn Văn A')

    const persons = await db.persons.toArray()
    expect(persons).toHaveLength(1)
    expect(persons[0].role).toBe('holder')
    expect(persons[0].relation).toBe('self')
    expect(persons[0].accountId).toBe(accounts[0].id)
    expect(persons[0].tier).toBe(2)
    expect(persons[0].dateOfBirth).toBe('1990-05-01')
  })

  it('account.onboarding.create: queues account.upsert and person.upsert in the outbox', async () => {
    await onboard()

    const ops = await db.outbox.orderBy('createdAt').toArray()
    expect(ops.map((o) => o.type)).toEqual(['account.upsert', 'person.upsert'])
    expect(ops.map((o) => o.entity)).toEqual(['account', 'person'])
  })

  it('account.onboarding.no-network: creates the account and makes no fetch call', async () => {
    setOnline(false)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const result = await createAccount(db, holderInput(), TODAY)

    expect(result.ok).toBe(true)
    expect(await db.account.count()).toBe(1)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('account.onboarding.validation: returns errors and stores nothing for an invalid holder', async () => {
    const result = await createAccount(db, holderInput({ fullName: '  ', dateOfBirth: '2099-01-01' }), TODAY)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.fullName).toBe('error.required')
    expect(result.errors.dateOfBirth).toBe('error.dateFuture')
    expect(await db.account.count()).toBe(0)
    expect(await db.persons.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('account.onboarding.create: throws when an account already exists', async () => {
    await onboard()

    await expect(createAccount(db, holderInput(), TODAY)).rejects.toThrow('account exists')
    expect(await db.account.count()).toBe(1)
  })
})

describe('account.settings', () => {
  it('account.settings.claim-email: stores claimEmail and claimCc', async () => {
    await onboard()

    const result = await updateAccount(db, { claimEmail: 'claims@example.com', claimCc: ['me@example.com'] })

    expect(result.ok).toBe(true)
    const account = await getAccount(db)
    expect(account?.claimEmail).toBe('claims@example.com')
    expect(account?.claimCc).toEqual(['me@example.com'])
  })

  it('account.settings.claim-email: normalises empty values and drops empty CC entries', async () => {
    await onboard()

    const result = await updateAccount(db, { claimEmail: '  ', claimCc: [' ', ''] })

    expect(result.ok).toBe(true)
    const account = await getAccount(db)
    expect(account?.claimEmail).toBeNull()
    expect(account?.claimCc).toEqual([])
  })

  it('account.settings.validation: rejects a malformed claim email and stores nothing', async () => {
    await onboard()
    const before = await getAccount(db)

    const result = await updateAccount(db, { claimEmail: 'not-an-email', claimCc: ['bad'] })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.claimEmail).toBe('error.email')
    expect(result.errors.claimCc).toBe('error.email')
    expect(await getAccount(db)).toEqual(before)
    expect(await db.outbox.count()).toBe(2)
  })

  it('account.settings.offline: stores the change and queues account.upsert in the same transaction', async () => {
    await onboard()
    await db.outbox.clear()
    setOnline(false)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const result = await updateAccount(db, { displayName: 'Nguyễn Văn B' })

    expect(result.ok).toBe(true)
    expect((await getAccount(db))?.displayName).toBe('Nguyễn Văn B')
    const ops = await db.outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0].type).toBe('account.upsert')
    expect(ops[0].entity).toBe('account')
    expect(ops[0].entityId).toBe((await getAccount(db))?.id)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('account.settings.offline: bumps updatedAt strictly even within the same millisecond', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(5_000)
    await onboard()
    const before = (await getAccount(db))!.updatedAt

    await updateAccount(db, { administrator: 'fhvi' })

    const after = await getAccount(db)
    expect(after!.updatedAt).toBeGreaterThan(before)
    expect(after!.administrator).toBe('fhvi')
  })

  it('account.settings.resync: flushes both offline edits through the adapter and empties the outbox', async () => {
    await onboard()
    await db.outbox.clear()
    setOnline(false)

    await updateAccount(db, { displayName: 'Nguyễn Văn B' })
    await updateAccount(db, { claimEmail: 'claims@example.com' })
    expect(await db.outbox.count()).toBe(2)

    setOnline(true)
    const push = vi.fn(async (ops: { id: string }[]) => ({ ok: ops.map((o) => o.id), failed: [] }))
    const adapter: SyncAdapter = { name: 'fake', push }
    await createSyncEngine(db, adapter).flush()

    expect(push).toHaveBeenCalledTimes(1)
    const pushed = push.mock.calls[0][0] as { type: string }[]
    expect(pushed.map((o) => o.type)).toEqual(['account.upsert', 'account.upsert'])
    expect(await db.outbox.count()).toBe(0)
  })
})
