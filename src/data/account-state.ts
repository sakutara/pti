import { signal } from '@preact/signals'
import { db, type AppDB } from '../db/db'
import type { Account } from '../domain/types'
import { getAccount } from './account-repo'

export type AccountState =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'ready'; account: Account }

export const accountState = signal<AccountState>({ status: 'loading' })

/** Reads the local account and publishes it to `accountState`. */
export async function loadAccount(database: AppDB): Promise<void> {
  const account = await getAccount(database)
  accountState.value = account ? { status: 'ready', account } : { status: 'none' }
}

/** Re-reads the account from the app database after a write elsewhere. */
export function refreshAccount(): Promise<void> {
  return loadAccount(db)
}
