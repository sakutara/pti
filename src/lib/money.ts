/**
 * Formats a whole VND amount as "10.000.000 đ" (dot as thousands separator).
 * Done by hand rather than Intl so the output does not depend on ICU data.
 * Throws RangeError for negative, non-integer or non-finite input.
 */
export function formatVnd(amount: number): string {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new RangeError(`formatVnd expects a non-negative integer, got ${amount}`)
  }
  const digits = String(amount)
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${grouped} đ`
}
