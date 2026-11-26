import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/preact'
import { afterEach } from 'vitest'

// Unmount rendered components between tests (auto-cleanup needs vitest globals, which we don't enable).
afterEach(() => cleanup())

export function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
  window.dispatchEvent(new Event(value ? 'online' : 'offline'))
}
