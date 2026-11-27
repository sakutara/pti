// Which document requirements apply to a claim, and which required ones are still missing.
import { evaluate } from './conditions'
import type { Claim } from './claim-types'
import type { DocumentRecord } from './document-types'
import type { ClaimRequirements, Requirement } from './requirements-schema'

/** Requirements for the claim's type whose condition holds for the claim (a null condition always applies). */
export function applicableRequirements(
  dataset: ClaimRequirements,
  claim: Claim,
  documents: readonly DocumentRecord[],
): Requirement[] {
  return dataset.requirements.filter(
    (r) => r.claimTypes.includes(claim.type) && (r.when === null || evaluate(r.when, claim, documents)),
  )
}

/**
 * Required requirements with no live document of one of their categories. Documents are the claim's own;
 * deleted ones do not count.
 */
export function missingRequired(reqs: readonly Requirement[], documents: readonly DocumentRecord[]): Requirement[] {
  const live = documents.filter((d) => d.deleted === 0)
  return reqs.filter((r) => r.required && !live.some((d) => r.categories.includes(d.category)))
}
