/*
 * Đọc số tiền VNĐ bằng chữ tiếng Việt cho ô "Số tiền bằng chữ" của giấy yêu cầu bồi thường.
 * Chỉ dùng cho số nguyên dương dưới 10^12. Ví dụ: 2718900 → "hai triệu bảy trăm mười tám nghìn chín trăm đồng chẵn".
 */

const DIGITS = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'] as const
/** Tên nhóm ba chữ số, từ đơn vị lên: đơn vị, nghìn, triệu, tỷ. */
const SCALES = ['', ' nghìn', ' triệu', ' tỷ'] as const

/**
 * Đọc một nhóm ba chữ số (1..999). `prefix` = có nhóm lớn hơn khác 0 đứng trước, khi đó hàng trăm bằng 0 đọc
 * "không trăm" và hàng chục bằng 0 đọc "linh".
 */
function readTriple(n: number, prefix: boolean): string {
  const h = Math.floor(n / 100)
  const t = Math.floor((n % 100) / 10)
  const u = n % 10
  const parts: string[] = []

  if (h > 0) parts.push(`${DIGITS[h]} trăm`)
  else if (prefix && (t > 0 || u > 0)) parts.push('không trăm')

  if (t === 0) {
    if (u > 0) {
      if (h > 0 || prefix) parts.push('linh')
      parts.push(DIGITS[u])
    }
  } else {
    parts.push(t === 1 ? 'mười' : `${DIGITS[t]} mươi`)
    if (u === 5) parts.push('lăm')
    else if (u === 1 && t > 1) parts.push('mốt')
    else if (u > 0) parts.push(DIGITS[u])
  }
  return parts.join(' ')
}

/** Số tiền (VNĐ nguyên, 0 < n < 10^12) đọc thành chữ, kết thúc bằng "đồng chẵn". Ném RangeError ngoài khoảng. */
export function amountInWords(amount: number): string {
  if (!Number.isInteger(amount) || amount <= 0 || amount >= 1e12) {
    throw new RangeError(`amountInWords expects an integer in (0, 10^12), got ${amount}`)
  }

  // groups[i] là nhóm ba chữ số thứ i tính từ đơn vị.
  const groups: number[] = []
  let rest = amount
  for (let i = 0; i < SCALES.length; i++) {
    groups.push(rest % 1000)
    rest = Math.floor(rest / 1000)
  }

  const parts: string[] = []
  for (let i = SCALES.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue
    const prefix = groups.slice(i + 1).some((g) => g > 0)
    parts.push(`${readTriple(groups[i], prefix)}${SCALES[i]}`)
  }
  return `${parts.join(' ')} đồng chẵn`
}
