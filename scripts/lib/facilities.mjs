// Normalization, stable ids, ordering, diff and safety checks for PTI facilities. Node standard library only.
import { createHash } from 'node:crypto'
import { createPtiClient } from './pti-api.mjs'

export const CODES = {
  inpatient: 'NVCN028.1',
  outpatient: 'NVCN032.1',
  dental: 'NVCN030.1',
  excluded: 'PLC040.1',
}

const text = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)

const foldKey = (value) => String(value).normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()

/** Stable id: 'f-' + first 12 hex chars of sha1(normalize(name) + '|' + normalize(address)). */
export function facilityId(name, address) {
  return 'f-' + createHash('sha1').update(`${foldKey(name)}|${foldKey(address)}`).digest('hex').slice(0, 12)
}

/**
 * Maps one raw PTI record to the Facility shape. `province` is `{ code, name }` or null.
 * Throws when the name or address is missing, so the caller can stop before writing anything.
 */
export function normalizeRecord(raw, province) {
  const name = text(raw?.name)
  if (name === null) throw new Error('PTI facility without name')
  const address = text(raw.address)
  if (address === null) throw new Error(`PTI facility "${name}" without address`)
  return {
    id: facilityId(name, address),
    name,
    nameEn: text(raw.nameEn),
    phone: text(raw.phoneNumber),
    address,
    provinceCode: province?.code ?? null,
    provinceName: province?.name ?? null,
    hours: text(raw.timeReceiveGuarantee),
    specialty: text(raw.medicalSpecialty),
    inpatient: raw.inpatientGuarantee?.code === CODES.inpatient,
    outpatient: raw.outpatientGuarantee?.code === CODES.outpatient,
    dental: raw.dentalGuarantee?.code === CODES.dental,
    blacklisted: raw.blacklist?.code === CODES.excluded,
    network: 'pti',
  }
}

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

/** Sorts by province code (unknown last), then name, then id. Returns a new array. */
export function sortFacilities(list) {
  const key = (f) => f.provinceCode ?? '￿'
  return [...list].sort(
    (a, b) => compare(key(a), key(b)) || compare(a.name, b.name) || compare(a.id, b.id),
  )
}

/**
 * Builds the output list from `{ raw, province }` entries: normalizes, merges duplicates by id
 * (a copy with a known province wins), and sorts.
 */
export function buildFacilities(entries) {
  const byId = new Map()
  for (const { raw, province } of entries) {
    const facility = normalizeRecord(raw, province ?? null)
    const existing = byId.get(facility.id)
    if (!existing || (existing.provinceCode === null && facility.provinceCode !== null)) {
      byId.set(facility.id, facility)
    }
  }
  return sortFacilities([...byId.values()])
}

/**
 * Fetches the province codebook, then every direct-billing and excluded facility, once unfiltered and
 * once per province. A facility is tagged with the province whose filtered query returned it.
 * Returns `{ provinces, facilities }` with `facilities` already normalized, deduplicated and sorted.
 */
export async function collectFacilities(fetchImpl, options = {}) {
  const client = createPtiClient(fetchImpl, options)
  const provinces = await client.provinces()
  const direct = { isPtiGuarantee: 'NVCN031.1', blacklist: 'PLC040.0' }
  const excluded = { blacklist: 'PLC040.1' }

  const entries = []
  for (const params of [direct, excluded]) {
    for (const raw of await client.search(params)) entries.push({ raw, province: null })
  }
  for (const province of provinces) {
    for (const params of [direct, excluded]) {
      for (const raw of await client.search({ ...params, province: province.code })) {
        entries.push({ raw, province })
      }
    }
  }
  return { provinces, facilities: buildFacilities(entries) }
}

const isDirect = (f) => !f.blacklisted

