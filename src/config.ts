/**
 * Public OAuth client ID for Gmail sending (not a secret). Empty hides every Gmail control and leaves
 * the mailto fallback only. Fill in after creating the OAuth Web client.
 */
// Set at build time (VITE_GOOGLE_CLIENT_ID). Unset, as in every normal build, it stays '' and Gmail stays disabled.
export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

export const gmailEnabled = (): boolean => GOOGLE_CLIENT_ID !== ''
