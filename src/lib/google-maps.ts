/*
 * Loads the Google Maps JavaScript API once, on demand (only the facilities page asks for it), with the marker library.
 * Only the subset of the API the app uses is typed here, so no @types package is needed.
 */
import { GOOGLE_MAPS_API_KEY } from '../config'

export interface LatLngLiteral {
  lat: number
  lng: number
}

export interface GMap {
  fitBounds(bounds: GLatLngBounds, padding?: number): void
  setCenter(center: LatLngLiteral): void
  setZoom(zoom: number): void
  panTo(center: LatLngLiteral): void
  getZoom(): number | undefined
}

export interface GLatLngBounds {
  extend(point: LatLngLiteral): GLatLngBounds
  isEmpty(): boolean
}

export interface GAdvancedMarker {
  map: GMap | null
  addListener(event: 'click', handler: () => void): { remove(): void }
}

export interface GPin {
  element: HTMLElement
}

export interface GoogleMapsApi {
  Map: new (el: HTMLElement, options: Record<string, unknown>) => GMap
  LatLngBounds: new () => GLatLngBounds
  marker: {
    AdvancedMarkerElement: new (options: {
      map: GMap
      position: LatLngLiteral
      title?: string
      content?: HTMLElement
      zIndex?: number
    }) => GAdvancedMarker
    PinElement: new (options: { background?: string; borderColor?: string; glyphColor?: string; scale?: number }) => GPin
  }
}

declare global {
  interface Window {
    google?: { maps: GoogleMapsApi }
    __ptiMapsReady?: () => void
  }
}

let loading: Promise<GoogleMapsApi> | null = null

export function loadGoogleMaps(): Promise<GoogleMapsApi> {
  if (loading) return loading
  loading = new Promise<GoogleMapsApi>((resolve, reject) => {
    if (window.google?.maps?.marker) {
      resolve(window.google.maps)
      return
    }
    const params = new URLSearchParams({
      key: GOOGLE_MAPS_API_KEY,
      v: 'weekly',
      loading: 'async',
      libraries: 'marker',
      language: 'vi',
      region: 'VN',
      callback: '__ptiMapsReady',
    })
    window.__ptiMapsReady = () => {
      if (window.google?.maps) resolve(window.google.maps)
      else reject(new Error('Google Maps did not load'))
    }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`
    script.async = true
    script.onerror = () => {
      loading = null
      reject(new Error('Google Maps script failed'))
    }
    document.head.appendChild(script)
  })
  return loading
}
