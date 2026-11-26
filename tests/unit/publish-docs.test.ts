import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
// scripts/publish-docs.mjs is plain ESM without type declarations; it is not part of any tsconfig include.
// @ts-expect-error -- no .d.ts for the .mjs script
import { publishDocs } from '../../scripts/publish-docs.mjs'

const root = resolve(__dirname, '../..')

type Opts = { from?: string; to?: string }
const run = publishDocs as (opts?: Opts) => void

let base: string
let from: string
let to: string

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'publish-docs-'))
  from = join(base, 'dist')
  to = join(base, 'docs')
  mkdirSync(from)
})

afterEach(() => {
  rmSync(base, { recursive: true, force: true })
})

const write = (dir: string, rel: string, content: string) => {
  const full = join(dir, rel)
  mkdirSync(resolve(full, '..'), { recursive: true })
  writeFileSync(full, content)
}

const seedValidBuild = () => {
  write(from, 'index.html', '<!doctype html>')
  write(from, 'CNAME', 'pti.fiddle.vn\n')
  write(from, '.nojekyll', '')
  write(from, '404.html', '<!doctype html>404')
  write(from, 'assets/app-abc.js', 'console.log(1)')
  write(from, 'assets/nested/deep/style.css', 'body{}')
}

describe('deploy.publish-docs', () => {
  it('deploy.publish-docs: copies all files including .nojekyll and nested assets', () => {
    seedValidBuild()
    run({ from, to })

    expect(readFileSync(join(to, 'index.html'), 'utf8')).toBe('<!doctype html>')
    expect(readFileSync(join(to, 'CNAME'), 'utf8')).toBe('pti.fiddle.vn\n')
    expect(existsSync(join(to, '.nojekyll'))).toBe(true)
    expect(readFileSync(join(to, '404.html'), 'utf8')).toBe('<!doctype html>404')
    expect(readFileSync(join(to, 'assets/app-abc.js'), 'utf8')).toBe('console.log(1)')
    expect(readFileSync(join(to, 'assets/nested/deep/style.css'), 'utf8')).toBe('body{}')
  })

  it('deploy.publish-docs: removes stale files already present in docs', () => {
    seedValidBuild()
    write(to, 'assets/old-hash.js', 'stale')
    write(to, 'stale-root.html', 'stale')

    run({ from, to })

    expect(existsSync(join(to, 'assets/old-hash.js'))).toBe(false)
    expect(existsSync(join(to, 'stale-root.html'))).toBe(false)
    expect(readdirSync(to).sort()).toEqual(['.nojekyll', '404.html', 'CNAME', 'assets', 'index.html'])
  })

  it('deploy.publish-docs: missing CNAME throws and leaves docs unchanged', () => {
    seedValidBuild()
    rmSync(join(from, 'CNAME'))
    write(to, 'keep.txt', 'previous deploy')

    expect(() => run({ from, to })).toThrow(/CNAME/)
    expect(readFileSync(join(to, 'keep.txt'), 'utf8')).toBe('previous deploy')
    expect(readdirSync(to)).toEqual(['keep.txt'])
  })

  it('deploy.publish-docs: missing index.html throws and leaves docs unchanged', () => {
    seedValidBuild()
    rmSync(join(from, 'index.html'))
    write(to, 'keep.txt', 'previous deploy')

    expect(() => run({ from, to })).toThrow(/index\.html/)
    expect(readFileSync(join(to, 'keep.txt'), 'utf8')).toBe('previous deploy')
    expect(readdirSync(to)).toEqual(['keep.txt'])
  })

  it('deploy.publish-docs: package.json deploy script runs publish-docs and not gh-pages', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(pkg.scripts.deploy).toContain('publish-docs')
    expect(pkg.scripts.deploy).not.toContain('gh-pages')
  })

  it('deploy.publish-docs: package.json devDependencies has no gh-pages', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      devDependencies?: Record<string, string>
    }
    expect(pkg.devDependencies ?? {}).not.toHaveProperty('gh-pages')
  })
})
