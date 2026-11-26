const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar date as YYYY-MM-DD (not UTC, so it matches what the user sees). */
export function todayIso(at: Date = new Date()): string {
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
}
