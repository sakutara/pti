#!/usr/bin/env node
// Validate an OKF v0.2 bundle as used by the pwa-miniapp-sdd skill.
// Usage: node check-okf.mjs <bundle-dir>     Exit code 1 on errors.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, dirname, resolve } from 'node:path'

const root = resolve(process.argv[2] ?? 'knowledge')
const RESERVED = new Set(['index.md', 'log.md'])
const STATUS = new Set(['draft', 'stable', 'deprecated'])
const errors = []
const warnings = []

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : n.endsWith('.md') ? [p] : []
  })
}

function frontmatter(text) {
  if (!text.startsWith('---\n')) return null
  const end = text.indexOf('\n---', 4)
  return end === -1 ? null : text.slice(4, end)
}

for (const file of walk(root)) {
  const rel = relative(root, file)
  const name = rel.split('/').pop()
  const text = readFileSync(file, 'utf8')
  const fm = frontmatter(text)

  if (RESERVED.has(name)) {
    if (name === 'index.md' && fm && rel !== 'index.md') errors.push(`${rel}: non-root index.md must not have frontmatter`)
    if (name === 'index.md' && fm && rel === 'index.md' && fm.split('\n').some((l) => l.trim() && !l.startsWith('okf_version')))
      errors.push(`${rel}: root index.md frontmatter may only contain okf_version`)
  } else {
    if (fm === null) { errors.push(`${rel}: missing YAML frontmatter`); continue }
    const type = fm.match(/^type:\s*(.+)$/m)?.[1]?.trim()
    if (!type) errors.push(`${rel}: missing non-empty 'type'`)
    const status = fm.match(/^status:\s*(\S+)/m)?.[1]
    if (status && !STATUS.has(status)) errors.push(`${rel}: status '${status}' not in draft|stable|deprecated`)
    if (!/^description:/m.test(fm)) warnings.push(`${rel}: no description (recommended)`)
    for (const m of fm.matchAll(/\b(at|stale_after|last_modified):\s*([0-9T:\-+.Z]+)/g)) {
      if (!/(Z|[+-]\d{2}:?\d{2})$/.test(m[2])) errors.push(`${rel}: timestamp ${m[1]}=${m[2]} needs an explicit UTC offset`)
    }
  }

  // Internal links: bundle-absolute (/x.md) or relative (./x.md)
  for (const m of text.matchAll(/\]\(([^)\s#]+\.md)(#[^)]*)?\)/g)) {
    const target = m[1]
    if (/^[a-z]+:/i.test(target)) continue
    const abs = target.startsWith('/')
      ? (target.startsWith('/knowledge/') ? join(root, target.slice('/knowledge/'.length)) : join(root, target))
      : join(dirname(file), target)
    if (!existsSync(abs) && !target.startsWith('/openspec/')) warnings.push(`${rel}: broken link ${target}`)
  }
}

if (!existsSync(join(root, 'index.md'))) warnings.push('index.md missing at bundle root')
for (const w of warnings) console.log(`warn  ${w}`)
for (const e of errors) console.log(`error ${e}`)
console.log(`${errors.length} error(s), ${warnings.length} warning(s)`)
process.exit(errors.length ? 1 : 0)
