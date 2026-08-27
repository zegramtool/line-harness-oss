'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import {
  chatFileDownloadHref,
  formatChatFileSize,
  isChatPdfFile,
  parseChatFileContent,
  type ChatFileContent,
} from '@/lib/chat-file-content'

function FileIcon() {
  return (
    <svg className="h-8 w-8 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M7 3h6l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M13 3v5h5" />
    </svg>
  )
}

function ChatPdfLightbox({
  file,
  onClose,
}: {
  file: ChatFileContent
  onClose: () => void
}) {
  const titleId = useId()
  const previewSrc = file.fileUrl || file.url
  const openHref = file.url || file.fileUrl
  const downloadHref = chatFileDownloadHref(file)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-black/80"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <h2 id={titleId} className="min-w-0 truncate text-sm font-medium">{file.fileName}</h2>
        <div className="flex shrink-0 items-center gap-2">
          {openHref && (
            <a
              href={openHref}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl bg-white/15 px-3 py-2 text-xs font-medium"
            >
              別タブ
            </a>
          )}
          {downloadHref && (
            <a
              href={downloadHref}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl bg-[#ABC003] px-3 py-2 text-xs font-semibold text-black"
            >
              保存
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-white/15 px-3 py-2 text-xs"
          >
            閉じる
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 px-3 pb-3" onClick={(e) => e.stopPropagation()}>
        {previewSrc ? (
          <iframe
            title={file.fileName}
            src={previewSrc}
            className="h-full w-full rounded-xl bg-white"
          />
        ) : (
          <p className="p-6 text-center text-sm text-white/80">プレビューできません</p>
        )}
      </div>
    </div>
  )
}

export function ChatPdfBubble({ content }: { content: string }) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const openPreview = useCallback(() => setPreviewOpen(true), [])
  const closePreview = useCallback(() => setPreviewOpen(false), [])

  const file = parseChatFileContent(content)
  if (!file) {
    return (
      <div className="max-w-[260px] rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900">
        📎 PDF
      </div>
    )
  }

  const openHref = file.url || file.fileUrl
  const downloadHref = chatFileDownloadHref(file)
  const pdf = isChatPdfFile(file)
  const sizeLabel = file.size ? formatChatFileSize(file.size) : ''
  const btn = 'border-gray-200 bg-gray-50 text-gray-800'

  if (!openHref) {
    return (
      <div className="max-w-[260px] rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900">
        <div className="font-medium">📎 {file.fileName}</div>
        <div className="mt-1 text-xs text-gray-500">このファイルは受信時に保存できていません</div>
      </div>
    )
  }

  return (
    <>
      <div className="w-[240px] max-w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900">
        <div className="flex items-start gap-2">
          <FileIcon />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{file.fileName}</div>
            <div className="text-xs text-gray-500">
              {[pdf ? 'PDF' : 'ファイル', sizeLabel, file.expiresAtLabel ? `期限 ${file.expiresAtLabel}` : '']
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
        </div>
        <div className="mt-2 flex gap-2">
          {pdf ? (
            <button
              type="button"
              onClick={openPreview}
              className={`flex-1 rounded-xl border px-2 py-2 text-xs font-semibold ${btn}`}
            >
              プレビュー
            </button>
          ) : (
            <a
              href={openHref}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex-1 rounded-xl border px-2 py-2 text-center text-xs font-semibold ${btn}`}
            >
              開く
            </a>
          )}
          {downloadHref && (
            <a
              href={downloadHref}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex-1 rounded-xl border px-2 py-2 text-center text-xs font-semibold ${btn}`}
            >
              保存
            </a>
          )}
        </div>
      </div>
      {previewOpen && pdf && (
        <ChatPdfLightbox file={file} onClose={closePreview} />
      )}
    </>
  )
}