/** Compares by id. `changed` means the same id with at least one field that differs. */
export function diffFacilities(oldList, nextList) {
  const oldById = new Map(oldList.map((f) => [f.id, f]))
  const nextById = new Map(nextList.map((f) => [f.id, f]))
  const added = nextList.filter((f) => !oldById.has(f.id))
  const removed = oldList.filter((f) => !nextById.has(f.id))
  const changed = nextList.filter((f) => {
    const old = oldById.get(f.id)
    return old !== undefined && !sameFields(old, f)
  })
  return { added: sortFacilities(added), removed: sortFacilities(removed), changed: sortFacilities(changed) }
}

function sameFields(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if (JSON.stringify(a[key] ?? null) !== JSON.stringify(b[key] ?? null)) return false
  }
  return true
}

/**
 * Refuses to replace the existing data when the new direct-billing count is empty or more than 30% lower.
 * `oldList` is null on the first run.
 */
export function checkSafety(oldList, nextList) {
  const nextDirect = nextList.filter(isDirect).length
  if (nextDirect === 0) return { ok: false, error: 'PTI API trả về 0 cơ sở bảo lãnh' }
  if (!oldList) return { ok: true }
  const oldDirect = oldList.filter(isDirect).length
  if (nextDirect < oldDirect * 0.7) {
    return {
      ok: false,
      error: `Số cơ sở bảo lãnh giảm hơn 30% (${oldDirect} → ${nextDirect}); không ghi đè dữ liệu`,
    }
  }
  return { ok: true }
}

/** Builds the dataset object in the shape of `public/data/facilities/pti.json`. */
export function buildDataset({ provinces, facilities, fetchedAt, source }) {
  return {
    fetchedAt,
    source,
    count: {
      directBilling: facilities.filter(isDirect).length,
      blacklisted: facilities.filter((f) => !isDirect(f)).length,
    },
    provinces: [...provinces].sort((a, b) => compare(a.code, b.code)),
    facilities,
  }
}

/** True when two datasets are equal ignoring `fetchedAt`. */
export function sameContent(a, b) {
  return JSON.stringify({ ...a, fetchedAt: null }) === JSON.stringify({ ...b, fetchedAt: null })
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000

/** 'YYYY-MM-DD' of the instant in Asia/Ho_Chi_Minh (UTC+7, no DST). */
export function vietnamDateIso(now) {
  return new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10)
}

/** 'YYYY-MM', or 'YYYY-MM.n' when the previous version already has that month. Month is the Vietnam month. */
export function nextVersion(now, previous) {
  const base = vietnamDateIso(now).slice(0, 7)
  if (!previous || (previous !== base && !previous.startsWith(`${base}.`))) return base
  const n = previous === base ? 1 : Number(previous.slice(base.length + 1))
  return `${base}.${n + 1}`
}

/** Returns a copy of the manifest with the `facilities` entry replaced. Other entries are kept. */
export function updateManifest(manifest, { changes, version, updatedAt }) {
  return {
    ...manifest,
    datasets: {
      ...manifest.datasets,
      facilities: { files: ['facilities/pti.json'], updatedAt, version, changes },
    },
  }
}

/** Markdown summary for the workflow commit message and the Actions step summary. */
export function summaryMarkdown({ dataset, diff, version, noChange }) {
  const head = `Bảo lãnh: ${dataset.count.directBilling} cơ sở; loại trừ: ${dataset.count.blacklisted} cơ sở.`
  if (noChange) return `## Làm mới danh sách CSYT PTI\n\nKhông có thay đổi. ${head}\n`
  const lines = [
    '## Làm mới danh sách CSYT PTI',
    '',
    head,
    `Phiên bản: ${version}. Thêm: ${diff.added.length}; bỏ: ${diff.removed.length}; đổi: ${diff.changed.length}.`,
  ]
  const list = (title, items) => {
    if (items.length === 0) return
    lines.push('', `### ${title}`, '', ...items.map((f) => `- ${f.name}${f.provinceName ? ` (${f.provinceName})` : ''}`))
  }
  list('Thêm', diff.added)
  list('Bỏ', diff.removed)
  list('Đổi', diff.changed)
  return lines.join('\n') + '\n'
}
