import { describe, it, expect } from 'vitest'
import { buildMime, MimeError } from '../../src/lib/mime'

const enc = new TextEncoder()
const dec = new TextDecoder()

interface ParsedPart {
  headers: Record<string, string>
  body: Uint8Array
}

interface ParsedMessage {
  headers: Record<string, string>
  parts: ParsedPart[]
}

function parseHeaderBlock(block: string): Record<string, string> {
  const out: Record<string, string> = {}
  // unfold continuation lines (RFC 5322 section 2.2.3)
  const unfolded = block.replace(/\r\n[ \t]+/g, ' ')
  for (const line of unfolded.split('\r\n')) {
    if (!line) continue
    const idx = line.indexOf(':')
    out[line.slice(0, idx).toLowerCase()] = line.slice(idx + 1).trim()
  }
  return out
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Decode RFC 2047 encoded words (UTF-8, base64) in a header value. */
function decodeHeader(value: string): string {
  const words = [...value.matchAll(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/g)]
  if (words.length === 0) return value
  const bytes = words.map((m) => base64ToBytes(m[1]))
  const total = bytes.reduce((n, b) => n + b.length, 0)
  const joined = new Uint8Array(total)
  let off = 0
  for (const b of bytes) {
    joined.set(b, off)
    off += b.length
  }
  return dec.decode(joined)
}

function parse(raw: Uint8Array): ParsedMessage {
  const text = dec.decode(raw)
  const sep = text.indexOf('\r\n\r\n')
  const headers = parseHeaderBlock(text.slice(0, sep))
  const boundary = /boundary="([^"]+)"/.exec(headers['content-type'])?.[1]
  if (!boundary) throw new Error('no boundary')
  const pieces = text.slice(sep + 4).split(`--${boundary}`)
  // pieces[0] is the preamble (empty), the last piece is the closing "--\r\n"
  const parts: ParsedPart[] = pieces.slice(1, -1).map((piece) => {
    const trimmed = piece.replace(/^\r\n/, '').replace(/\r\n$/, '')
    const partSep = trimmed.indexOf('\r\n\r\n')
    return {
      headers: parseHeaderBlock(trimmed.slice(0, partSep)),
      body: enc.encode(trimmed.slice(partSep + 4)),
    }
  })
  return { headers, parts }
}

function bodyText(part: ParsedPart): string {
  return dec.decode(base64ToBytes(dec.decode(part.body)))
}

function fileName(part: ParsedPart): string {
  const cd = part.headers['content-disposition']
  const m = /filename\*=UTF-8''(\S+)/.exec(cd)
  if (!m) throw new Error('no filename*')
  return decodeURIComponent(m[1])
}

const pdfA = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00, 0xff, 0x0a, ...enc.encode('GYC bytes')])
const pdfB = new Uint8Array(3000).map((_, i) => (i * 37) % 256)

const base = {
  from: 'claimant@example.com',
  to: 'claims@example.org',
  cc: ['broker@example.net', 'copy@example.net'],
  subject: 'HS YCBT – Nguyễn Văn An – 12345 – Công ty ABC',
  text: 'Kính gửi PTI,\nXin gửi hồ sơ bồi thường kèm theo.\nCảm ơn.',
  attachments: [
    { name: 'GYC bồi thường kính mắt.pdf', bytes: pdfA, mime: 'application/pdf' },
    { name: 'Chứng từ kính mắt.pdf', bytes: pdfB, mime: 'application/pdf' },
  ],
}

