// In-memory search over the bundled facilities list (a few hundred rows, no index needed).
import { foldVi } from '../lib/text'
import type { Facility, Service } from './facilities-schema'

export interface FacilityFilters {
  /** Free text, matched against name, English name and address ignoring case and diacritics. */
  q?: string
  /** Province code; null, undefined or '' means every province. */
  province?: string | null
  /** Every selected service must be offered (AND). */
  services?: readonly Service[]
  /** true: only excluded facilities. false or undefined: only direct-billing facilities. */
  blacklisted?: boolean
}

function haystack(f: Facility): string {
  return foldVi([f.name, f.nameEn ?? '', f.address].join(' '))
}

/** Returns the facilities that match every filter, in the input order. */
export function searchFacilities(
  list: readonly Facility[],
  filters: FacilityFilters = {},
): Facility[] {
  const needle = foldVi(filters.q ?? '')
  const province = filters.province ? filters.province : null
  const services = filters.services ?? []
  const wantBlacklisted = filters.blacklisted === true

  return list.filter((f) => {
    if (f.blacklisted !== wantBlacklisted) return false
    if (province !== null && f.provinceCode !== province) return false
    if (!services.every((s) => f[s])) return false
    return needle === '' || haystack(f).includes(needle)
  })
}

/**
 * Splits a phone field such as "0969 851 616 / 1900 888 866" into bare numbers.
 * Separators are "/", ",", ";" and line breaks; spaces, dots and dashes are removed.
 */
export function splitPhones(phone: string | null): string[] {
  if (!phone) return []
  return phone
    .split(/[\/,;\n]/)
    .map((part) => part.replace(/[^\d+]/g, ''))
    .filter((part) => part !== '')
}

/** Google Maps search link for a facility's name and address. */
export function mapUrl(f: Pick<Facility, 'name' | 'address'>): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${f.name} ${f.address}`)}`
}
