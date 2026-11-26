import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

const root = resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8')

describe('deploy.custom-domain', () => {
  it('deploy.custom-domain: public/CNAME contains exactly pti.fiddle.vn', () => {
    expect(read('public/CNAME').trim()).toBe('pti.fiddle.vn')
  })

  it("deploy.custom-domain: vite base defaults to '/' and not '/pti/'", () => {
    const cfg = read('vite.config.ts')
    expect(cfg).toContain("process.env.BASE_PATH ?? '/'")
    expect(cfg).not.toContain("'/pti/'")
  })

  it("deploy.custom-domain: PWA manifest keeps start_url and scope './'", () => {
    const cfg = read('vite.config.ts')
    expect(cfg).toContain("start_url: './'")
    expect(cfg).toContain("scope: './'")
  })

  it("deploy.custom-domain: playwright base defaults to '/'", () => {
    const cfg = read('playwright.config.ts')
    expect(cfg).toContain("process.env.BASE_PATH ?? '/'")
    expect(cfg).not.toContain("'/pti/'")
  })
})
