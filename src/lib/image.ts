/**
 * Downscale an image so its longest edge is at most `maxEdge` px, re-encoded as JPEG.
 * Images already within `maxEdge` keep their size (never upscaled). Browser-only.
 */
export async function downscaleImage(
  file: Blob,
  maxEdge = 2000,
  quality = 0.8,
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height)
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality })
      return { blob, width, height }
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
        'image/jpeg',
        quality,
      ),
    )
    return { blob, width, height }
  } finally {
    bitmap.close()
  }
}

/** Lowercase hex SHA-256 digest of a blob. */
export async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