describe('claim-submission.gmail.message', () => {
  it('claim-submission.gmail.message: decodes sender, recipient, CC and an RFC 2047 subject back to the input', () => {
    const msg = parse(buildMime(base))
    expect(msg.headers['from']).toBe('claimant@example.com')
    expect(msg.headers['to']).toBe('claims@example.org')
    expect(msg.headers['cc']).toBe('broker@example.net, copy@example.net')
    expect(msg.headers['mime-version']).toBe('1.0')
    expect(decodeHeader(msg.headers['subject'])).toBe(base.subject)
    expect(msg.headers['subject']).toMatch(/^(=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= ?)+$/)
  })

  it('claim-submission.gmail.message: is multipart/mixed with a text/plain UTF-8 body and both PDFs as application/pdf', () => {
    const msg = parse(buildMime(base))
    expect(msg.headers['content-type']).toMatch(/^multipart\/mixed; boundary="[^"]+"$/)
    expect(msg.parts).toHaveLength(3)

    const [text, first, second] = msg.parts
    expect(text.headers['content-type']).toBe('text/plain; charset=UTF-8')
    expect(text.headers['content-transfer-encoding']).toBe('base64')
    expect(bodyText(text)).toBe(base.text)

    for (const part of [first, second]) {
      expect(part.headers['content-type']).toBe('application/pdf')
      expect(part.headers['content-transfer-encoding']).toBe('base64')
      expect(part.headers['content-disposition']).toMatch(/^attachment; filename\*=UTF-8''/)
    }
    expect(fileName(first)).toBe('GYC bồi thường kính mắt.pdf')
    expect(fileName(second)).toBe('Chứng từ kính mắt.pdf')
  })

  it('claim-submission.gmail.message: attachment bytes equal the built files exactly', () => {
    const msg = parse(buildMime(base))
    const [, first, second] = msg.parts
    expect(base64ToBytes(dec.decode(first.body))).toEqual(pdfA)
    expect(base64ToBytes(dec.decode(second.body))).toEqual(pdfB)
  })

  it('claim-submission.gmail.message: wraps base64 lines at 76 characters', () => {
    const raw = dec.decode(buildMime(base))
    const b64Lines = raw.split('\r\n').filter((l) => /^[A-Za-z0-9+/=]{76}$/.test(l))
    expect(b64Lines.length).toBeGreaterThan(0)
    for (const line of raw.split('\r\n')) {
      if (/^[A-Za-z0-9+/=]+$/.test(line)) expect(line.length).toBeLessThanOrEqual(76)
    }
  })

  it('claim-submission.gmail.message: leaves an ASCII subject unencoded and omits Cc when empty', () => {
    const msg = parse(buildMime({ ...base, subject: 'HS YCBT - Test', cc: [] }))
    expect(msg.headers['subject']).toBe('HS YCBT - Test')
    expect(msg.headers['cc']).toBeUndefined()
  })

  it('claim-submission.gmail.message: splits a long non-ASCII subject into encoded words of at most 75 characters without breaking a character', () => {
    const subject = 'HS YCBT – ' + 'Nguyễn Thị Hương Giang đồng ý '.repeat(6) + '– hết'
    const msg = parse(buildMime({ ...base, subject }))
    const words = msg.headers['subject'].split(/\s+/)
    for (const w of words) expect(w.length).toBeLessThanOrEqual(75)
    expect(decodeHeader(msg.headers['subject'])).toBe(subject)
  })

  it('claim-submission.gmail.message: rejects CR/LF injection in subject, addresses and filenames', () => {
    const injected = 'ok\r\nBcc: attacker@example.com'
    expect(() => buildMime({ ...base, subject: injected })).toThrow(MimeError)
    expect(() => buildMime({ ...base, subject: 'ok\nBcc: attacker@example.com' })).toThrow(MimeError)
    expect(() => buildMime({ ...base, to: 'claims@example.org\r\nBcc: attacker@example.com' })).toThrow(MimeError)
    expect(() => buildMime({ ...base, from: 'claimant@example.com\nBcc: x@example.com' })).toThrow(MimeError)
    expect(() => buildMime({ ...base, cc: ['copy@example.net\r\nBcc: x@example.com'] })).toThrow(MimeError)
    expect(() =>
      buildMime({
        ...base,
        attachments: [{ name: 'a.pdf\r\nBcc: x@example.com', bytes: pdfA, mime: 'application/pdf' }],
      }),
    ).toThrow(MimeError)
  })

  it('claim-submission.gmail.message: a rejected header never produces a partial message', () => {
    let out: Uint8Array | null = null
    try {
      out = buildMime({ ...base, subject: 'x\r\nBcc: y@example.com' })
    } catch (e) {
      expect(e).toBeInstanceOf(MimeError)
    }
    expect(out).toBeNull()
  })
})
