import type { AppDB } from '../db/db'
import { newId, now } from '../db/db'
import { enqueue } from '../sync/outbox'
import type { BankAccount, Person, PersonInput } from '../domain/types'
import { validatePerson } from '../domain/person-validation'

export type SavePersonResult =
  | { ok: true; person: Person }
  | { ok: false; errors: Record<string, string> }

/** Non-deleted persons of an account: holder first, then dependents by name. */
export async function listPersons(db: AppDB, accountId: string): Promise<Person[]> {
  const rows = await db.persons
    .where('accountId')
    .equals(accountId)
    .filter((p) => p.deleted === 0)
    .toArray()
  return rows.sort((a, b) => {
    if (a.role !== b.role) return a.role === 'holder' ? -1 : 1
    return a.fullName.localeCompare(b.fullName, 'vi')
  })
}

/** A single non-deleted person, or undefined. */
export async function getPerson(db: AppDB, id: string): Promise<Person | undefined> {
  const person = await db.persons.get(id)
  return person && person.deleted === 0 ? person : undefined
}

/**
 * Creates or updates a person and queues `person.upsert` in the same transaction.
 * An existing record keeps its accountId, card file ids and role (role cannot change).
 */
export async function savePerson(
  db: AppDB,
  accountId: string,
  input: PersonInput,
  today: string,
): Promise<SavePersonResult> {
  return db.transaction('rw', db.persons, db.outbox, async () => {
    const existing = input.id ? await db.persons.get(input.id) : undefined
    const live = existing && existing.deleted === 0 ? existing : undefined

    const role = live ? live.role : input.role
    const effective: PersonInput = { ...input, role }

    const errors: Record<string, string> = { ...validatePerson(effective, today) }

    if (!live && role === 'holder') {
      const holders = (await listPersons(db, accountId)).filter((p) => p.role === 'holder')
      if (holders.length > 0) errors.role = 'error.holderExists'
    }

    if (Object.keys(errors).length > 0) return { ok: false, errors }

    const person: Person = {
      id: live ? live.id : (input.id ?? newId()),
      accountId: live ? live.accountId : accountId,
      role,
      relation: input.relation,
      memberType: input.memberType,
      fullName: input.fullName,
      dateOfBirth: input.dateOfBirth,
      idNumber: input.idNumber,
      phone: input.phone,
      email: input.email,
      address: input.address,
      employeeCode: input.employeeCode,
      jobTitle: input.jobTitle,
      tier: input.tier,
      policyholderName: input.policyholderName,
      contractCode: input.contractCode,
      cardNumber: input.cardNumber,
      cardValidFrom: input.cardValidFrom,
      cardValidTo: input.cardValidTo,
      cardFrontFileId: live ? live.cardFrontFileId : null,
      cardBackFileId: live ? live.cardBackFileId : null,
      bank: input.bank,
      updatedAt: now(),
      deleted: 0,
    }

    await db.persons.put(person)
    await enqueue(db, { type: 'person.upsert', entity: 'person', entityId: person.id, payload: person })
    return { ok: true, person }
  })
}

/** Soft-deletes a dependent and queues `person.delete`. The holder can never be deleted. */
export async function deletePerson(db: AppDB, id: string): Promise<void> {
  await db.transaction('rw', db.persons, db.outbox, async () => {
    const person = await db.persons.get(id)
    if (!person) throw new Error('person not found')
    if (!canDelete(person)) throw new Error('holder not deletable')
    if (person.deleted === 1) return

    const updatedAt = now()
    await db.persons.put({ ...person, deleted: 1, updatedAt })
    await enqueue(db, { type: 'person.delete', entity: 'person', entityId: id, payload: { id } })
  })
}

/** Only dependents can be deleted; the UI hides the delete action otherwise. */
export function canDelete(person: Person): boolean {
  return person.role === 'dependent'
}

export function formatBank(b: BankAccount): string {
  return `${b.bankName} / ${b.accountName} / ${b.accountNumber}`
}
