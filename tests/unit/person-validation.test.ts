import { describe, expect, it } from 'vitest'
import type { PersonInput } from '../../src/domain/types'
import { validatePerson } from '../../src/domain/person-validation'

const TODAY = '2026-11-26'

const validHolder = (): PersonInput => ({
  role: 'holder',
  relation: 'self',
  memberType: 'employee',
  fullName: 'Nguyen Van A',
  dateOfBirth: '1990-05-01',
  idNumber: null,
  phone: null,
  email: null,
  address: null,
  employeeCode: null,
  jobTitle: null,
  tier: 1,
  policyholderName: null,
  contractCode: null,
  cardNumber: null,
  cardValidFrom: null,
  cardValidTo: null,
  bank: null,
})

const validDependent = (): PersonInput => ({
  ...validHolder(),
  role: 'dependent',
  relation: 'child',
  memberType: 'sponsored',
})

describe('account.onboarding.validation', () => {
  it('account.onboarding.validation: returns no errors for a valid holder input', () => {
    expect(validatePerson(validHolder(), TODAY)).toEqual({})
  })

  it('account.onboarding.validation: returns no errors for a valid dependent input', () => {
    expect(validatePerson(validDependent(), TODAY)).toEqual({})
  })

  it('account.onboarding.validation: rejects an empty full name', () => {
    expect(validatePerson({ ...validHolder(), fullName: '' }, TODAY)).toEqual({ fullName: 'error.required' })
  })

  it('account.onboarding.validation: rejects a full name that is only whitespace', () => {
    expect(validatePerson({ ...validHolder(), fullName: '   ' }, TODAY)).toEqual({ fullName: 'error.required' })
  })

  it('account.onboarding.validation: rejects a malformed date of birth', () => {
    expect(validatePerson({ ...validHolder(), dateOfBirth: '1990-5-1' }, TODAY)).toEqual({ dateOfBirth: 'error.date' })
  })

  it('account.onboarding.validation: rejects a non-existent calendar date', () => {
    expect(validatePerson({ ...validHolder(), dateOfBirth: '1990-02-30' }, TODAY)).toEqual({ dateOfBirth: 'error.date' })
  })

  it('account.onboarding.validation: rejects a date of birth in the future', () => {
    expect(validatePerson({ ...validHolder(), dateOfBirth: '2026-11-27' }, TODAY)).toEqual({
      dateOfBirth: 'error.dateFuture',
    })
  })

  it('account.onboarding.validation: accepts a date of birth equal to today', () => {
    expect(validatePerson({ ...validHolder(), dateOfBirth: TODAY }, TODAY)).toEqual({})
  })

  it('account.onboarding.validation: rejects a tier outside 1..4', () => {
    expect(validatePerson({ ...validHolder(), tier: 5 as unknown as PersonInput['tier'] }, TODAY)).toEqual({
      tier: 'error.tier',
    })
    expect(validatePerson({ ...validHolder(), tier: 0 as unknown as PersonInput['tier'] }, TODAY)).toEqual({
      tier: 'error.tier',
    })
  })

  it('account.onboarding.validation: rejects a holder whose member type is not employee', () => {
    expect(validatePerson({ ...validHolder(), memberType: 'sponsored' }, TODAY)).toEqual({
      memberType: 'error.memberType',
    })
  })

  it('account.onboarding.validation: rejects a dependent whose member type is employee', () => {
    expect(validatePerson({ ...validDependent(), memberType: 'employee' }, TODAY)).toEqual({
      memberType: 'error.memberType',
    })
  })

  it('account.onboarding.validation: accepts a voluntary dependent', () => {
    expect(validatePerson({ ...validDependent(), memberType: 'voluntary' }, TODAY)).toEqual({})
  })

  it('account.onboarding.validation: rejects a malformed email', () => {
    expect(validatePerson({ ...validHolder(), email: 'not-an-email' }, TODAY)).toEqual({ email: 'error.email' })
    expect(validatePerson({ ...validHolder(), email: 'a b@x.com' }, TODAY)).toEqual({ email: 'error.email' })
  })

  it('account.onboarding.validation: ignores null or empty email', () => {
    expect(validatePerson({ ...validHolder(), email: null }, TODAY)).toEqual({})
    expect(validatePerson({ ...validHolder(), email: '' }, TODAY)).toEqual({})
  })

  it('account.onboarding.validation: rejects card validity where from is after to', () => {
    expect(
      validatePerson({ ...validHolder(), cardValidFrom: '2027-01-01', cardValidTo: '2026-01-01' }, TODAY),
    ).toEqual({ cardValidTo: 'error.cardValidity' })
  })

  it('account.onboarding.validation: accepts card validity where from equals to', () => {
    expect(
      validatePerson({ ...validHolder(), cardValidFrom: '2026-01-01', cardValidTo: '2026-01-01' }, TODAY),
    ).toEqual({})
  })
})
