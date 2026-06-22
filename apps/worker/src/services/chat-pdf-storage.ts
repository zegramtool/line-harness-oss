/** チャット送信用 PDF（R2 `files/` プレフィックス）の有効期限・削除 */

import { encodeFilenamePathSegment } from '../utils/content-disposition.js';

export const CHAT_PDF_MAX_BYTES = 20 * 1024 * 1024;
export const CHAT_PDF_R2_PREFIX = 'files/';

const PDF_UUID_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.pdf)?(?:\/|$)/i;

/** `/files/{uuid}.pdf` または `/files/{uuid}/{表示名}.pdf` から R2 キーを解決 */
export function chatPdfStorageKeyFromPath(pathname: string): string | null {
  const rest = pathname.replace(/^\/files\//, '');
  const m = rest.match(PDF_UUID_RE);
  if (!m) return null;
  return `${CHAT_PDF_R2_PREFIX}${m[1]}.pdf`;
}

/** LINE / 管理画面向けの公開 URL（パスに元ファイル名を含める） */
export function buildChatPdfPublicUrl(
  origin: string,
  id: string,
  fileName: string,
  opts?: { download?: boolean },
): string {
  const base = `${origin.replace(/\/$/, '')}/files/${id}/${encodeFilenamePathSegment(fileName)}`;
  return opts?.download ? `${base}?dl=1` : base;
}

export function buildChatPdfViewerUrl(origin: string, id: string): string {
  return `${origin.replace(/\/$/, '')}/pdf/${id}`;
}

export function appendChatPdfDownloadQuery(url: string): string {
  return url.includes('?') ? `${url}&dl=1` : `${url}?dl=1`;
}

const DEFAULT_TTL_DAYS = 30;

export function getChatPdfTtlDays(env: { CHAT_PDF_TTL_DAYS?: string }): number {
  const raw = env.CHAT_PDF_TTL_DAYS?.trim();
  if (!raw) return DEFAULT_TTL_DAYS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_TTL_DAYS;
  return Math.min(n, 365);
}

export function computeChatPdfExpiresAt(ttlDays: number, from = new Date()): string {
  const expires = new Date(from.getTime() + ttlDays * 24 * 60 * 60 * 1000);
  return expires.toISOString();
}

export function isChatPdfExpired(expiresAt: string | undefined, now = new Date()): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return false;
  return t <= now.getTime();
}

export function formatChatPdfExpiresAtJa(expiresAt: string): string {
  const d = new Date(expiresAt);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 期限切れ PDF を R2 から削除（6h cron 想定） */
export async function purgeExpiredChatPdfs(
  bucket: R2Bucket,
  now = new Date(),
): Promise<{ scanned: number; deleted: number }> {
  let scanned = 0;
  let deleted = 0;
  let cursor: string | undefined;

  do {
    const page = await bucket.list({ prefix: CHAT_PDF_R2_PREFIX, cursor, limit: 100 });
    for (const obj of page.objects) {
      scanned++;
      const head = await bucket.head(obj.key);
      const expiresAt = head?.customMetadata?.expiresAt;
      if (!isChatPdfExpired(expiresAt, now)) continue;
      await bucket.delete(obj.key);
      deleted++;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return { scanned, deleted };
}
