import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Kiểm tra cấu hình: mô hình OCR không nằm trong precache và không bị app shell thay thế.
const root = resolve(__dirname, '../..')
const dist = (rel: string) => resolve(root, 'dist', rel)

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

describe('document-ocr.model.offline-ready: vite.config keeps the OCR model out of precache', () => {
  const cfg = readFileSync(resolve(root, 'vite.config.ts'), 'utf8')

  it('document-ocr.model.offline-ready: workbox globIgnores excludes ocr/**', () => {
    expect(cfg).toMatch(/globIgnores:\s*\[[^\]]*'ocr\/\*\*'[^\]]*\]/)
  })

  it('document-ocr.model.offline-ready: navigateFallbackDenylist contains /ocr/', () => {
    expect(cfg).toMatch(/navigateFallbackDenylist:\s*\[[^\]]*\\\/ocr\\\//)
  })
})

describe.skipIf(!existsSync(dist('sw.js')))('document-ocr.model.offline-ready: built dist', () => {
  const sw = existsSync(dist('sw.js')) ? readFileSync(dist('sw.js'), 'utf8') : ''

  it('document-ocr.model.offline-ready: precache manifest has no ocr/ entries', () => {
    expect(sw).toContain('url:"index.html"')
    expect(sw).not.toMatch(/url:"ocr\//)
    expect(sw).not.toContain('ocr/vietocr')
  })

  it('document-ocr.model.offline-ready: ort wasm is shipped exactly once and not duplicated into assets', () => {
    const wasm = walk(dist('.')).filter((file) => file.endsWith('.wasm'))
    expect(wasm.map((file) => relative(dist(''), file))).toEqual(['ocr/vietocr/ort/ort-wasm-simd-threaded.wasm'])
  })

  it('document-ocr.model.offline-ready: LICENSE of the VietOCR model is kept in dist', () => {
    expect(existsSync(dist('ocr/vietocr/LICENSE-vietocr-onnx.txt'))).toBe(true)
  })
})
