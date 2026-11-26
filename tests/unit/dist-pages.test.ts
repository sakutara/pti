import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

// Runs only after `npm run build` has produced dist/.
const root = resolve(__dirname, '../..')
const dist = (rel: string) => resolve(root, 'dist', rel)
const source = (rel: string) => readFileSync(resolve(root, 'public', rel), 'utf8')

describe.skipIf(!existsSync(dist('index.html')))('public-pages dist', () => {
  it('public-pages.routing.in-dist: dist/about/index.html exists', () => {
    expect(existsSync(dist('about/index.html'))).toBe(true)
  })

  it('public-pages.routing.in-dist: dist/privacy/index.html exists', () => {
    expect(existsSync(dist('privacy/index.html'))).toBe(true)
  })

  it('public-pages.routing.in-dist: built pages are byte-identical to the final public sources', () => {
    expect(readFileSync(dist('about/index.html'), 'utf8')).toBe(source('about/index.html'))
    expect(readFileSync(dist('privacy/index.html'), 'utf8')).toBe(source('privacy/index.html'))
  })

  it('public-pages.routing.in-dist: postbuild does not overwrite the public pages', () => {
    const postbuild = readFileSync(resolve(root, 'scripts/postbuild.mjs'), 'utf8')
    expect(postbuild).not.toMatch(/about|privacy/)
  })

  it('public-pages.routing.not-spa-fallback: built service worker denylists /about/ and /privacy/', () => {
    const sw = readFileSync(dist('sw.js'), 'utf8')
    expect(sw).toContain('/^\\/about\\//')
    expect(sw).toContain('/^\\/privacy\\//')
  })

  it('public-pages.offline: precache manifest lists about and privacy pages', () => {
    const sw = readFileSync(dist('sw.js'), 'utf8')
    expect(sw).toContain('about/index.html')
    expect(sw).toContain('privacy/index.html')
  })
})
