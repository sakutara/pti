/**
 * Folds Vietnamese text for accent-insensitive matching: NFD, drop combining marks,
 * map đ/Đ to d, lowercase, collapse runs of whitespace and trim.
 */
export function foldVi(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}
