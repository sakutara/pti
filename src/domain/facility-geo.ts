// Map points of facilities (public/data/facilities/geo.json, made by scripts/geocode-facilities.mjs) and sorting by
// distance from the user. Pure: the user's position is passed in.
import type { Result } from './benefits-schema'
import type { Facility } from './facilities-schema'

/** How a point was found: name and address are close to the building; province is only the province centre. */
export type GeoPrecision = 'name' | 'address' | 'province'

export interface GeoPoint {
  lat: number
  lng: number
  by: GeoPrecision
}

export interface LatLng {
  lat: number
  lng: number
}

export interface FacilityGeo {
  source: string
  points: Record<string, GeoPoint>
}

const PRECISIONS: readonly string[] = ['name', 'address', 'province']

/** Keeps only well-formed points; a bad row is skipped, never fatal, since the map is an extra. */
export function parseFacilityGeo(json: unknown): Result<FacilityGeo> {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return { ok: false, error: 'geo phải là đối tượng' }
  const o = json as Record<string, unknown>
  const raw = o.points
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'geo thiếu points' }
  const points: Record<string, GeoPoint> = {}
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === null || typeof value !== 'object') continue
    const p = value as Record<string, unknown>
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number' || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue
    if (typeof p.by !== 'string' || !PRECISIONS.includes(p.by)) continue
    points[id] = { lat: p.lat, lng: p.lng, by: p.by as GeoPrecision }
  }
  return { ok: true, data: { source: typeof o.source === 'string' ? o.source : '', points } }
}

const EARTH_RADIUS_KM = 6371

/** Great-circle distance in kilometres. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

export interface NearbyFacility {
  facility: Facility
  /** Kilometres from the user; null without a point or a user position. */
  km: number | null
  /** True when the point is only the province centre, so the distance is rough. */
  approximate: boolean
}

/**
 * Nearest first. Facilities with a precise point come first by distance, then those placed at their province centre
 * by distance, then those with no point in the input order. Without `origin` the input order is kept.
 */
export function sortByDistance(list: readonly Facility[], points: Record<string, GeoPoint>, origin: LatLng | null): NearbyFacility[] {
  const rows = list.map((facility, index) => {
    const p = points[facility.id]
    return {
      index,
      row: {
        facility,
        km: p && origin ? distanceKm(origin, p) : null,
        approximate: p?.by === 'province',
      },
    }
  })
  if (!origin) return rows.map((r) => r.row)
  const tier = (r: NearbyFacility) => (r.km === null ? 2 : r.approximate ? 1 : 0)
  return rows
    .sort((a, b) => tier(a.row) - tier(b.row) || (a.row.km ?? 0) - (b.row.km ?? 0) || a.index - b.index)
    .map((r) => r.row)
}

/** "350 m", "1,2 km", "15 km" (Vietnamese decimal comma). */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`
  return `${Math.round(km)} km`
}
