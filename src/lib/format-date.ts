const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Formats a YYYY-MM-DD date as DD/MM/YYYY. Input that is not in that form is returned unchanged. */
export function formatDateVi(iso: string): string {
  const match = ISO_DATE.exec(iso)
  if (!match) return iso
  const [, year, month, day] = match
  return `${day}/${month}/${year}`
}
