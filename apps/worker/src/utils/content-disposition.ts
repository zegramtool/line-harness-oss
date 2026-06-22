/** アップロード時のファイル名を安全な表示名に正規化 */
export function sanitizeDownloadFilename(name: string, fallback = 'document.pdf'): string {
  const normalized = name.normalize('NFC');
  const base = normalized.split(/[/\\]/).pop()?.trim() ?? '';
  const stripped = base.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200);
  if (!stripped) return fallback;
  return stripped.toLowerCase().endsWith('.pdf') ? stripped : `${stripped}.pdf`;
}

/** 公開 URL のパスに載せるファイル名スラッグ（iPhone が URL 末尾をファイル名に使うため） */
export function encodeFilenamePathSegment(filename: string): string {
  return encodeURIComponent(sanitizeDownloadFilename(filename));
}

/**
 * RFC 6266 / 5987 — 日本語ファイル名もダウンロード時に維持する Content-Disposition
 */
export function buildContentDispositionHeader(
  filename: string,
  disposition: 'inline' | 'attachment' = 'inline',
): string {
  const safe = sanitizeDownloadFilename(filename);
  const asciiFallback = safe.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') || 'document.pdf';
  const encoded = encodeURIComponent(safe)
    .replace(/['()]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, '%2A');
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
