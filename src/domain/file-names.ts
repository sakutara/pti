// File names of the two PDFs sent with a claim. Forbidden characters are removed and the whole name is capped at 80
// characters, cutting the reason so that the ".pdf" suffix stays.

const FORBIDDEN = /[\\/:*?"<>|]/g
const MAX_NAME_LENGTH = 80
const SUFFIX = '.pdf'

function fileName(prefix: string, reason: string): string {
  const clean = reason.replace(FORBIDDEN, '').replace(/\s+/g, ' ').trim()
  const room = MAX_NAME_LENGTH - [...prefix].length - SUFFIX.length
  const cut = [...clean].slice(0, Math.max(0, room)).join('').trim()
  return `${prefix}${cut}${SUFFIX}`
}

/** `GYC bồi thường <reason>.pdf`: the claim form. */
export const formFileName = (reason: string): string => fileName('GYC bồi thường ', reason)

/** `Chứng từ <reason>.pdf`: the attachment bundle. */
export const docsFileName = (reason: string): string => fileName('Chứng từ ', reason)
