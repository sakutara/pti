import { signal } from '@preact/signals'

export interface Route {
  path: string
  params: Record<string, string>
  /** Decoded `?key=value` pairs of the hash, e.g. `#/facilities?q=mai` → `{ q: 'mai' }`. */
  query: Record<string, string>
}

/** Every hash route the app understands. `:name` is required; a trailing `:name?` is optional. */
export const KNOWN_PATTERNS = [
  '/',
  '/claims',
  '/facilities',
  '/facilities/:id',
  '/account',
  '/account/person/:id',
  '/wallet/:personId?',
  '/benefits/:personId?',
  '/documents',
  '/documents/:id',
  '/invoice-guide/:personId?',
  // Order matters: matchRoute takes the first match, so /claims/new must come before /claims/:id.
  '/claims/new',
  '/claims/:id/edit',
  '/claims/:id',
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

/** Reads the query part of a hash ("facilities?q=a%20b" → { q: 'a b' }). Empty values are kept. */
function parseQuery(search: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of new URLSearchParams(search)) out[key] = value
  return out
}

/**
 * Builds the `?…` part of a hash, dropping empty values. Commas stay literal so lists read
 * as `s=inpatient,dental`.
 */
export function encodeQuery(query: Record<string, string>): string {
  const parts = Object.entries(query)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value).replace(/%2C/gi, ',')}`)
  return parts.length > 0 ? `?${parts.join('&')}` : ''
}

/** Reads `location.hash` ("#/claims" → "/claims"). An empty hash means Trang chủ. */
function readHash(): { path: string; query: Record<string, string> } {
  const raw = location.hash.replace(/^#/, '')
  const cut = raw.indexOf('?')
  const pathPart = cut === -1 ? raw : raw.slice(0, cut)
  const queryPart = cut === -1 ? '' : raw.slice(cut + 1)
  const path = pathPart === '' ? '/' : pathPart.startsWith('/') ? pathPart : `/${pathPart}`
  return { path, query: parseQuery(queryPart) }
}

export const route = signal<Route>({ path: '/', params: {}, query: {} })

/**
 * Re-reads the hash into the `route` signal. Unknown paths are replaced with `#/`
 * so the home destination renders instead.
 */
export function refreshRoute(): void {
  const { path, query } = readHash()
  const match = matchRoute(path, KNOWN_PATTERNS)
  if (match) {
    route.value = { path, params: match.params, query }
    return
  }
  location.replace('#/')
  route.value = { path: '/', params: {}, query: {} }
}

/** Sets the hash; the hashchange listener updates the signal. */
export function navigate(path: string): void {
  location.hash = path.startsWith('/') ? path : `/${path}`
}

/** Replaces the current history entry with `path` and updates the route signal at once (no new entry, no hashchange wait). */
export function replacePath(path: string): void {
  history.replaceState(history.state, '', `#${path.startsWith('/') ? path : `/${path}`}`)
  refreshRoute()
}

/**
 * Replaces the query of the current route without a new history entry (typing in a search
 * box must not push one entry per keystroke). Empty values are dropped. Does not fire
 * hashchange, so the signal is updated here.
 */
export function replaceQuery(query: Record<string, string>): void {
  const { path, params } = route.value
  const kept = Object.fromEntries(Object.entries(query).filter(([, value]) => value !== ''))
  history.replaceState(history.state, '', `#${path}${encodeQuery(kept)}`)
  route.value = { path, params, query: kept }
}

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', refreshRoute)
}
