// Evaluates the `when` conditions of the claim requirements against a claim.
import type { Claim } from './claim-types'
import type { DocumentRecord } from './document-types'
import type { Condition } from './requirements-schema'

/**
 * True when the condition holds for the claim. `totalGte` is inclusive. Documents are passed through so that a
 * condition can look at them later; the current dataset only uses flags and the total.
 */
export function evaluate(cond: Condition, claim: Claim, documents: readonly DocumentRecord[]): boolean {
  if ('flag' in cond) return claim.flags[cond.flag] === true
  if ('totalGte' in cond) return claim.totalClaimed >= cond.totalGte
  if ('all' in cond) return cond.all.every((c) => evaluate(c, claim, documents))
  if ('any' in cond) return cond.any.some((c) => evaluate(c, claim, documents))
  return !evaluate(cond.not, claim, documents)
}
