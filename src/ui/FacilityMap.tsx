import { useEffect, useRef, useState } from 'preact/hooks'
import { GOOGLE_MAPS_MAP_ID } from '../config'
import type { Facility } from '../domain/facilities-schema'
import type { GeoPoint, LatLng } from '../domain/facility-geo'
import { t } from '../i18n'
import { loadGoogleMaps, type GAdvancedMarker, type GMap, type GoogleMapsApi } from '../lib/google-maps'

export interface FacilityMapProps {
  /** Facilities in list order (nearest first when the position is known). */
  facilities: readonly Facility[]
  points: Record<string, GeoPoint>
  origin: LatLng | null
  selectedId: string | null
  onSelect(id: string): void
}

/** Centre of Viet Nam, used before any pin is placed. */
const VIETNAM = { lat: 16.0, lng: 106.0 }
/** The first view frames the user and this many nearest facilities, so the map opens on the neighbourhood. */
const NEAREST_IN_VIEW = 8

const COLORS = {
  pin: '#0b63ce',
  pinBorder: '#084c9e',
  selected: '#d93025',
  selectedBorder: '#a50e0e',
  blacklisted: '#6b7280',
}

function userDot(): HTMLElement {
  const dot = document.createElement('div')
  dot.style.cssText =
    'width:18px;height:18px;border-radius:9999px;background:#1a73e8;border:3px solid #fff;box-shadow:0 0 0 2px rgba(26,115,232,.35)'
  dot.setAttribute('aria-hidden', 'true')
  return dot
}

/**
 * Google map with a pin per facility in the current list and a dot for the user. Tapping a pin opens that facility.
 * Pins are redrawn when the list changes; the view is framed again only when the list or the position changes.
 */
export function FacilityMap({ facilities, points, origin, selectedId, onSelect }: FacilityMapProps) {
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<GoogleMapsApi | null>(null)
  const map = useRef<GMap | null>(null)
  const markers = useRef<GAdvancedMarker[]>([])
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    let alive = true
    loadGoogleMaps()
      .then((maps) => {
        if (!alive || !host.current) return
        api.current = maps
        map.current = new maps.Map(host.current, {
          center: VIETNAM,
          zoom: 5,
          mapId: GOOGLE_MAPS_MAP_ID,
          gestureHandling: 'cooperative',
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
          clickableIcons: false,
        })
        setReady(true)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [])

  const listKey = facilities.map((f) => f.id).join(',')
  const originKey = origin ? `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}` : ''

  // Pins.
  useEffect(() => {
    const maps = api.current
    const m = map.current
    if (!ready || !maps || !m) return
    for (const marker of markers.current) marker.map = null
    markers.current = []

    for (const f of facilities) {
      const p = points[f.id]
      if (!p) continue
      const selected = f.id === selectedId
      const pin = new maps.marker.PinElement({
        background: selected ? COLORS.selected : f.blacklisted ? COLORS.blacklisted : COLORS.pin,
        borderColor: selected ? COLORS.selectedBorder : COLORS.pinBorder,
        glyphColor: '#ffffff',
        scale: selected ? 1.3 : 1,
      })
      const marker = new maps.marker.AdvancedMarkerElement({
        map: m,
        position: { lat: p.lat, lng: p.lng },
        title: f.name,
        content: pin.element,
        zIndex: selected ? 1000 : undefined,
      })
      marker.addListener('click', () => onSelectRef.current(f.id))
      markers.current.push(marker)
    }

    if (origin) {
      markers.current.push(
        new maps.marker.AdvancedMarkerElement({ map: m, position: origin, title: t('facilities.map.you'), content: userDot(), zIndex: 2000 }),
      )
    }
  }, [ready, listKey, originKey, selectedId, points])

  // View: the user and the nearest facilities, else every pin in the list.
  useEffect(() => {
    const maps = api.current
    const m = map.current
    if (!ready || !maps || !m) return
    const bounds = new maps.LatLngBounds()
    const placed = facilities.filter((f) => points[f.id] && points[f.id].by !== 'province')
    const framed = origin ? placed.slice(0, NEAREST_IN_VIEW) : placed
    for (const f of framed) bounds.extend(points[f.id])
    if (origin) bounds.extend(origin)
    if (bounds.isEmpty()) return
    m.fitBounds(bounds, 48)
    if (framed.length === 0 && origin) m.setZoom(13)
  }, [ready, listKey, originKey])

  // Selecting a facility in the list moves the map to it.
  useEffect(() => {
    const m = map.current
    const p = selectedId ? points[selectedId] : undefined
    if (!ready || !m || !p) return
    m.panTo(p)
    if ((m.getZoom() ?? 0) < 14 && p.by !== 'province') m.setZoom(15)
  }, [ready, selectedId])

  if (failed) {
    return (
      <p role="alert" class="rounded-xl bg-surface-2 p-3 text-fluid-sm text-ink-muted">
        {t('facilities.map.failed')}
      </p>
    )
  }

  return (
    <div
      ref={host}
      role="region"
      aria-label={t('facilities.map.label')}
      class="h-64 w-full overflow-hidden rounded-xl bg-surface-2 lg:h-80"
    />
  )
}
