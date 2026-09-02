'use client'

import { chatVideoDownloadHref, parseChatVideoContent } from '@/lib/chat-video-content'

export function ChatVideoBubble({ content }: { content: string }) {
  const video = parseChatVideoContent(content)
  if (!video) {
    return (
      <div className="max-w-[260px] rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900">
        🎥 動画
        <div className="mt-1 text-xs text-gray-500">この動画は受信時に保存できていません</div>
      </div>
    )
  }

  const downloadHref = chatVideoDownloadHref(video.originalContentUrl)

  return (
    <div className="w-[240px] max-w-full overflow-hidden rounded-2xl bg-black">
      <video
        className="block max-h-64 w-full"
        src={video.originalContentUrl}
        poster={video.previewImageUrl}
        controls
        playsInline
        preload="metadata"
      >
        このブラウザでは動画を再生できません
      </video>
      <a
        href={downloadHref}
        target="_blank"
        rel="noopener noreferrer"
        className="block bg-black/80 px-3 py-2 text-center text-xs font-semibold text-white"
      >
        保存
      </a>
    </div>
  )
}
