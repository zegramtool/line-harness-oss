import { api } from '@/lib/api'

export type LineImageUrls = {
  originalContentUrl: string
  previewImageUrl: string
}

/** LINE push 1回あたりの画像上限 */
export const MAX_LINE_IMAGES_PER_PUSH = 5

const HEIC_RE = /\.(heic|heif)$/i

/** iOS Safari は file.type が空のことが多い。拡張子から MIME を推定する。 */
export function resolveImageMimeType(file: File): 'image/jpeg' | 'image/png' | null {
  const type = file.type?.toLowerCase() ?? ''
  if (type === 'image/jpeg' || type === 'image/jpg') return 'image/jpeg'
  if (type === 'image/png') return 'image/png'
  if (type === 'image/heic' || type === 'image/heif') return null

  const name = file.name.toLowerCase()
  if (HEIC_RE.test(name)) return null
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  if (name.endsWith('.png')) return 'image/png'
  return null
}

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('画像の読み込みに失敗しました'))
      img.src = url
    })
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** LINE preview 用（最大 1MB）に JPEG を生成 */
async function buildLinePreviewBlob(file: File, maxBytes = 1024 * 1024): Promise<Blob> {
  const img = await loadImageFromFile(file)
  const maxDim = 1024
  let w = img.naturalWidth
  let h = img.naturalHeight
  const scale = Math.min(1, maxDim / Math.max(w, h))
  w = Math.max(1, Math.round(w * scale))
  h = Math.max(1, Math.round(h * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('画像の変換に失敗しました')
  ctx.drawImage(img, 0, 0, w, h)

  let quality = 0.85
  let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  while (blob && blob.size > maxBytes && quality > 0.35) {
    quality -= 0.1
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  }
  if (!blob || blob.size > maxBytes) {
    throw new Error('プレビュー画像を 1MB 以下に圧縮できませんでした')
  }
  return blob
}

/**
 * LINE 画像メッセージ用に original / preview を R2 へアップロードする。
 * preview は LINE 制限（1MB）に合わせて必要なら canvas で縮小する。
 */
export async function uploadLineImage(file: File): Promise<LineImageUrls> {
  const mime = resolveImageMimeType(file)
  if (!mime) {
    throw new Error('JPEG または PNG を選んでください（iPhone の HEIC は「設定→カメラ→フォーマット→互換性優先」で JPEG にできます）')
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('画像は 10MB 以下にしてください')
  }

  const originalRes = await api.uploads.image(file, mime)
  if (!originalRes.success) {
    throw new Error(originalRes.error ?? '画像のアップロードに失敗しました')
  }

  let previewImageUrl = originalRes.data.url
  if (file.size > 1024 * 1024 || mime === 'image/png') {
    const previewBlob = await buildLinePreviewBlob(file)
    const previewFile = new File([previewBlob], 'preview.jpg', { type: 'image/jpeg' })
    const previewRes = await api.uploads.image(previewFile, 'image/jpeg')
    if (!previewRes.success) {
      throw new Error(previewRes.error ?? 'プレビュー画像のアップロードに失敗しました')
    }
    previewImageUrl = previewRes.data.url
  }

  return {
    originalContentUrl: originalRes.data.url,
    previewImageUrl,
  }
}

/** 複数ファイルを順にアップロード（上限は呼び出し元で slice すること） */
export async function uploadLineImages(files: File[]): Promise<LineImageUrls[]> {
  const results: LineImageUrls[] = []
  for (const file of files) {
    results.push(await uploadLineImage(file))
  }
  return results
}
