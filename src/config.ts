/**
 * Public OAuth client ID for Gmail sending (not a secret). Empty hides every Gmail control and leaves
 * the mailto fallback only. Fill in after creating the OAuth Web client.
 */
// Set at build time (VITE_GOOGLE_CLIENT_ID). Unset, as in every normal build, it stays '' and Gmail stays disabled.
export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

export const gmailEnabled = (): boolean => GOOGLE_CLIENT_ID !== ''

/**
 * Public Google Maps JavaScript API key (browser key, restricted by HTTP referrer to the app's domain; not a secret).
 * Set at build time (VITE_GOOGLE_MAPS_API_KEY). Empty hides the facility map; the list still sorts by distance.
 */
export const GOOGLE_MAPS_API_KEY: string = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''

/** Map ID for advanced markers (VITE_GOOGLE_MAPS_MAP_ID); Google's demo ID works until one is created. */
export const GOOGLE_MAPS_MAP_ID: string = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID'

export const mapsEnabled = (): boolean => GOOGLE_MAPS_API_KEY !== ''
