'use client'

import { useCallback, useEffect, useRef, useState, type Touch } from 'react'

export type ChatImageItem = {
  original: string
  preview: string
}

export function parseChatImageItems(content: string): ChatImageItem[] {
  try {
    const parsed = JSON.parse(content) as unknown
    const list = Array.isArray(parsed) ? parsed : [parsed]
    return list
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const rec = item as { originalContentUrl?: string; previewImageUrl?: string }
        const original = rec.originalContentUrl || rec.previewImageUrl
        if (!original) return null
        return { original, preview: rec.previewImageUrl || original }
      })
      .filter((item): item is ChatImageItem => item !== null)
  } catch {
    return []
  }
}

export function collectChatImageUrls(messages: Array<{ messageType: string; content: string }>): string[] {
  const urls: string[] = []
  for (const msg of messages) {
    if (msg.messageType !== 'image') continue
    for (const item of parseChatImageItems(msg.content)) {
      if (!urls.includes(item.original)) urls.push(item.original)
    }
  }
  return urls
}

function filenameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname
    const name = decodeURIComponent(path.split('/').pop() || '')
    if (name && /\.(jpe?g|png|gif|webp)$/i.test(name)) return name
  } catch {
    // ignore
  }
  return `line-image-${Date.now()}.jpg`
}

function downloadUrlFor(url: string): string {
  try {
    const u = new URL(url)
    u.searchParams.set('download', '1')
    return u.toString()
  } catch {
    return url.includes('?') ? `${url}&download=1` : `${url}?download=1`
  }
}

export async function downloadChatImage(url: string): Promise<void> {
  const href = downloadUrlFor(url)
  try {
    const res = await fetch(href)
    if (!res.ok) throw new Error(`download failed: ${res.status}`)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filenameFromUrl(url)
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(objectUrl)
  } catch {
    window.open(href, '_blank', 'noopener,noreferrer')
  }
}

export function ChatImageThumbs({
  content,
  gallery,
  onOpen,
}: {
  content: string
  gallery: string[]
  onOpen: (index: number) => void
}) {
  const items = parseChatImageItems(content)
  if (items.length === 0) return <span>🖼️ [画像]</span>

  return (
    <div className={`grid gap-1 ${items.length > 1 ? 'grid-cols-2 max-w-[240px]' : ''}`}>
      {items.map((item, i) => {
        const galleryIndex = Math.max(0, gallery.indexOf(item.original))
        return (
          <button
            key={`${item.original}-${i}`}
            type="button"
            onClick={() => onOpen(galleryIndex)}
            className="block overflow-hidden rounded-xl bg-black/10 text-left"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.preview}
              alt="トーク内の画像"
              className={`block object-cover ${items.length > 1 ? 'h-28 w-28' : 'max-h-64 max-w-[220px]'}`}
            />
          </button>
        )
      })}
    </div>
  )
}

function touchDistance(a: Touch, b: Touch): number {
  const dx = a.clientX - b.clientX
  const dy = a.clientY - b.clientY
  return Math.hypot(dx, dy)
}

function ZoomablePreview({
  src,
  onUnzoomedBackdropClick,
}: {
  src: string
  onUnzoomedBackdropClick: () => void
}) {
  const [scale, setScale] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null)
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const movedRef = useRef(false)

  const reset = useCallback(() => {
    setScale(1)
    setPos({ x: 0, y: 0 })
  }, [])

  useEffect(() => {
    reset()
  }, [src, reset])

  const zoomed = scale > 1.02

  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      style={{ touchAction: zoomed ? 'none' : 'manipulation' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          if (zoomed) reset()
          else onUnzoomedBackdropClick()
        }
      }}
      onTouchStart={(e) => {
        movedRef.current = false
        if (e.touches.length === 2) {
          pinchRef.current = { dist: touchDistance(e.touches[0], e.touches[1]), scale }
          dragRef.current = null
          return
        }
        if (e.touches.length === 1 && zoomed) {
          dragRef.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
            px: pos.x,
            py: pos.y,
          }
        }
      }}
      onTouchMove={(e) => {
        if (e.touches.length === 2 && pinchRef.current) {
          movedRef.current = true
          const dist = touchDistance(e.touches[0], e.touches[1])
          const next = Math.min(4, Math.max(1, pinchRef.current.scale * (dist / Math.max(pinchRef.current.dist, 1))))
          setScale(next)
          if (next <= 1.02) setPos({ x: 0, y: 0 })
          return
        }
        if (e.touches.length === 1 && dragRef.current && zoomed) {
          const dx = e.touches[0].clientX - dragRef.current.x
          const dy = e.touches[0].clientY - dragRef.current.y
          if (Math.abs(dx) + Math.abs(dy) > 6) movedRef.current = true
          setPos({ x: dragRef.current.px + dx, y: dragRef.current.py + dy })
        }
      }}
      onTouchEnd={() => {
        pinchRef.current = null
        dragRef.current = null
        if (scale <= 1.05) reset()
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="max-h-full max-w-full origin-center object-contain transition-transform duration-150 ease-out"
        style={{
          transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
          cursor: zoomed ? 'zoom-out' : 'zoom-in',
        }}
        onClick={(e) => {
          e.stopPropagation()
          if (movedRef.current) return
          if (zoomed) reset()
          else setScale(2.4)
        }}
      />
      <p className="pointer-events-none absolute bottom-2 left-0 right-0 text-center text-[11px] text-white/55">
        {zoomed ? 'タップで戻す · ドラッグで移動' : 'タップで拡大 · ピンチでも拡大'}
      </p>
    </div>
  )
}

export function ChatImageLightbox({
  urls,
  index,
  onClose,
  onIndexChange,
}: {
  urls: string[]
  index: number
  onClose: () => void
  onIndexChange: (next: number) => void
}) {
  const [busy, setBusy] = useState(false)
  const current = urls[index] ?? urls[0]
  const hasMany = urls.length > 1

  const go = useCallback(
    (delta: number) => {
      if (urls.length === 0) return
      const next = (index + delta + urls.length) % urls.length
      onIndexChange(next)
    },
    [index, onIndexChange, urls.length],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [go, onClose])

  if (!current) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-black/92"
      role="dialog"
      aria-modal="true"
      aria-label="画像プレビュー"
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-2 px-3 pt-[max(12px,env(safe-area-inset-top))] pb-2">
        <p className="text-sm text-white/80 tabular-nums">
          {hasMany ? `${index + 1} / ${urls.length}` : 'プレビュー'}
        </p>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await downloadChatImage(current)
              } finally {
                setBusy(false)
              }
            }}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-50"
          >
            <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
            </svg>
            {busy ? '保存中...' : '保存'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20"
            aria-label="閉じる"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div
        className="relative min-h-0 flex-1 px-1 pb-[max(8px,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        {hasMany && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              go(-1)
            }}
            className="absolute left-2 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label="前の画像"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <ZoomablePreview src={current} onUnzoomedBackdropClick={onClose} />
        {hasMany && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              go(1)
            }}
            className="absolute right-2 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label="次の画像"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
