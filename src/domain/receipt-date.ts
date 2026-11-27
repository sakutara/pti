import { foldVi } from '../lib/text'

/** "ngay dd thang mm nam yyyy" on folded text. Preferred over numeric dates. */
const WORDS_DATE = /ngay\s*(\d{1,2})\s*thang\s*(\d{1,2})\s*nam\s*(\d{4})/
/** dd/mm/yyyy or dd-mm-yyyy on folded text. */
const NUMERIC_DATE = /(?<!\d)(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?!\d)/

/** YYYY-MM-DD for a real calendar date, else null. */
function toIsoDate(day: number, month: number, year: number): string | null {
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

/**
 * Rule 6: the document date from recognised lines. "ngay dd thang mm nam yyyy" wins over
 * dd/mm/yyyy and dd-mm-yyyy; within a format the first valid date from the top is used.
 * Dates after `today` (YYYY-MM-DD) and lines marked "ngay sinh" (date of birth) are ignored.
 */
export function extractDate(lines: string[], today: string): string | null {
  const usable = lines.map(foldVi).filter((line) => !line.includes('ngay sinh'))

  for (const pattern of [WORDS_DATE, NUMERIC_DATE]) {
    for (const line of usable) {
      const match = pattern.exec(line)
      if (!match) continue
      const iso = toIsoDate(Number(match[1]), Number(match[2]), Number(match[3]))
      if (iso !== null && iso <= today) return iso
    }
  }
  return null
}
