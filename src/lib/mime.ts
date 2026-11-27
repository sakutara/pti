/** Raised for input that would let a value break out of its header (CR/LF) or is not a usable address. */
export class MimeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MimeError'
  }
}

export interface MimeAttachment {
  name: string
  bytes: Uint8Array
  mime: string
}

export interface MimeInput {
  from: string
  to: string
  cc?: string[]
  subject: string
  text: string
  attachments: MimeAttachment[]
}

const CRLF = '\r\n'
const ADDRESS = /^[^\s@<>,;:"()[\]\\]+@[^\s@<>,;:"()[\]\\]+$/
const CONTROL = /[\r\n\0]/
/** Encoded-word payload per line: 75 chars max, minus "=?UTF-8?B?" and "?=" (12), rounded to a 3-byte group. */
const WORD_BYTES = 45

const enc = new TextEncoder()

function assertHeaderSafe(value: string, field: string): void {
  if (CONTROL.test(value)) throw new MimeError(`${field} contains a line break`)
}

function assertAddress(value: string, field: string): string {
  assertHeaderSafe(value, field)
  if (!ADDRESS.test(value)) throw new MimeError(`${field} is not an address`)
  return value
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

function wrapBase64(bytes: Uint8Array): string {
  const b64 = bytesToBase64(bytes)
  const lines: string[] = []
  for (let i = 0; i < b64.length; i += 76) lines.push(b64.slice(i, i + 76))
  return lines.join(CRLF)
}

/** RFC 2047 encoded words; each word holds whole UTF-8 characters, and words are folded with CRLF + space. */
function encodeSubject(subject: string): string {
  if (!/[^\x20-\x7e]/.test(subject)) return subject
  const words: string[] = []
  let chunk: number[] = []
  const flush = () => {
    if (chunk.length === 0) return
    words.push(`=?UTF-8?B?${bytesToBase64(Uint8Array.from(chunk))}?=`)
    chunk = []
  }
  for (const ch of subject) {
    const bytes = enc.encode(ch)
    if (chunk.length + bytes.length > WORD_BYTES) flush()
    chunk.push(...bytes)
  }
  flush()
  return words.join(CRLF + ' ')
}

/** RFC 5987 value for filename*, keeping only attr-char bytes unescaped. */
function encodeFileName(name: string): string {
  return encodeURIComponent(name).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

function randomBoundary(): string {
  return 'pti-' + crypto.randomUUID().replace(/-/g, '')
}

/**
 * Builds a multipart/mixed message (plain UTF-8 text plus PDF attachments) as raw RFC 822 bytes.
 * Every header value is checked for CR/LF before anything is written, so a value cannot inject headers.
 */
export function buildMime(input: MimeInput): Uint8Array {
  const from = assertAddress(input.from, 'from')
  const to = assertAddress(input.to, 'to')
  const cc = (input.cc ?? []).map((a) => assertAddress(a, 'cc'))
  assertHeaderSafe(input.subject, 'subject')
  const attachments = input.attachments.map((a) => {
    assertHeaderSafe(a.name, 'attachment name')
    assertHeaderSafe(a.mime, 'attachment type')
    return a
  })

  const boundary = randomBoundary()
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    ...(cc.length > 0 ? [`Cc: ${cc.join(', ')}`] : []),
    `Subject: ${encodeSubject(input.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ]

  const parts: string[] = [
    [
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase64(enc.encode(input.text)),
    ].join(CRLF),
  ]
  for (const a of attachments) {
    parts.push(
      [
        `Content-Type: ${a.mime}`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename*=UTF-8''${encodeFileName(a.name)}`,
        '',
        wrapBase64(a.bytes),
      ].join(CRLF),
    )
  }

  const body = parts.map((p) => `--${boundary}${CRLF}${p}${CRLF}`).join('') + `--${boundary}--${CRLF}`
  return enc.encode(headers.join(CRLF) + CRLF + CRLF + body)
}
