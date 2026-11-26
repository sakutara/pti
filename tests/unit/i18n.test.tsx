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
