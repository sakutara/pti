import type { AppDB } from '../db/db'

/** Claims not yet closed. Returns 0 until the claims table arrives in a later change. */
export async function countOpenClaims(_db: AppDB): Promise<number> {
  return 0
}
