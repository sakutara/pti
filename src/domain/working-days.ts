// Calendar and working-day arithmetic on YYYY-MM-DD strings (UTC internally, so the result does not depend on
// the time zone). Public holidays are not excluded: Monday to Friday only, as the insurer's reply clock is
// counted in the design.
import { todayIso } from '../lib/dates'
import type { Claim, ClaimType } from './claim-types'
import type { ReplyWindow } from './requirements-schema'

const DAY_MS = 86_400_000
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** True for a real calendar date written as YYYY-MM-DD. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

function utcDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / DAY_MS
}

function isoOfUtcDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

/** The date `days` calendar days after `iso`. `iso` must be a valid date. */
export function addDays(iso: string, days: number): string {
  return isoOfUtcDay(utcDay(iso) + days)
}

/** Calendar days from `from` to `to` (negative when `to` is earlier). Both must be valid dates. */
export function dayDiff(from: string, to: string): number {
  return utcDay(to) - utcDay(from)
}

/** Monday to Friday days after `from`, up to and including `to`. 0 when `to` is not after `from` or a date is invalid. */
export function workingDaysBetween(from: string, to: string): number {
  if (!isIsoDate(from) || !isIsoDate(to)) return 0
  const span = dayDiff(from, to)
  if (span <= 0) return 0
  let count = 0
  const start = utcDay(from)
  for (let offset = 1; offset <= span; offset++) {
    const weekday = new Date((start + offset) * DAY_MS).getUTCDay()
    if (weekday >= 1 && weekday <= 5) count++
  }
  return count
}

/** Age in whole years on the date `on`. Both must be valid dates. */
export function ageOn(birth: string, on: string): number {
  const [by, bm, bd] = birth.split('-').map(Number)
  const [oy, om, od] = on.split('-').map(Number)
  let years = oy - by
  if (om < bm || (om === bm && od < bd)) years--
  return years
}

/** Reply time in working days for a claim total. Windows are checked in order; `below` is exclusive. */
export function replyLimit(total: number, windows: readonly ReplyWindow[]): number {
  for (const w of windows) {
    if (w.below === undefined || total < w.below) return w.days
  }
  return windows[windows.length - 1].days
}

/** Claim types whose originals must reach the insurer (policy-2026: inpatient and maternity). */
export function requiresOriginals(type: ClaimType): boolean {
  return type === 'inpatient' || type === 'maternity'
}

/** True when the claim needs originals and they have not been handed in yet. */
export function awaitingOriginals(claim: Pick<Claim, 'type' | 'originalsSubmittedAt'>): boolean {
  return requiresOriginals(claim.type) && claim.originalsSubmittedAt === null
}

/**
 * Overdue reply. Only a submitted claim can be overdue. The count starts at the latest submission, or at the day
 * the originals were handed in for claims that need them (no count until then). Overdue when the working days
 * passed are more than the reply limit for the claim total.
 */
export function isOverdue(claim: Claim, today: string, windows: readonly ReplyWindow[]): boolean {
  if (claim.status !== 'submitted' || claim.submittedAt === null) return false
  if (requiresOriginals(claim.type)) {
    if (claim.originalsSubmittedAt === null) return false
    return workingDaysBetween(localIso(claim.originalsSubmittedAt), today) > replyLimit(claim.totalClaimed, windows)
  }
  return workingDaysBetween(localIso(claim.submittedAt), today) > replyLimit(claim.totalClaimed, windows)
}

function localIso(epochMs: number): string {
  return todayIso(new Date(epochMs))
}
