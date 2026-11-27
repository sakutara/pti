#!/usr/bin/env node
// CLI: node scripts/refresh-facilities.mjs --out <pti.json> --manifest <manifest.json> [--dry-run]
// Fetches the PTI facility lists, checks them, and writes the dataset and manifest only when data changed.
// Progress goes to stderr; the Markdown summary goes to stdout (and to $GITHUB_STEP_SUMMARY when set).
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { BASE_URL, SEARCH_PATH } from './lib/pti-api.mjs'
import {
  buildDataset,
  checkSafety,
  collectFacilities,
  diffFacilities,
  nextVersion,
  sameContent,
  summaryMarkdown,
  updateManifest,
  vietnamDateIso,
} from './lib/facilities.mjs'

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Runs one refresh. Never calls process.exit; returns `{ code, summary }`.
 * `code` is 0 when the data is unchanged or validly updated, 1 on any failure (nothing is written then).
 */
export async function runRefresh({
  out,
  manifest,
  fetchImpl = globalThis.fetch,
  sleep = defaultSleep,
  delayMs = 500,
  dryRun = false,
  now = new Date(),
  env = {},
  log = () => {},
}) {
  try {
    const collected = await collectFacilities(fetchImpl, { delayMs, sleep })
    const next = buildDataset({
      ...collected,
      fetchedAt: now.toISOString(),
      source: `${BASE_URL}${SEARCH_PATH}`,
    })

    const old = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null
    const safety = checkSafety(old?.facilities ?? null, next.facilities)
    if (!safety.ok) return { code: 1, summary: `Lỗi: ${safety.error}\n` }

    if (old && sameContent(old, next)) {
      log('refresh-facilities: không có thay đổi')
      return { code: 0, summary: summaryMarkdown({ dataset: next, noChange: true }) }
    }

    const diff = diffFacilities(old?.facilities ?? [], next.facilities)
    const manifestJson = JSON.parse(readFileSync(manifest, 'utf8'))
    const version = nextVersion(now, manifestJson.datasets?.facilities?.version)
    const updated = updateManifest(manifestJson, {
      changes: { added: diff.added.length, removed: diff.removed.length, changed: diff.changed.length },
      version,
      updatedAt: vietnamDateIso(now),
    })
    const summary = summaryMarkdown({ dataset: next, diff, version })

    if (!dryRun) {
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, `${JSON.stringify(next, null, 2)}\n`)
      writeFileSync(manifest, `${JSON.stringify(updated, null, 2)}\n`)
      log(`refresh-facilities: đã ghi ${out} và ${manifest}`)
    }
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, summary)
    return { code: 0, summary }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log(`refresh-facilities: ${message}`)
    return { code: 1, summary: `Lỗi: ${message}\n` }
  }
}

function parseArgs(argv) {
  const args = { out: null, manifest: null, dryRun: false }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') args.out = argv[(i += 1)] ?? null
    else if (argv[i] === '--manifest') args.manifest = argv[(i += 1)] ?? null
    else if (argv[i] === '--dry-run') args.dryRun = true
  }
  return args
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2))
  if (!args.out || !args.manifest) {
    process.stderr.write('usage: refresh-facilities.mjs --out <pti.json> --manifest <manifest.json> [--dry-run]\n')
    process.exitCode = 1
  } else {
    const log = (msg) => process.stderr.write(`${msg}\n`)
    const result = await runRefresh({ ...args, env: process.env, log })
    process.stdout.write(result.summary)
    process.exitCode = result.code
  }
}
