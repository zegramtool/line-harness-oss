export type ChatFileContent = {
  url?: string
  fileUrl?: string
  fileName: string
  size?: number
  mimeType?: string
  expiresAtLabel?: string
}

const LEGACY_FILE_RE = /^\[ファイル(?::\s*(.+))?\]$/

export function formatChatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function isChatPdfFile(file: ChatFileContent): boolean {
  if (file.mimeType === 'application/pdf' || file.mimeType === 'application/x-pdf') return true
  if (file.fileName.toLowerCase().endsWith('.pdf')) return true
  const href = file.fileUrl || file.url || ''
  return /\/pdf\/|\/files\/|\.pdf(\?|$)/i.test(href)
}

export function parseChatFileContent(content: string): ChatFileContent | null {
  const trimmed = content.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed) as {
      url?: unknown
      fileUrl?: unknown
      fileName?: unknown
      size?: unknown
      fileSize?: unknown
      mimeType?: unknown
      expiresAtLabel?: unknown
    }
    const url = typeof parsed.url === 'string' ? parsed.url : undefined
    const fileUrl = typeof parsed.fileUrl === 'string' ? parsed.fileUrl : undefined
    const fileName = typeof parsed.fileName === 'string' && parsed.fileName.trim()
      ? parsed.fileName
      : 'PDF'
    const size = typeof parsed.size === 'number'
      ? parsed.size
      : typeof parsed.fileSize === 'number'
        ? parsed.fileSize
        : undefined
    const mimeType = typeof parsed.mimeType === 'string' ? parsed.mimeType : undefined
    const expiresAtLabel = typeof parsed.expiresAtLabel === 'string' ? parsed.expiresAtLabel : undefined
    if (!url && !fileUrl) {
      return { fileName, size, mimeType, expiresAtLabel }
    }
    return { url, fileUrl, fileName, size, mimeType, expiresAtLabel }
  } catch {
    const legacy = trimmed.match(LEGACY_FILE_RE)
    if (legacy) {
      return { fileName: legacy[1]?.trim() || 'ファイル' }
    }
    return null
  }
}

export function chatFilePreviewLabel(content: string): string {
  const parsed = parseChatFileContent(content)
  if (!parsed) return '📎 ファイル'
  return `📎 ${parsed.fileName}`
}

export function chatFileDownloadHref(file: ChatFileContent): string | undefined {
  const href = file.fileUrl || file.url
  if (!href) return undefined
  try {
    const u = new URL(href)
    if (u.pathname.startsWith('/files/')) {
      u.searchParams.set('dl', '1')
      return u.toString()
    }
    u.searchParams.set('download', '1')
    return u.toString()
  } catch {
    if (href.includes('/files/')) {
      return href.includes('?') ? `${href}&dl=1` : `${href}?dl=1`
    }
    return href.includes('?') ? `${href}&download=1` : `${href}?download=1`
  }
}
