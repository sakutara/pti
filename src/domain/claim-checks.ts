// Warnings shown before a claim is saved or sent. They never block saving. Each check returns a code and
// parameters; the UI maps codes to text. A check whose data is missing or invalid is skipped, never thrown.
import { benefitsFor } from './benefits'
import type { BenefitsDataset } from './benefits-schema'
import type { Claim, ClaimType } from './claim-types'
import type { DocumentRecord } from './document-types'
import type { Facility, Service } from './facilities-schema'
import type { Person } from './types'
import { addDays, ageOn, dayDiff, isIsoDate } from './working-days'

export type CheckCode =
  | 'check.deadline.remaining'
  | 'check.deadline.passed'
  | 'check.invoiceDate'
  | 'check.childAge'
  | 'check.cardInvalid'
  | 'check.notCovered'
  | 'check.blacklisted'
  | 'check.directBillingHint'

export interface Check {
  code: CheckCode
  severity: 'warning' | 'info'
  params: Record<string, string | number>
}

export interface CheckInput {
  claim: Claim
  person: Person | null
  benefits: BenefitsDataset | null
  facility: Facility | null
  /** The claim's documents; only invoices are read. */
  documents?: readonly DocumentRecord[]
  /** YYYY-MM-DD. */
  today: string
}

/** Children are insured up to this age (inclusive); older children at the treatment date get the warning. */
const CHILD_MAX_AGE = 25

/** Direct billing service for each claim type. Maternity is billed as inpatient care. */
const SERVICE_OF: Partial<Record<ClaimType, Service>> = {
  outpatient: 'outpatient',
  dental: 'dental',
  inpatient: 'inpatient',
  maternity: 'inpatient',
}

/** The date that starts the deadline and that invoices must match: discharge date when there is one. */
const milestoneOf = (claim: Claim): string => claim.dischargeDate ?? claim.treatmentDate

function deadlineCheck(claim: Claim, benefits: BenefitsDataset | null, today: string): Check | null {
  const milestone = milestoneOf(claim)
  if (!benefits || !isIsoDate(milestone) || !isIsoDate(today)) return null
  const deadline = addDays(milestone, benefits.claimDeadlineDays)
  const left = dayDiff(today, deadline)
  if (left < 0) return { code: 'check.deadline.passed', severity: 'warning', params: { deadline } }
  return { code: 'check.deadline.remaining', severity: 'info', params: { days: left, deadline } }
}

function invoiceDateCheck(claim: Claim, documents: readonly DocumentRecord[]): Check | null {
  const milestone = milestoneOf(claim)
  if (!isIsoDate(milestone)) return null
  const mismatch = documents.some(
    (d) => d.deleted === 0 && d.category === 'invoice' && isIsoDate(d.docDate) && d.docDate !== milestone,
  )
  return mismatch ? { code: 'check.invoiceDate', severity: 'warning', params: {} } : null
}

function childAgeCheck(claim: Claim, person: Person | null): Check | null {
  if (!person || person.relation !== 'child') return null
  if (!isIsoDate(person.dateOfBirth) || !isIsoDate(claim.treatmentDate)) return null
  if (ageOn(person.dateOfBirth, claim.treatmentDate) <= CHILD_MAX_AGE) return null
  return { code: 'check.childAge', severity: 'warning', params: { maxAge: CHILD_MAX_AGE } }
}

function cardCheck(claim: Claim, person: Person | null): Check | null {
  if (!person || !isIsoDate(claim.treatmentDate)) return null
  const date = claim.treatmentDate
  const notYet = isIsoDate(person.cardValidFrom) && date < person.cardValidFrom
  const expired = isIsoDate(person.cardValidTo) && date > person.cardValidTo
  return notYet || expired ? { code: 'check.cardInvalid', severity: 'warning', params: {} } : null
}

function coverageCheck(claim: Claim, person: Person | null, benefits: BenefitsDataset | null): Check | null {
  if (!person || !benefits) return null
  const group = benefitsFor(benefits, person.tier, person.memberType).find((g) => g.category === claim.type)
  if (!group || group.covered) return null
  return { code: 'check.notCovered', severity: 'warning', params: { tier: person.tier } }
}

function blacklistCheck(facility: Facility | null): Check | null {
  return facility?.blacklisted ? { code: 'check.blacklisted', severity: 'warning', params: {} } : null
}

function directBillingCheck(claim: Claim, facility: Facility | null): Check | null {
  const service = SERVICE_OF[claim.type]
  if (!facility || !service || facility.blacklisted || !facility[service]) return null
  return { code: 'check.directBillingHint', severity: 'info', params: { service } }
}

/** Runs every pre-submission check in a fixed order. Missing data skips the check that needs it. */
export function runChecks(input: CheckInput): Check[] {
  const { claim, person, benefits, facility, today } = input
  const documents = input.documents ?? []
  const results = [
    deadlineCheck(claim, benefits, today),
    invoiceDateCheck(claim, documents),
    childAgeCheck(claim, person),
    cardCheck(claim, person),
    coverageCheck(claim, person, benefits),
    blacklistCheck(facility),
    directBillingCheck(claim, facility),
  ]
  return results.filter((c): c is Check => c !== null)
}
