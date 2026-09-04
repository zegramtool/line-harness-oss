import { Hono } from 'hono';
import type { Env } from '../index.js';
import { ALLOWED_IMAGE_TYPES, resolveUploadedImageMimeType } from '../utils/image-mime.js';
import { parseHttpBytesRange } from '../utils/http-range.js';

const images = new Hono<Env>();

function imagePublicOrigin(c: { env: Env['Bindings']; req: { url: string } }): string {
  return (
    c.env.WORKER_PUBLIC_URL ||
    c.env.WORKER_URL ||
    new URL(c.req.url).origin
  ).replace(/\/$/, '');
}

// POST /api/images — upload image (base64 or binary)
images.post('/api/images', async (c) => {
  try {
    const contentType = c.req.header('Content-Type') || '';

    let data: ArrayBuffer;
    let mimeType: string;
    let filename: string | undefined;

    if (contentType.includes('application/json')) {
      const body = await c.req.json<{
        data: string;
        mimeType?: string;
        filename?: string;
      }>();

      if (!body.data) {
        return c.json({ success: false, error: 'data (base64) is required' }, 400);
      }

      let base64 = body.data;
      if (base64.startsWith('data:')) {
        const match = base64.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          mimeType = match[1];
          base64 = match[2];
        }
      }
      mimeType ??= body.mimeType ?? 'image/png';
      filename = body.filename;

      const binary = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
      data = binary.buffer;
    } else {
      data = await c.req.arrayBuffer();
      const resolved = resolveUploadedImageMimeType(contentType, data);
      if (!resolved) {
        return c.json(
          {
            success: false,
            error: `Unsupported image type. Allowed: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
          },
          400,
        );
      }
      mimeType = resolved;
    }

    if (data.byteLength > 10 * 1024 * 1024) {
      return c.json({ success: false, error: 'Image too large (max 10MB)' }, 400);
    }

    if (!ALLOWED_IMAGE_TYPES.includes(mimeType as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      return c.json({ success: false, error: `Unsupported image type: ${mimeType}. Allowed: ${ALLOWED_IMAGE_TYPES.join(', ')}` }, 400);
    }

    const ext = mimeType.split('/')[1] === 'jpeg' ? 'jpg' : mimeType.split('/')[1];
    const id = crypto.randomUUID();
    const key = `${id}.${ext}`;

    await c.env.IMAGES.put(key, data, {
      httpMetadata: { contentType: mimeType },
      customMetadata: { originalFilename: filename ?? key },
    });

    const url = `${imagePublicOrigin(c)}/images/${key}`;

    return c.json({
      success: true,
      data: { id, key, url, mimeType, size: data.byteLength },
    }, 201);
  } catch (err) {
    console.error('POST /api/images error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

function isVideoObject(key: string, contentType: string): boolean {
  return contentType.startsWith('video/') || key.toLowerCase().endsWith('.mp4');
}

// GET /images/:key — serve image / incoming video (public, no auth)
// 画像は常に 200 で全文返す。Range/206 は LINE の複数枚 push 検証を壊す。
// 動画再生（iOS）だけ Range を付ける。
images.get('/images/:key', async (c) => {
  const key = c.req.param('key');
  const forceDownload = c.req.query('download') === '1';
  const object = await c.env.IMAGES.get(key);
  if (!object) {
    return c.json({ success: false, error: 'Image not found' }, 404);
  }

  const contentType = object.httpMetadata?.contentType || 'image/png';
  const size = Number(object.size ?? 0);
  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('ETag', object.etag);
  headers.set('Access-Control-Allow-Origin', '*');
  if (forceDownload) {
    const safeName = key.replace(/[^\w.\-]+/g, '_') || 'file';
    headers.set('Content-Disposition', `attachment; filename="${safeName}"`);
  }

  const allowRange = !forceDownload && isVideoObject(key, contentType);
  if (allowRange && size > 0) {
    const range = parseHttpBytesRange(c.req.header('Range'), size);
    if (range) {
      const ranged = await c.env.IMAGES.get(key, { range });
      if (!ranged) {
        return c.json({ success: false, error: 'Image not found' }, 404);
      }
      const start = range.offset;
      const end = range.offset + range.length - 1;
      headers.set('Accept-Ranges', 'bytes');
      headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
      headers.set('Content-Length', String(range.length));
      return new Response(ranged.body, { status: 206, headers });
    }
    headers.set('Accept-Ranges', 'bytes');
  }

  if (size > 0) {
    headers.set('Content-Length', String(size));
  }
  return new Response(object.body, { headers });
});

// DELETE /api/images/:key — delete image
images.delete('/api/images/:key', async (c) => {
  try {
    const key = c.req.param('key');
    await c.env.IMAGES.delete(key);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/images/:key error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { images };
