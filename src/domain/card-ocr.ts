// Reads the person fields printed on the front of a PTI health insurance card from OCR lines.
// Pure and label-driven: each field is taken from the text after its label (same line, else the next line), so the
// parser does not depend on one card layout. Anything it is not sure about is left out for the user to type.
import { foldVi } from '../lib/text'
import type { PersonInput, Tier } from './types'

export type CardFields = Partial<
  Pick<
    PersonInput,
    | 'fullName'
    | 'dateOfBirth'
    | 'idNumber'
    | 'employeeCode'
    | 'tier'
    | 'policyholderName'
    | 'contractCode'
    | 'cardNumber'
    | 'cardValidFrom'
    | 'cardValidTo'
  >
>

type TextField = 'fullName' | 'policyholderName' | 'contractCode' | 'cardNumber' | 'idNumber' | 'employeeCode'

/** Labels on folded text (no accents, lower case). Order matters: the first label found on a line wins. */
const LABELS: { field: TextField | 'dateOfBirth' | 'validity' | 'tier'; pattern: RegExp }[] = [
  { field: 'dateOfBirth', pattern: /\b(ngay sinh|ngay thang nam sinh|nam sinh|d\.?o\.?b|date of birth|birth ?date|birthday)\b/ },
  { field: 'validity', pattern: /\b(hieu luc|thoi han|thoi gian bao hiem|valid(ity)?|effective|expir(y|ation|e)|het han|tu ngay|period)\b/ },
  { field: 'contractCode', pattern: /\b(so hop dong|hop dong so|ma hop dong|so hd|hd so|policy (no|number|code)|contract (no|number))\b/ },
  { field: 'cardNumber', pattern: /\b(so the|ma the|the so|card (no|number|id)|member (no|id|number)|so gcn|so giay chung nhan|certificate (no|number)|ma so the)\b/ },
  { field: 'idNumber', pattern: /\b(cccd|cmnd|can cuoc|so dinh danh|id (no|number)|passport|ho chieu)\b/ },
  { field: 'employeeCode', pattern: /\b(ma (so )?nhan vien|ma nv|msnv|employee (id|no|code)|staff (id|no))\b/ },
  { field: 'tier', pattern: /\b(hang|chuong trinh|goi|plan|class|level)\b/ },
  { field: 'policyholderName', pattern: /\b(ben mua bao hiem|nguoi mua bao hiem|chu hop dong|don vi|cong ty|to chuc|policy ?holder|company|employer|corporate)\b/ },
  { field: 'fullName', pattern: /\b(ho (va )?ten|ten nguoi duoc bao hiem|nguoi duoc bao hiem|ndbh|full ?name|insured( person| name)?|name|member)\b/ },
]

const DATE = /(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{4}|\d{2})/g

/** Every date written d/m/y (or with - or .) in the text, as YYYY-MM-DD. Two-digit years: 00–49 → 20xx. */
export function datesIn(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(DATE)) {
    const day = Number(m[1])
    const month = Number(m[2])
    let year = Number(m[3])
    if (m[3].length === 2) year += year < 50 ? 2000 : 1900
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) continue
    out.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
  }
  return out
}

/** Text after the label on the same line, without the separator; '' when the label ends the line. */
function afterLabel(line: string, pattern: RegExp): string {
  const folded = foldVi(line)
  const m = pattern.exec(folded)
  if (!m) return ''
  // foldVi keeps one character per letter of NFC Vietnamese text, so the folded index points into the original.
  const original = line.normalize('NFC').replace(/\s+/g, ' ').trim()
  let rest = original.slice(m.index + m[0].length)
  // English label written after the Vietnamese one, e.g. "Họ tên/Full name:".
  rest = rest.replace(/^\s*\/\s*[A-Za-z .]+(?=[:：])/, '')
  return rest.replace(/^[\s:：.\-–/|]+/, '').trim()
}

/** A line that carries no label of its own, usable as the value of the label on the line above. */
function labelOf(line: string): (typeof LABELS)[number] | undefined {
  const folded = foldVi(line)
  return LABELS.find((l) => l.pattern.test(folded))
}

const NAME_STOP = /\b(bao hiem|insurance|pti|buu dien|card|hop dong|policy|cong ty|company|hotline|benh vien|www|http)\b/

/** Cleans a person name: letters and spaces only, 2–6 words, each word capitalised. */
function cleanName(raw: string): string | null {
  const letters = raw
    .normalize('NFC')
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const words = letters.split(' ').filter((w) => w !== '')
  if (words.length < 2 || words.length > 6) return null
  if (NAME_STOP.test(foldVi(letters))) return null
  return words.map((w) => w.charAt(0).toLocaleUpperCase('vi') + w.slice(1).toLocaleLowerCase('vi')).join(' ')
}

