import {
  CHAT_PDF_MAX_BYTES,
  CHAT_PDF_R2_PREFIX,
  buildChatPdfPublicUrl,
  buildChatPdfViewerUrl,
} from './chat-pdf-storage.js';
import { sanitizeDownloadFilename } from '../utils/content-disposition.js';

const LINE_CONTENT_API_BASE = 'https://api-data.line.me/v2/bot/message';
const PDF_MIME = 'application/pdf';

export interface FetchAndStoreIncomingFileOptions {
  r2: R2Bucket;
  /** workers 環境では globalThis.fetch を使う。テスト時に注入する。 */
  fetch?: typeof fetch;
  workerUrl: string;
  channelAccessToken: string;
  accountId: string;
  messageId: string;
  fileName?: string;
  fileSize?: number;
  /** テスト用。省略時は crypto.randomUUID() */
  id?: string;
}

export interface IncomingFileRefs {
  url: string;
  fileUrl: string;
  fileName: string;
  size: number;
  mimeType: string;
}

export function looksLikePdf(fileName: string, contentType: string): boolean {
  const mime = contentType.split(';')[0].trim().toLowerCase();
  if (mime === PDF_MIME || mime === 'application/x-pdf') return true;
  return fileName.toLowerCase().endsWith('.pdf');
}

export function sanitizeIncomingFilename(name: string, fallback = 'file.bin'): string {
  const normalized = name.normalize('NFC');
  const base = normalized.split(/[/\\]/).pop()?.trim() ?? '';
  const stripped = base.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200);
  return stripped || fallback;
}

function extFromFilename(fileName: string): string | null {
  const m = fileName.toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return m ? m[1] : null;
}

function extFromContentType(contentType: string): string | null {
  const mime = contentType.split(';')[0].trim().toLowerCase();
  if (mime === PDF_MIME) return 'pdf';
  if (mime === 'application/zip') return 'zip';
  if (mime === 'application/msword') return 'doc';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (mime === 'text/plain') return 'txt';
  return null;
}

/**
 * LINE Content API から incoming ファイルを取得し R2 に保存する。
 * PDF は送信 PDF と同じ `/files/{uuid}` + `/pdf/{uuid}` ビューアを使う（期限なし。受信画像と同様に残す）。
 * 失敗時は null。呼び出し元は `[ファイル: 名前]` ラベルへフォールバックする。
 */
export async function fetchAndStoreIncomingFile(
  opts: FetchAndStoreIncomingFileOptions,
): Promise<IncomingFileRefs | null> {
  const fetcher = opts.fetch ?? fetch;
  const declaredSize = typeof opts.fileSize === 'number' ? opts.fileSize : 0;
  if (declaredSize > CHAT_PDF_MAX_BYTES) {
    console.error('incoming-file: declared size too large', {
      fileSize: declaredSize,
      messageId: opts.messageId,
      accountId: opts.accountId,
    });
    return null;
  }

  let res: Response;
  try {
    res = await fetcher(`${LINE_CONTENT_API_BASE}/${opts.messageId}/content`, {
      headers: { Authorization: `Bearer ${opts.channelAccessToken}` },
    });
  } catch (err) {
    console.error('incoming-file: fetch failed', { err, messageId: opts.messageId, accountId: opts.accountId });
    return null;
  }

  if (!res.ok) {
    console.error('incoming-file: non-200', { status: res.status, messageId: opts.messageId, accountId: opts.accountId });
    return null;
  }

  const contentLength = Number.parseInt(res.headers.get('Content-Length') ?? '', 10);
  if (Number.isFinite(contentLength) && contentLength > CHAT_PDF_MAX_BYTES) {
    console.error('incoming-file: content-length too large', {
      contentLength,
      messageId: opts.messageId,
      accountId: opts.accountId,
    });
    return null;
  }

  const contentType = res.headers.get('Content-Type')?.split(';')[0].trim() || 'application/octet-stream';
  let data: ArrayBuffer;
  try {
    data = await res.arrayBuffer();
  } catch (err) {
    console.error('incoming-file: arrayBuffer failed', { err, messageId: opts.messageId, accountId: opts.accountId });
    return null;
  }

  if (data.byteLength === 0 || data.byteLength > CHAT_PDF_MAX_BYTES) {
    console.error('incoming-file: invalid size', {
      size: data.byteLength,
      messageId: opts.messageId,
      accountId: opts.accountId,
    });
    return null;
  }

  const rawName = opts.fileName?.trim() || '';
  const isPdf = looksLikePdf(rawName, contentType);
  const fileName = isPdf
    ? sanitizeDownloadFilename(rawName || 'document.pdf')
    : sanitizeIncomingFilename(rawName || `file.${extFromContentType(contentType) ?? 'bin'}`);
  const mimeType = isPdf ? PDF_MIME : contentType;
  const base = opts.workerUrl.replace(/\/$/, '');

  if (isPdf) {
    const id = opts.id ?? crypto.randomUUID();
    const key = `${CHAT_PDF_R2_PREFIX}${id}.pdf`;
    try {
      await opts.r2.put(key, data, {
        httpMetadata: { contentType: PDF_MIME },
        customMetadata: {
          originalFilename: fileName,
          source: 'incoming',
        },
      });
    } catch (err) {
      console.error('incoming-file: R2 put failed', { err, messageId: opts.messageId, accountId: opts.accountId });
      return null;
    }
    return {
      url: buildChatPdfViewerUrl(base, id),
      fileUrl: buildChatPdfPublicUrl(base, id, fileName),
      fileName,
      size: data.byteLength,
      mimeType: PDF_MIME,
    };
  }

  const safeAccountId = opts.accountId.replace(/[^a-zA-Z0-9-]/g, '_');
  const safeMessageId = opts.messageId.replace(/[^a-zA-Z0-9-]/g, '_');
  const ext = extFromFilename(fileName) ?? extFromContentType(contentType) ?? 'bin';
  const key = `incoming-${safeAccountId}-${safeMessageId}.${ext}`;
  try {
    await opts.r2.put(key, data, {
      httpMetadata: { contentType: mimeType },
      customMetadata: { originalFilename: fileName, source: 'incoming' },
    });
  } catch (err) {
    console.error('incoming-file: R2 put failed', { err, messageId: opts.messageId, accountId: opts.accountId });
    return null;
  }
  const url = `${base}/images/${key}`;
  return {
    url,
    fileUrl: url,
    fileName,
    size: data.byteLength,
    mimeType,
  };
}
