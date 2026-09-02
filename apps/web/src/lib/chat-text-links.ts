/** トーク本文から http(s) URL を切り出す。地図の短縮リンクも含む。 */

export type ChatTextPart =
  | { type: 'text'; value: string }
  | { type: 'url'; value: string }

/**
 * 日本語の直後に URL が続くケースと、URL の直後に日本語が続くケースを切る。
 * javascript: などはマッチしない（https? のみ）。
 */
const URL_RE =
  /https?:\/\/[^\s<>"'、。，．）】」』\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]+/gi

const TRAILING_PUNCT_RE = /[),.;:!?…]+$/

export function sanitizeHttpUrl(raw: string): string | null {
  const trimmed = raw.replace(TRAILING_PUNCT_RE, '')
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

export function splitChatTextLinks(text: string): ChatTextPart[] {
  if (!text) return []
  const parts: ChatTextPart[] = []
  const re = new RegExp(URL_RE.source, URL_RE.flags)
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const raw = match[0]
    const href = sanitizeHttpUrl(raw)
    if (!href) continue
    const consumed = raw.replace(TRAILING_PUNCT_RE, '')
    if (match.index > last) {
      parts.push({ type: 'text', value: text.slice(last, match.index) })
    }
    parts.push({ type: 'url', value: consumed })
    last = match.index + consumed.length
  }
  if (last < text.length) {
    parts.push({ type: 'text', value: text.slice(last) })
  }
  return parts
}