/** Code-like value: letters, digits and - / . ; first token run only, at least 4 characters with a digit. */
function cleanCode(raw: string): string | null {
  const m = /[\p{L}\p{N}][\p{L}\p{N}\-/.]*[\p{L}\p{N}]/u.exec(raw.replace(/\s+(?=\d)/g, ''))
  if (!m || m[0].length < 4 || !/\d/.test(m[0])) return null
  return m[0].toLocaleUpperCase('vi')
}

function cleanText(raw: string): string | null {
  const value = raw.replace(/\s+/g, ' ').trim()
  return value.length >= 2 ? value : null
}

const ROMAN: Record<string, Tier> = { i: 1, ii: 2, iii: 3, iv: 4 }

function cleanTier(raw: string): Tier | null {
  const m = /^\s*(?:[:.\-]\s*)?([1-4]|iv|iii|ii|i)\b/i.exec(foldVi(raw))
  if (!m) return null
  const key = m[1].toLowerCase()
  return ROMAN[key] ?? (Number(key) as Tier)
}

/**
 * Fields read from the OCR lines of a card front, in reading order. A field missing from the result was not found.
 * `today` (YYYY-MM-DD) rejects a birth date in the future.
 */
export function parseCardText(lines: readonly string[], today: string): CardFields {
  const out: CardFields = {}
  const clean = lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l !== '')

  const valueFor = (index: number, pattern: RegExp): string => {
    const same = afterLabel(clean[index], pattern)
    if (same !== '') return same
    const next = clean[index + 1]
    return next !== undefined && labelOf(next) === undefined ? next : ''
  }

  for (let i = 0; i < clean.length; i++) {
    const label = labelOf(clean[i])
    if (!label) continue
    const value = valueFor(i, label.pattern)
    if (value === '') continue

    switch (label.field) {
      case 'dateOfBirth': {
        const date = datesIn(value)[0]
        if (date && date <= today) out.dateOfBirth ??= date
        break
      }
      case 'validity': {
        // "Hiệu lực: 01/01/2026 - 31/12/2026", or the two dates on this line and the next.
        let dates = datesIn(value)
        if (dates.length === 1 && clean[i + 1] !== undefined) dates = [...dates, ...datesIn(clean[i + 1])]
        if (dates.length >= 2 && dates[0] < dates[1]) {
          out.cardValidFrom ??= dates[0]
          out.cardValidTo ??= dates[1]
        } else if (dates.length === 1 && /het han|expir|den ngay/.test(foldVi(clean[i]))) {
          out.cardValidTo ??= dates[0]
        }
        break
      }
      case 'tier': {
        const tier = cleanTier(value)
        if (tier !== null) out.tier ??= tier
        break
      }
      case 'fullName': {
        const name = cleanName(value)
        if (name) out.fullName ??= name
        break
      }
      case 'idNumber': {
        const digits = value.replace(/[\s.]/g, '').match(/[A-Z]?\d{8,12}/i)?.[0]
        if (digits) out.idNumber ??= digits.toUpperCase()
        break
      }
      case 'policyholderName': {
        // "Công ty TNHH ABC": the label word is part of the name, so the whole line is the value.
        const whole = /^(tong )?cong ty\b|^to chuc\b/.test(foldVi(clean[i]))
        const text = cleanText(whole ? clean[i] : value)
        if (text) out.policyholderName ??= text
        break
      }
      default: {
        const code = cleanCode(value)
        if (code) out[label.field] ??= code
      }
    }
  }

  // No "Hiệu lực" label: two dates on one line, in order, are taken as the validity period.
  if (out.cardValidFrom === undefined) {
    for (const line of clean) {
      if (labelOf(line)?.field === 'dateOfBirth') continue
      const dates = datesIn(line)
      if (dates.length === 2 && dates[0] < dates[1]) {
        out.cardValidFrom = dates[0]
        out.cardValidTo ??= dates[1]
        break
      }
    }
  }

  // No name label: the first upper-case line that reads like a person's name.
  if (out.fullName === undefined) {
    for (const line of clean) {
      if (labelOf(line) !== undefined || line !== line.toLocaleUpperCase('vi')) continue
      const name = cleanName(line)
      if (name) {
        out.fullName = name
        break
      }
    }
  }

  return out
}

/** Copies the fields read from the card onto the form. Fields the card did not give keep what the user typed. */
export function applyCardFields<T extends PersonInput>(form: T, fields: CardFields): T {
  const next = { ...form }
  for (const [key, value] of Object.entries(fields) as [keyof CardFields, CardFields[keyof CardFields]][]) {
    if (value === undefined || value === null) continue
    ;(next as Record<string, unknown>)[key] = value
  }
  return next
}
