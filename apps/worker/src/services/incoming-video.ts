const LINE_CONTENT_API_BASE = 'https://api-data.line.me/v2/bot/message';

/** LINE の動画は最大 200MB だが、Worker 経由の保存は 50MB までに抑える */
export const INCOMING_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

const VIDEO_TYPE_TO_EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/mpeg': 'mpg',
};

const PREVIEW_TYPE_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface FetchAndStoreIncomingVideoOptions {
  r2: R2Bucket;
  fetch?: typeof fetch;
  workerUrl: string;
  channelAccessToken: string;
  accountId: string;
  messageId: string;
  durationMs?: number;
}

export interface IncomingVideoRefs {
  originalContentUrl: string;
  previewImageUrl?: string;
  mimeType: string;
  size: number;
  durationMs?: number;
}

function safeIds(accountId: string, messageId: string): { account: string; message: string } {
  return {
    account: accountId.replace(/[^a-zA-Z0-9-]/g, '_'),
    message: messageId.replace(/[^a-zA-Z0-9-]/g, '_'),
  };
}

async function putFromResponse(
  r2: R2Bucket,
  key: string,
  res: Response,
  contentType: string,
): Promise<number | null> {
  const declared = Number.parseInt(res.headers.get('Content-Length') ?? '', 10);
  if (Number.isFinite(declared) && declared > INCOMING_VIDEO_MAX_BYTES) {
    return null;
  }

  let data: ArrayBuffer;
  try {
    data = await res.arrayBuffer();
  } catch {
    return null;
  }
  if (data.byteLength === 0 || data.byteLength > INCOMING_VIDEO_MAX_BYTES) {
    return null;
  }
  await r2.put(key, data, { httpMetadata: { contentType } });
  return data.byteLength;
}

/**
 * LINE Content API から incoming 動画（とサムネ）を取得し R2 に保存する。
 * 失敗時は null。呼び出し元は `[動画]` ラベルへフォールバックする。
 */
export async function fetchAndStoreIncomingVideo(
  opts: FetchAndStoreIncomingVideoOptions,
): Promise<IncomingVideoRefs | null> {
  const fetcher = opts.fetch ?? fetch;
  const { account, message } = safeIds(opts.accountId, opts.messageId);
  const auth = { Authorization: `Bearer ${opts.channelAccessToken}` };
  const base = opts.workerUrl.replace(/\/$/, '');

  let res: Response;
  try {
    res = await fetcher(`${LINE_CONTENT_API_BASE}/${opts.messageId}/content`, { headers: auth });
  } catch (err) {
    console.error('incoming-video: fetch failed', { err, messageId: opts.messageId, accountId: opts.accountId });
    return null;
  }
  if (!res.ok) {
    console.error('incoming-video: non-200', { status: res.status, messageId: opts.messageId, accountId: opts.accountId });
    return null;
  }

  const contentType = res.headers.get('Content-Type')?.split(';')[0].trim() || 'video/mp4';
  const ext =
    VIDEO_TYPE_TO_EXT[contentType]
    ?? (contentType.startsWith('video/') || contentType === 'application/octet-stream' ? 'mp4' : null);
  if (!ext) {
    console.error('incoming-video: unsupported content-type', { contentType, messageId: opts.messageId, accountId: opts.accountId });
    return null;
  }

  const videoKey = `incoming-${account}-${message}.${ext}`;
  const mimeType = contentType.startsWith('video/') ? contentType : 'video/mp4';
  let size: number | null;
  try {
    size = await putFromResponse(opts.r2, videoKey, res, mimeType);
  } catch (err) {
    console.error('incoming-video: R2 put failed', { err, messageId: opts.messageId, accountId: opts.accountId });
    return null;
  }
  if (size === null) {
    console.error('incoming-video: invalid size', { messageId: opts.messageId, accountId: opts.accountId });
    return null;
  }

  const refs: IncomingVideoRefs = {
    originalContentUrl: `${base}/images/${videoKey}`,
    mimeType,
    size,
  };
  if (typeof opts.durationMs === 'number' && Number.isFinite(opts.durationMs) && opts.durationMs > 0) {
    refs.durationMs = Math.round(opts.durationMs);
  }

  try {
    const previewRes = await fetcher(`${LINE_CONTENT_API_BASE}/${opts.messageId}/content/preview`, { headers: auth });
    if (previewRes.ok) {
      const previewType = previewRes.headers.get('Content-Type')?.split(';')[0].trim() || 'image/jpeg';
      const previewExt = PREVIEW_TYPE_TO_EXT[previewType] ?? 'jpg';
      const previewKey = `incoming-${account}-${message}-preview.${previewExt}`;
      const previewBytes = await previewRes.arrayBuffer();
      if (previewBytes.byteLength > 0 && previewBytes.byteLength <= 5 * 1024 * 1024) {
        await opts.r2.put(previewKey, previewBytes, {
          httpMetadata: { contentType: PREVIEW_TYPE_TO_EXT[previewType] ? previewType : 'image/jpeg' },
        });
        refs.previewImageUrl = `${base}/images/${previewKey}`;
      }
    }
  } catch (err) {
    console.error('incoming-video: preview fetch failed', { err, messageId: opts.messageId, accountId: opts.accountId });
  }

  return refs;
}
