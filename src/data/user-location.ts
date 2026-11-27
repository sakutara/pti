/*
 * The user's position for sorting facilities by distance. Asked from the browser only when the facilities page opens,
 * kept in memory for the session (never stored or sent anywhere).
 */
import { signal } from '@preact/signals'
import type { LatLng } from '../domain/facility-geo'

export type UserLocation =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'ready'; position: LatLng }
  | { status: 'denied' }
  | { status: 'unavailable' }

export const userLocation = signal<UserLocation>({ status: 'idle' })

/** Asks for the position once; `force` asks again (after a denial the browser decides whether to prompt). */
export function locateUser(force = false): void {
  const current = userLocation.value.status
  if (!force && current !== 'idle') return
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    userLocation.value = { status: 'unavailable' }
    return
  }
  userLocation.value = { status: 'locating' }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLocation.value = { status: 'ready', position: { lat: pos.coords.latitude, lng: pos.coords.longitude } }
    },
    (err) => {
      userLocation.value = { status: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' }
    },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 },
  )
}
