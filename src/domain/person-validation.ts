import type { PersonInput } from './types'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TIERS: readonly number[] = [1, 2, 3, 4]

/** True when `value` is a real calendar date in YYYY-MM-DD form. */
function isValidCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/**
 * Validates a person input and returns a message key per invalid field.
 * Returns `{}` when the input is valid. `today` is passed in (YYYY-MM-DD) to keep this pure.
 */
export function validatePerson(
  input: PersonInput,
  today: string,
): Partial<Record<keyof PersonInput, string>> {
  const errors: Partial<Record<keyof PersonInput, string>> = {}

  if (input.fullName.trim() === '') {
    errors.fullName = 'error.required'
  }

  if (!isValidCalendarDate(input.dateOfBirth)) {
    errors.dateOfBirth = 'error.date'
  } else if (input.dateOfBirth > today) {
    errors.dateOfBirth = 'error.dateFuture'
  }

  if (!TIERS.includes(input.tier)) {
    errors.tier = 'error.tier'
  }

  const memberTypeValid =
    input.role === 'holder'
      ? input.memberType === 'employee'
      : input.memberType === 'sponsored' || input.memberType === 'voluntary'
  if (!memberTypeValid) {
    errors.memberType = 'error.memberType'
  }

  if (input.email !== null && input.email !== '' && !EMAIL_PATTERN.test(input.email)) {
    errors.email = 'error.email'
  }

  if (
    input.cardValidFrom !== null &&
    input.cardValidTo !== null &&
    input.cardValidFrom > input.cardValidTo
  ) {
    errors.cardValidTo = 'error.cardValidity'
  }

  return errors
}
