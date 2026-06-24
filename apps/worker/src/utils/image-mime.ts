const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const

export function sniffImageMimeType(data: ArrayBuffer): (typeof ALLOWED_IMAGE_TYPES)[number] | null {
  const u = new Uint8Array(data.slice(0, 12))
  if (u.length >= 3 && u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff) return 'image/jpeg'
  if (
    u.length >= 8 &&
    u[0] === 0x89 &&
    u[1] === 0x50 &&
    u[2] === 0x4e &&
    u[3] === 0x47 &&
    u[4] === 0x0d &&
    u[5] === 0x0a &&
    u[6] === 0x1a &&
    u[7] === 0x0a
  ) {
    return 'image/png'
  }
  if (u.length >= 6 && u[0] === 0x47 && u[1] === 0x49 && u[2] === 0x46) return 'image/gif'
  if (
    u.length >= 12 &&
    u[0] === 0x52 &&
    u[1] === 0x49 &&
    u[2] === 0x46 &&
    u[3] === 0x46 &&
    u[8] === 0x57 &&
    u[9] === 0x45 &&
    u[10] === 0x42 &&
    u[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
}

export function resolveUploadedImageMimeType(
  contentTypeHeader: string,
  data: ArrayBuffer,
): (typeof ALLOWED_IMAGE_TYPES)[number] | null {
  const headerMime = contentTypeHeader.split(';')[0].trim().toLowerCase()
  if (ALLOWED_IMAGE_TYPES.includes(headerMime as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return headerMime as (typeof ALLOWED_IMAGE_TYPES)[number]
  }
  if (!headerMime || headerMime === 'application/octet-stream') {
    return sniffImageMimeType(data)
  }
  return null
}

export { ALLOWED_IMAGE_TYPES }
