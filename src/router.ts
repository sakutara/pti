import { signal } from '@preact/signals'

export interface Route {
  path: string
  params: Record<string, string>
}

/** Every hash route the app understands. `:name` is required; a trailing `:name?` is optional. */
export const KNOWN_PATTERNS = [
  '/',
  '/claims',
  '/facilities',
  '/account',
  '/account/person/:id',
  '/wallet/:personId?',
] as const

export type KnownPattern = (typeof KNOWN_PATTERNS)[number]

function splitPath(path: string): string[] {
  return path.split('/').filter((s) => s !== '')
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

function matchPattern(segments: string[], pattern: string): Record<string, string> | null {
  const parts = splitPath(pattern)
  if (segments.length > parts.length) return null

  const params: Record<string, string> = {}
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const value = segments[i]
    if (part.startsWith(':')) {
      const optional = part.endsWith('?')
      const name = part.slice(1, optional ? -1 : undefined)
      if (value === undefined) {
        if (optional) continue
        return null
      }
      params[name] = decode(value)
    } else if (value !== part) {
      return null
    }
  }
  return params
}

/** Returns the first pattern that matches `path`, with its decoded params, or null. */
export function matchRoute<P extends string>(
  path: string,
  patterns: readonly P[],
): { pattern: P; params: Record<string, string> } | null {
  const segments = splitPath(path)
  for (const pattern of patterns) {
    const params = matchPattern(segments, pattern)
    if (params) return { pattern, params }
  }
  return null
}

/** Reads `location.hash` ("#/claims" → "/claims"). An empty hash means Trang chủ. */
function readHash(): string {
  const raw = location.hash.replace(/^#/, '')
  if (raw === '') return '/'
  return raw.startsWith('/') ? raw : `/${raw}`
}

export const route = signal<Route>({ path: '/', params: {} })

/**
 * Re-reads the hash into the `route` signal. Unknown paths are replaced with `#/`
 * so the home destination renders instead.
 */
export function refreshRoute(): void {
  const path = readHash()
  const match = matchRoute(path, KNOWN_PATTERNS)
  if (match) {
    route.value = { path, params: match.params }
    return
  }
  location.replace('#/')
  route.value = { path: '/', params: {} }
}

/** Sets the hash; the hashchange listener updates the signal. */
export function navigate(path: string): void {
  location.hash = path.startsWith('/') ? path : `/${path}`
}

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', refreshRoute)
}
