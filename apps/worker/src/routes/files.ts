import { Hono } from 'hono';
import type { Env } from '../index.js';
import {
  CHAT_PDF_MAX_BYTES,
  CHAT_PDF_R2_PREFIX,
  buildChatPdfPublicUrl,
  buildChatPdfViewerUrl,
  chatPdfStorageKeyFromPath,
  computeChatPdfExpiresAt,
  formatChatPdfExpiresAtJa,
  getChatPdfTtlDays,
  isChatPdfExpired,
} from '../services/chat-pdf-storage.js';
import { renderChatPdfViewerPage } from '../services/chat-pdf-viewer-page.js';
import {
  buildContentDispositionHeader,
  sanitizeDownloadFilename,
} from '../utils/content-disposition.js';

const PDF_MIME = 'application/pdf';

const files = new Hono<Env>();

function workerPublicOrigin(c: { env: Env; req: { url: string } }): string {
  return (
    c.env.WORKER_PUBLIC_URL ||
    c.env.WORKER_URL ||
    new URL(c.req.url).origin
  ).replace(/\/$/, '');
}

// POST /api/files — upload PDF (staff auth via global middleware)
files.post('/api/files', async (c) => {
  try {
    const contentType = c.req.header('Content-Type') || '';
    const data = await c.req.arrayBuffer();
    const mimeType = contentType.split(';')[0].trim() || PDF_MIME;
    const filenameHeader = c.req.header('X-Filename');
    const rawFilename = filenameHeader ? decodeURIComponent(filenameHeader) : undefined;
    const filename = rawFilename ? sanitizeDownloadFilename(rawFilename) : undefined;

    if (data.byteLength === 0) {
      return c.json({ success: false, error: 'Empty file' }, 400);
    }
    if (data.byteLength > CHAT_PDF_MAX_BYTES) {
      return c.json({ success: false, error: 'PDF too large (max 20MB)' }, 400);
    }
    if (mimeType !== PDF_MIME) {
      return c.json({ success: false, error: 'PDF のみアップロードできます' }, 400);
    }

    const ttlDays = getChatPdfTtlDays(c.env);
    const expiresAt = computeChatPdfExpiresAt(ttlDays);
    const id = crypto.randomUUID();
    const key = `${CHAT_PDF_R2_PREFIX}${id}.pdf`;
    const displayName = filename ?? 'document.pdf';

    await c.env.IMAGES.put(key, data, {
      httpMetadata: { contentType: PDF_MIME },
      customMetadata: {
        originalFilename: displayName,
        expiresAt,
        ttlDays: String(ttlDays),
      },
    });

    const origin = workerPublicOrigin(c);
    const fileUrl = buildChatPdfPublicUrl(origin, id, displayName);
    const url = buildChatPdfViewerUrl(origin, id);

    return c.json(
      {
        success: true,
        data: {
          id,
          key,
          url,
          fileUrl,
          mimeType: PDF_MIME,
          size: data.byteLength,
          fileName: displayName,
          expiresAt,
          expiresAtLabel: formatChatPdfExpiresAtJa(expiresAt),
          ttlDays,
        },
      },
      201,
    );
  } catch (err) {
    console.error('POST /api/files error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /files/* — serve PDF (public). パス例:
//   /files/{uuid}.pdf
//   /files/{uuid}/{元のファイル名}.pdf  ← iPhone が末尾を保存名に使う
//   ?dl=1 で attachment（ファイルに保存向け）
files.get('/files/*', async (c) => {
  const storageKey = chatPdfStorageKeyFromPath(c.req.path);
  if (!storageKey) {
    return c.json({ success: false, error: 'File not found' }, 404);
  }

  const object = await c.env.IMAGES.get(storageKey);
  if (!object) {
    return c.json({ success: false, error: 'File not found' }, 404);
  }

  const expiresAt = object.customMetadata?.expiresAt;
  if (isChatPdfExpired(expiresAt)) {
    return c.json(
      { success: false, error: 'この PDF のリンクは有効期限が切れています' },
      410,
    );
  }

  const pathTail = decodeURIComponent(c.req.path.replace(/^\/files\/[^/]+\//, ''));
  const originalName = object.customMetadata?.originalFilename
    || (pathTail && !pathTail.includes('/') ? pathTail : '')
    || 'document.pdf';

  const forceDownload = c.req.query('dl') === '1' || c.req.query('download') === '1';
  const disposition = forceDownload ? 'attachment' : 'inline';

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || PDF_MIME);
  headers.set('Cache-Control', 'private, max-age=3600');
  headers.set('ETag', object.etag);
  headers.set('Content-Disposition', buildContentDispositionHeader(originalName, disposition));

  return new Response(object.body, { headers });
});

const PDF_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /pdf/:id — LINE 内ブラウザ向けビューア（プレビュー + Web Share で PDF 保存）
files.get('/pdf/:id', async (c) => {
  const id = c.req.param('id');
  if (!PDF_ID_RE.test(id)) {
    return c.json({ success: false, error: 'File not found' }, 404);
  }

  const storageKey = `${CHAT_PDF_R2_PREFIX}${id}.pdf`;
  const object = await c.env.IMAGES.head(storageKey);
  if (!object) {
    return c.json({ success: false, error: 'File not found' }, 404);
  }

  const expiresAt = object.customMetadata?.expiresAt;
  if (isChatPdfExpired(expiresAt)) {
    return c.json(
      { success: false, error: 'この PDF のリンクは有効期限が切れています' },
      410,
    );
  }

  const fileName = object.customMetadata?.originalFilename || 'document.pdf';
  const origin = workerPublicOrigin(c);
  const pdfUrl = buildChatPdfPublicUrl(origin, id, fileName);
  const expiresAtLabel = expiresAt ? formatChatPdfExpiresAtJa(expiresAt) : undefined;

  const html = renderChatPdfViewerPage({ fileName, pdfUrl, expiresAtLabel });
  return c.html(html);
});

export { files };
