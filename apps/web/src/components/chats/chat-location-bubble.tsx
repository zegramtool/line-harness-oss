'use client'

import { locationPreviewLabel, parseLocationMessageContent } from '@line-crm/shared'

export function ChatLocationBubble({ content }: { content: string }) {
  const loc = parseLocationMessageContent(content)
  if (!loc) {
    return <span>{locationPreviewLabel(content)}</span>
  }

  return (
    <div className="w-[240px] max-w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900">
      <div className="font-medium">📍 {loc.title || '位置情報'}</div>
      {loc.address && (
        <div className="mt-0.5 text-xs text-gray-500 break-words">{loc.address}</div>
      )}
      <a
        href={loc.mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 block rounded-xl border border-gray-200 bg-gray-50 px-2 py-2 text-center text-xs font-semibold text-gray-800"
      >
        地図を開く
      </a>
    </div>
  )
}
