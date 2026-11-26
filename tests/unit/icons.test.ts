// House rules for AI-drawn icons (references/iconography.md). Icons are inlined into the DOM,
// so these checks are also what keeps that safe.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = join(__dirname, '../../src/icons')
const files = readdirSync(dir).filter((f) => f.endsWith('.svg'))

describe('ui.icons.house-style', () => {
  it('has at least one icon', () => expect(files.length).toBeGreaterThan(0))

  for (const f of files) {
    const svg = readFileSync(join(dir, f), 'utf8').trim()
    describe(f, () => {
      it('is a single 24x24 root svg without fixed size', () => {
        expect(svg.startsWith('<svg')).toBe(true)
        expect(svg.match(/<svg\b/g)).toHaveLength(1)
        expect(svg).toMatch(/viewBox="0 0 24 24"/)
        expect(svg).not.toMatch(/<svg[^>]*\s(width|height)=/)
      })
      it('uses only currentColor', () => {
        const colors = [...svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map((m) => m[1])
        for (const c of colors) expect(['none', 'currentColor']).toContain(c)
        expect(svg).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i)
      })
      it('stroke icons follow the 2px round style; -filled icons use fill', () => {
        if (f.endsWith('-filled.svg')) expect(svg).toMatch(/fill="currentColor"/)
        else expect(svg).toMatch(/stroke="currentColor"[^>]*stroke-width="2"/)
      })
      it('contains no unsafe or non-localisable content', () => {
        expect(svg).not.toMatch(/<(script|foreignObject|image|text|style|use)\b|\son\w+=|style=|href=|url\(/i)
      })
      it('stays small and simple', () => {
        expect(svg.length).toBeLessThan(1024)
        expect((svg.match(/<(path|circle|rect|line|polyline|polygon|ellipse)\b/g) ?? []).length).toBeLessThanOrEqual(6)
      })
      it('file name is kebab-case', () => {
        expect(f).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*\.svg$/)
      })
    })
  }
})
