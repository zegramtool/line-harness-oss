export type ChatVideoContent = {
  originalContentUrl: string
  previewImageUrl?: string
  mimeType?: string
  size?: number
  durationMs?: number
}

export function parseChatVideoContent(content: string): ChatVideoContent | null {
  try {
    const parsed = JSON.parse(content) as {
      originalContentUrl?: unknown
      previewImageUrl?: unknown
      mimeType?: unknown
      size?: unknown
      durationMs?: unknown
    }
    if (typeof parsed.originalContentUrl !== 'string' || !parsed.originalContentUrl.trim()) {
      return null
    }
    const out: ChatVideoContent = { originalContentUrl: parsed.originalContentUrl }
    if (typeof parsed.previewImageUrl === 'string' && parsed.previewImageUrl.trim()) {
      out.previewImageUrl = parsed.previewImageUrl
    }
    if (typeof parsed.mimeType === 'string') out.mimeType = parsed.mimeType
    if (typeof parsed.size === 'number' && Number.isFinite(parsed.size)) out.size = parsed.size
    if (typeof parsed.durationMs === 'number' && Number.isFinite(parsed.durationMs)) {
      out.durationMs = parsed.durationMs
    }
    return out
  } catch {
    return null
  }
}

export function chatVideoDownloadHref(url: string): string {
  try {
    const u = new URL(url)
    u.searchParams.set('download', '1')
    return u.toString()
  } catch {
    return url.includes('?') ? `${url}&download=1` : `${url}?download=1`
  }
}
