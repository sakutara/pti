import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { AppDB } from '../../src/db/db'
import type { Account, Person, PersonInput } from '../../src/domain/types'
import {
  listPersons,
  savePerson,
  deletePerson,
  canDelete,
} from '../../src/data/persons-repo'
import { setOnline } from '../setup'

const TODAY = '2026-11-26'
const ACCOUNT_ID = 'acc-1'

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: ACCOUNT_ID,
    displayName: 'Nguyen Van A',
    administrator: 'marsh',
    claimEmail: null,
    claimCc: [],
    defaultBank: null,
    onboardedAt: null,
    updatedAt: 0,
    deleted: 0,
    ...overrides,
  }
}

function dependentInput(overrides: Partial<PersonInput> = {}): PersonInput {
  return {
    role: 'dependent',
    relation: 'spouse',
    memberType: 'voluntary',
    fullName: 'Nguyễn Thị B',
    dateOfBirth: '1992-03-10',
    idNumber: null,
    phone: null,
    email: null,
    address: null,
    employeeCode: null,
    jobTitle: null,
    tier: 3,
    policyholderName: null,
    contractCode: null,
    cardNumber: null,
    cardValidFrom: null,
    cardValidTo: null,
    bank: null,
    ...overrides,
  }
}

function holderRecord(overrides: Partial<Person> = {}): Person {
  return {
    id: 'holder-1',
    accountId: ACCOUNT_ID,
    role: 'holder',
    relation: 'self',
    memberType: 'employee',
    fullName: 'Nguyen Van A',
    dateOfBirth: '1980-01-01',
    idNumber: null,
    phone: '0900000000',
    email: null,
    address: null,
    employeeCode: 'E-1',
    jobTitle: null,
    tier: 1,
    policyholderName: null,
    contractCode: null,
    cardNumber: null,
    cardValidFrom: null,
    cardValidTo: null,
    cardFrontFileId: null,
    cardBackFileId: null,
    bank: null,
    updatedAt: 0,
    deleted: 0,
    ...overrides,
  }
}

let db: AppDB

beforeEach(async () => {
  db = new AppDB('t-' + crypto.randomUUID())
  await db.account.add(account())
})

afterEach(async () => {
  db.close()
  await db.delete()
})

describe('persons-repo', () => {
  it('account.dependents.add: stores a dependent and lists it', async () => {
    const result = await savePerson(db, ACCOUNT_ID, dependentInput(), TODAY)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.person.role).toBe('dependent')
    expect(result.person.deleted).toBe(0)

    const stored = await db.persons.get(result.person.id)
    expect(stored?.role).toBe('dependent')
    expect(stored?.fullName).toBe('Nguyễn Thị B')

    const names = (await listPersons(db, ACCOUNT_ID)).map((p) => p.fullName)
    expect(names).toContain('Nguyễn Thị B')
  })

  it('account.dependents.delete: soft-deletes, hides from list and queues person.delete', async () => {
    const created = await savePerson(db, ACCOUNT_ID, dependentInput(), TODAY)
    if (!created.ok) throw new Error('setup failed')
    const id = created.person.id

    await deletePerson(db, id)

    const stored = await db.persons.get(id)
    expect(stored?.deleted).toBe(1)
    expect((await listPersons(db, ACCOUNT_ID)).map((p) => p.id)).not.toContain(id)

    const ops = await db.outbox.toArray()
    const del = ops.filter((o) => o.type === 'person.delete')
    expect(del).toHaveLength(1)
    expect(del[0]).toMatchObject({ entity: 'person', entityId: id, payload: { id } })
  })

  it('account.dependents.holder-not-deletable: holder offers no delete and deletePerson refuses it', async () => {
    const holder = holderRecord()
    await db.persons.add(holder)

    expect(canDelete(holder)).toBe(false)
    expect(canDelete({ ...holder, role: 'dependent' })).toBe(true)
    await expect(deletePerson(db, holder.id)).rejects.toThrow('holder not deletable')

    const stored = await db.persons.get(holder.id)
    expect(stored?.deleted).toBe(0)
    expect((await db.outbox.toArray()).filter((o) => o.type === 'person.delete')).toHaveLength(0)
  })

  it('account.settings.offline: holder phone change is stored and queues person.upsert in one transaction', async () => {
    const holder = holderRecord()
    await db.persons.add(holder)

    setOnline(false)
    try {
      const result = await savePerson(
        db,
        ACCOUNT_ID,
        { ...holder, id: holder.id, phone: '0911222333' },
        TODAY,
      )

      expect(result.ok).toBe(true)
      const stored = await db.persons.get(holder.id)
      expect(stored?.phone).toBe('0911222333')

      const ops = (await db.outbox.toArray()).filter((o) => o.type === 'person.upsert')
      expect(ops).toHaveLength(1)
      expect(ops[0]).toMatchObject({ entity: 'person', entityId: holder.id })
    } finally {
      setOnline(true)
    }
  })
})
