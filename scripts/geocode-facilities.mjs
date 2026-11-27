#!/usr/bin/env node
// CLI: node scripts/geocode-facilities.mjs --facilities <pti.json> --out <geo.json> [--refresh] [--retry-by address,name]
// Adds map coordinates for facilities that have none yet, using OpenStreetMap Nominatim (public data only: the
// facility name, address and province). Keeps existing points so the monthly run only looks up new or moved rows.
// Nominatim policy: at most one request per second and an identifying User-Agent.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
export const GEO_USER_AGENT = 'pti-claim-geocode (+https://pti.fiddle.vn)'

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Rough bounding box of Viet Nam, to drop matches abroad. */
const VN = { south: 8.0, north: 23.5, west: 102.0, east: 110.0 }

export function insideVietnam(lat, lng) {
  return lat >= VN.south && lat <= VN.north && lng >= VN.west && lng <= VN.east
}

/** "Số 929 La Thành, Phường Giảng Võ, Thành phố Hà Nội" → "929 La Thành, Thành phố Hà Nội" (street + province). */
export function streetQuery(address, provinceName) {
  const parts = address.split(',').map((p) => p.trim()).filter((p) => p !== '')
  const street = (parts[0] ?? '').replace(/^(số|so)\s+/i, '')
  return [street, provinceName ?? parts[parts.length - 1]].filter(Boolean).join(', ')
}

/** Name without a branch suffix: text in brackets and anything after " - " or "- CS"/"CN". */
export function baseName(name) {
  return name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s*-\s*(cs|cn|cơ sở|chi nhánh)\b.*$/i, '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "Số 12 Lam Sơn, khu phố 61, Phường Linh Xuân, TP" → "12 Lam Sơn, Phường Linh Xuân, TP": the ward keeps a street
 * from matching a same-named street elsewhere in a merged province. Null when the address names no ward or commune. */
export function wardQuery(address, provinceName) {
  const parts = address.split(',').map((p) => p.trim()).filter((p) => p !== '')
  const ward = parts.find((p) => /^(phường|xã|đặc khu|thị trấn)\s/i.test(p))
  if (!ward) return null
  const street = (parts[0] ?? '').replace(/^(số|so)\s+/i, '')
  return [street, ward, provinceName ?? parts[parts.length - 1]].filter(Boolean).join(', ')
}

/**
 * Queries tried in order, most precise first. `by` records how a point was found so the app can tell a building
 * from a province centre: name / address are close enough to sort by distance, province is not.
 */
export function queriesFor(f) {
  const province = f.provinceName ?? ''
  const list = [
    { by: 'name', q: province ? `${f.name}, ${province}` : f.name },
    { by: 'name', q: f.name },
    ...(wardQuery(f.address, f.provinceName) ? [{ by: 'address', q: wardQuery(f.address, f.provinceName) }] : []),
    { by: 'address', q: streetQuery(f.address, f.provinceName) },
  ]
  // Branch suffixes ("- CS Lạc Long Quân", "(Ngọc Hồi)") often hide the main building from the search.
  const base = baseName(f.name)
  if (base !== f.name) list.push({ by: 'name', q: province ? `${base}, ${province}` : base })
  if (province) list.push({ by: 'province', q: province })
  const seen = new Set()
  return list.filter((item) => (seen.has(item.q) ? false : (seen.add(item.q), true)))
}

/** Address text a point was computed from; a changed address means the point must be looked up again. */
const keyOf = (f) => `${f.name}|${f.address}`

export async function geocodeOne(f, { fetchImpl, sleep, delayMs }) {
  for (const { by, q } of queriesFor(f)) {
    await sleep(delayMs)
    const url = new URL(NOMINATIM_URL)
    url.searchParams.set('q', q)
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('countrycodes', 'vn')
    url.searchParams.set('limit', '1')
    url.searchParams.set('accept-language', 'vi')
    const response = await fetchImpl(url.toString(), { headers: { 'User-Agent': GEO_USER_AGENT, Accept: 'application/json' } })
    if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`)
    const rows = await response.json()
    const hit = Array.isArray(rows) ? rows[0] : undefined
    if (!hit) continue
    const lat = Number(hit.lat)
    const lng = Number(hit.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !insideVietnam(lat, lng)) continue
    return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, by, key: keyOf(f) }
  }
  return null
}

/**
 * Returns the next geo file. Points whose facility is gone are dropped; points whose name or address changed, and
 * province-centre points, are looked up again; `refresh` looks up every facility again.
 */
export async function runGeocode({ facilities, previous, fetchImpl = globalThis.fetch, sleep = defaultSleep, delayMs = 1100, refresh = false, retryBy = [], now = new Date(), log = () => {} }) {
  const old = previous?.points ?? {}
  const points = {}
  let looked = 0
  let missing = 0
  for (const f of facilities) {
    const kept = old[f.id]
    // A province-centre point is looked up again each run, in case OpenStreetMap has the place by now.
    if (!refresh && kept && kept.key === keyOf(f) && kept.by !== 'province' && !retryBy.includes(kept.by)) {
      points[f.id] = kept
      continue
    }
    looked++
    const found = await geocodeOne(f, { fetchImpl, sleep, delayMs })
    if (found) points[f.id] = found
    else missing++
    log(`geocode ${looked}: ${found ? found.by : 'không tìm thấy'} — ${f.name}`)
  }
  return {
    file: {
      source: 'OpenStreetMap Nominatim (© OpenStreetMap contributors, ODbL)',
      updatedAt: now.toISOString(),
      points,
    },
    looked,
    missing,
  }
}

function argValue(argv, name) {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}

async function main(argv) {
  const facilitiesPath = argValue(argv, '--facilities')
  const out = argValue(argv, '--out')
  if (!facilitiesPath || !out) {
    console.error('Cách dùng: node scripts/geocode-facilities.mjs --facilities <pti.json> --out <geo.json> [--refresh]')
    return 1
  }
  const dataset = JSON.parse(readFileSync(facilitiesPath, 'utf8'))
  const previous = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null
  const result = await runGeocode({
    facilities: dataset.facilities,
    previous,
    refresh: argv.includes('--refresh'),
    retryBy: (argValue(argv, '--retry-by') ?? '').split(',').filter(Boolean),
    log: (line) => console.error(line),
  })
  const unchanged = previous && JSON.stringify(previous.points) === JSON.stringify(result.file.points)
  if (!unchanged) writeFileSync(out, `${JSON.stringify(result.file, null, 2)}\n`)
  console.log(`Toạ độ CSYT: tra ${result.looked}, không tìm thấy ${result.missing}, tổng ${Object.keys(result.file.points).length}.`)
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error)
      process.exit(1)
    },
  )
}
