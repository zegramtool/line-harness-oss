'use client'

import { splitChatTextLinks, sanitizeHttpUrl } from '@/lib/chat-text-links'

export function ChatLinkedText({
  text,
  outgoing,
}: {
  text: string
  outgoing?: boolean
}) {
  const parts = splitChatTextLinks(text)
  if (parts.length === 0) return null
  if (parts.length === 1 && parts[0].type === 'text') {
    return <>{text}</>
  }

  const linkClass = outgoing
    ? 'underline text-white break-all'
    : 'underline text-green-800 break-all'

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'text') return <span key={i}>{part.value}</span>
        const href = sanitizeHttpUrl(part.value)
        if (!href) return <span key={i}>{part.value}</span>
        return (
          <a
            key={i}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            {part.value}
          </a>
        )
      })}
    </>
  )
}
