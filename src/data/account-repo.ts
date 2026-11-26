import { newId, now, type AppDB } from '../db/db'
import { enqueue } from '../sync/outbox'
import type { Account, Person, PersonInput } from '../domain/types'
import { validatePerson } from '../domain/person-validation'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type AccountPatch = Partial<Pick<Account, 'displayName' | 'administrator' | 'claimEmail' | 'claimCc' | 'defaultBank'>>

/** The single non-deleted account, if onboarding has happened. */
export async function getAccount(db: AppDB): Promise<Account | undefined> {
  return db.account.filter((a) => a.deleted === 0).first()
}

/** Creates the local account and its holder in one transaction. Stores nothing when validation fails. */
export async function createAccount(
  db: AppDB,
  holder: PersonInput,
  today: string,
): Promise<{ ok: true; account: Account; holder: Person } | { ok: false; errors: Record<string, string> }> {
  const input: PersonInput = { ...holder, role: 'holder', relation: 'self', memberType: 'employee' }
  const errs = validatePerson(input, today)
  if (Object.keys(errs).length > 0) return { ok: false, errors: { ...errs } as Record<string, string> }

  if ((await getAccount(db)) !== undefined) throw new Error('account exists')

  const accountId = newId()
  const stamp = now()
  const account: Account = {
    id: accountId,
    displayName: holder.fullName,
    administrator: 'marsh',
    claimEmail: null,
    claimCc: [],
    defaultBank: null,
    onboardedAt: stamp,
    updatedAt: stamp,
    deleted: 0,
  }
  const person: Person = {
    ...input,
    id: newId(),
    accountId,
    cardFrontFileId: null,
    cardBackFileId: null,
    updatedAt: stamp,
    deleted: 0,
  }

  await db.transaction('rw', db.account, db.persons, db.outbox, async () => {
    await db.account.add(account)
    await db.persons.add(person)
    await enqueue(db, { type: 'account.upsert', entity: 'account', entityId: account.id, payload: account })
    await enqueue(db, { type: 'person.upsert', entity: 'person', entityId: person.id, payload: person })
  })

  return { ok: true, account, holder: person }
}

/** Validates and applies an account patch, bumping updatedAt and queuing account.upsert atomically. */
export async function updateAccount(
  db: AppDB,
  patch: AccountPatch,
): Promise<{ ok: true; account: Account } | { ok: false; errors: Record<string, string> }> {
  const errors: Record<string, string> = {}
  const next: AccountPatch = { ...patch }

  if (patch.displayName !== undefined) next.displayName = patch.displayName.trim()

  if (patch.claimEmail !== undefined) {
    const email = patch.claimEmail === null ? '' : patch.claimEmail.trim()
    if (email === '') next.claimEmail = null
    else if (EMAIL_PATTERN.test(email)) next.claimEmail = email
    else errors.claimEmail = 'error.email'
  }

  if (patch.claimCc !== undefined) {
    const cc = patch.claimCc.map((e) => e.trim()).filter((e) => e !== '')
    if (cc.some((e) => !EMAIL_PATTERN.test(e))) errors.claimCc = 'error.email'
    next.claimCc = cc
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  let updated!: Account
  await db.transaction('rw', db.account, db.outbox, async () => {
    const current = await getAccount(db)
    if (!current) throw new Error('no account')
    updated = {
      ...current,
      ...next,
      updatedAt: Math.max(now(), current.updatedAt + 1),
    }
    await db.account.put(updated)
    await enqueue(db, { type: 'account.upsert', entity: 'account', entityId: updated.id, payload: updated })
  })

  return { ok: true, account: updated }
}
