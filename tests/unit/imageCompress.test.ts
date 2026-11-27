import { afterEach, describe, expect, it, vi } from 'vitest'
import { probeImage } from '../../src/lib/imageCompress'

describe('probeImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('đọc kích thước và đóng bitmap', async () => {
    const close = vi.fn()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 640, height: 480, close })),
    )
    await expect(probeImage(new Blob(['x']))).resolves.toEqual({ width: 640, height: 480 })
    expect(close).toHaveBeenCalled()
  })
})
