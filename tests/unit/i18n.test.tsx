import { render } from '@testing-library/preact'
import { describe, expect, it } from 'vitest'
import { t, MISSING } from '../../src/i18n'
import { vi as messages } from '../../src/i18n/vi'

// Shared helper: later page tests reuse this to assert no missing-key marker leaked into the DOM.
export function expectNoMissing(container: Element): void {
  expect(container.textContent ?? '').not.toContain(MISSING)
}

describe('app-shell.i18n', () => {
  it('app-shell.i18n.no-missing-keys: resolves a flat key', () => {
    expect(t('nav.home')).toBe('Trang chủ')
  })

  it('app-shell.i18n.no-missing-keys: substitutes named placeholders', () => {
    expect(t('home.tier', { tier: 2 })).toBe('Hạng 2')
  })

  it('app-shell.i18n.no-missing-keys: missing key returns the missing-key marker', () => {
    expect(t('nope')).toBe('⟦nope⟧')
  })

  it('app-shell.i18n.no-missing-keys: every message value is a non-empty string', () => {
    const entries = Object.entries(messages)
    expect(entries.length).toBeGreaterThan(0)
    for (const [key, value] of entries) {
      expect(typeof value, key).toBe('string')
      expect(value.trim(), key).not.toBe('')
    }
  })

  it('claims.check.deadline: remaining days text matches the spec', () => {
    expect(t('check.deadline.remaining', { days: 45, deadline: '10/01/2027' })).toBe(
      'Còn 45 ngày để nộp hồ sơ (hạn 10/01/2027)',
    )
  })

  it('claims.check.deadline-passed: passed deadline names the date it passed', () => {
    expect(t('check.deadline.passed', { deadline: '01/10/2026' })).toContain('01/10/2026')
  })

  it('claims.check.child-age: warning states the insured age limit', () => {
    expect(t('check.childAge', { maxAge: 25 })).toContain('25 tuổi')
  })

  it('claims.check.invoice-date: says to add the slip of the actual treatment date', () => {
    expect(t('check.invoiceDate')).toContain('ngày điều trị thực tế')
  })

  it('claims.check.not-covered: names the tier and the benefit', () => {
    expect(t('check.notCovered', { tier: 2, category: 'thai sản' })).toBe('Hạng 2 không có quyền lợi thai sản')
  })

  it('claims.check.direct-billing-hint: mentions the card and ID instead of paying', () => {
    const text = t('check.directBillingHint', { service: 'ngoại trú' })
    expect(text).toContain('ngoại trú')
    expect(text).toContain('thẻ')
    expect(text).toContain('trả trước')
  })

  it('claim-tracking.timeline.amounts: shows requested, approved and difference amounts', () => {
    expect(t('claim.amount.claimed', { amount: '750.000 đ' })).toBe('Yêu cầu 750.000 đ')
    expect(t('claim.amount.approved', { amount: '500.000 đ' })).toBe('Được duyệt 500.000 đ')
    expect(t('claim.amount.difference', { amount: '250.000 đ' })).toBe('Chênh lệch 250.000 đ')
  })

  it('claims.check: every check code has a message', () => {
    const codes = [
      'check.deadline.remaining',
      'check.deadline.passed',
      'check.invoiceDate',
      'check.childAge',
      'check.cardInvalid',
      'check.notCovered',
      'check.blacklisted',
      'check.directBillingHint',
    ]
    for (const code of codes) expect(messages, code).toHaveProperty(code)
  })

  it('claim-submission.send: every send error code has a message, and saveFailed says the email was sent', () => {
    const codes = [
      'send.offline',
      'send.notConnected',
      'send.tokenExpired',
      'send.failed',
      'send.invalidMessage',
      'send.inProgress',
      'send.notReady',
      'send.saveFailed',
      'send.alreadySent',
    ]
    for (const code of codes) expect(messages, code).toHaveProperty(code)
    expect(t('send.saveFailed')).toContain('đã được gửi')
    expect(t('send.saveFailed')).toContain('Đừng gửi lại')
  })

  it('claims.wizard: every claim-domain error code has a message', () => {
    const codes = [
      'error.statusTransitionInvalid',
      'error.amountRequired',
      'error.amountInvalid',
      'error.amountTooHigh',
      'error.reasonRequired',
      'error.recipientMissing',
      'error.claimNotFound',
      'error.claimTypeInvalid',
      'error.opticalEmployeeOnly',
      'error.personNotFound',
      'error.dateInvalid',
      'error.daysOffInvalid',
      'error.wizardStepInvalid',
      'error.documentNotFound',
      'error.documentInClaim',
      'error.documentOtherPerson',
      'error.documentNotInClaim',
      'error.notDraft',
    ]
    for (const code of codes) expect(messages, code).toHaveProperty(code)
  })

  it('claims.form: every missing-field key of claim-form.ts has a label', () => {
    const keys = [
      'reason',
      'visitDate',
      'facilityName',
      'diagnosis',
      'patientName',
      'patientDob',
      'patientTier',
      'policyholderName',
      'contractCode',
      'patientPhone',
      'employeeName',
      'employeeCode',
      'jobTitle',
      'employeeEmail',
      'bank',
      'invoices',
      'unconfirmedInvoices',
    ]
    for (const key of keys) expect(messages, key).toHaveProperty(`claim.missing.${key}`)
  })

  it('app-shell.i18n.no-missing-keys: rendered strings contain no missing-key marker', () => {
    const { container } = render(
      <nav>
        <span>{t('nav.home')}</span>
        <span>{t('nav.claims')}</span>
        <span>{t('nav.facilities')}</span>
        <span>{t('nav.account')}</span>
        <p>{t('home.tier', { tier: 1 })}</p>
        <p>{t('home.openClaims', { count: 3 })}</p>
      </nav>,
    )
    expectNoMissing(container)
  })
})
