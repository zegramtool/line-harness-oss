'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { parseStickerMessageContent, stickerFallback } from '@line-crm/shared'
import { api, fetchApi, type ScheduledChatMessage } from '@/lib/api'
import { useAccount } from '@/contexts/account-context'
import Header from '@/components/layout/header'
import CcPromptButton from '@/components/cc-prompt-button'
import FlexPreviewComponent from '@/components/flex-preview'
import FriendInfoSidebar from '@/components/chats/friend-info-sidebar'
import ChatCustomerPanel from '@/components/chats/chat-customer-panel'
import {
  uploadLineImage,
  type LineImageUrls,
  MAX_LINE_IMAGES_PER_PUSH,
} from '@/lib/line-image-upload'

interface Chat {
  id: string
  friendId: string
  friendName: string
  friendPictureUrl: string | null
  operatorId: string | null
  status: 'unread' | 'in_progress' | 'resolved'
  notes: string | null
  lastMessageAt: string | null
  lastMessageContent: string | null
  lastMessageDirection: 'incoming' | 'outgoing' | null
  lastMessageType: string | null
  createdAt: string
  updatedAt: string
}

interface ChatMessage {
  id: string
  direction: 'incoming' | 'outgoing'
  messageType: string
  content: string
  createdAt: string
}

interface ChatDetail extends Chat {
  friendName: string
  friendPictureUrl: string | null
  messages?: ChatMessage[]
}

interface PendingPdf {
  url: string
  fileName: string
  size: number
  expiresAt: string
  expiresAtLabel: string
}

function formatPdfSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** iOS など file.type が空になることがあるため拡張子も見る */
function isPdfFile(file: File): boolean {
  if (file.type === 'application/pdf') return true
  return file.name.toLowerCase().endsWith('.pdf')
}

function PdfMessageBubble({ content, outgoing }: { content: string; outgoing?: boolean }) {
  try {
    const parsed = JSON.parse(content) as { url?: string; fileName?: string }
    const label = parsed.fileName ?? 'PDF'
    const href = parsed.url
    if (!href) return <span>📎 {label}</span>
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={outgoing ? 'underline text-white' : 'text-green-700 underline'}
      >
        📎 {label}
      </a>
    )
  } catch {
    return <span>📎 PDF</span>
  }
}

type StatusFilter = 'all' | 'unread' | 'in_progress' | 'resolved'

const statusConfig: Record<Chat['status'], { label: string; className: string }> = {
  unread: { label: '未読', className: 'bg-red-100 text-red-700' },
  in_progress: { label: '対応中', className: 'bg-yellow-100 text-yellow-700' },
  resolved: { label: '解決済', className: 'bg-green-100 text-green-700' },
}

const statusFilters: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '全て' },
  { key: 'unread', label: '未読' },
  { key: 'in_progress', label: '対応中' },
  { key: 'resolved', label: '解決済' },
]

const SHOW_LOADING_PREF_KEY = 'lh_chat_show_loading_indicator'
const LOADING_SECONDS_PREF_KEY = 'lh_chat_loading_seconds'
const LOADING_REFRESH_INTERVAL_MS = 4000

function defaultScheduledLocalValue(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(8, 0, 0, 0)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** ISO（JST含む）を datetime-local 用の値へ（Asia/Tokyo） */
function toScheduledLocalValue(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return defaultScheduledLocalValue()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

function formatScheduledAtLabel(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return iso
  return d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
}

function scheduledPreviewContent(msg: ScheduledChatMessage): string {
  if (msg.messageType === 'text') return msg.messageContent
  if (msg.messageType === 'file') {
    try {
      const p = JSON.parse(msg.messageContent) as { fileName?: string }
      return `📎 ${p.fileName ?? 'PDF'}`
    } catch { return '📎 PDF' }
  }
  if (msg.messageType === 'image') {
    try {
      const p = JSON.parse(msg.messageContent) as unknown
      if (Array.isArray(p)) return `[画像 ${p.length}枚]`
    } catch { /* single image */ }
    return '[画像]'
  }
  return `[${msg.messageType}]`
}

function parseScheduledImages(content: string): LineImageUrls[] {
  try {
    const parsed = JSON.parse(content) as unknown
    const list = Array.isArray(parsed) ? parsed : [parsed]
    return list
      .filter((item): item is LineImageUrls => {
        if (!item || typeof item !== 'object') return false
        const row = item as Partial<LineImageUrls>
        return Boolean(row.originalContentUrl && row.previewImageUrl)
      })
      .slice(0, MAX_LINE_IMAGES_PER_PUSH)
  } catch {
    return []
  }
}

function parseScheduledPdf(content: string): PendingPdf | null {
  try {
    const p = JSON.parse(content) as {
      url?: string
      fileName?: string
      size?: number
      fileSize?: number
      expiresAt?: string
      expiresAtLabel?: string
    }
    if (!p.url) return null
    const size = typeof p.size === 'number'
      ? p.size
      : typeof p.fileSize === 'number'
        ? p.fileSize
        : 0
    return {
      url: p.url,
      fileName: p.fileName ?? 'document.pdf',
      size,
      expiresAt: p.expiresAt ?? '',
      expiresAtLabel: p.expiresAtLabel ?? '',
    }
  } catch {
    return null
  }
}

function ChatPendingImages({
  images,
  uploading,
  onRemove,
  onAddClick,
}: {
  images: LineImageUrls[]
  uploading: boolean
  onRemove: (index: number) => void
  onAddClick: () => void
}) {
  if (images.length === 0 && !uploading) return null

  return (
    <div className="mb-2 px-1">
      {uploading && (
        <div className="mb-2 text-xs text-gray-600">画像をアップロード中...</div>
      )}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-1">
          {images.map((img, index) => (
            <div key={`${img.originalContentUrl}-${index}`} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.previewImageUrl}
                alt=""
                className="h-14 w-14 rounded-lg object-cover border border-gray-200"
              />
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-gray-800 text-white text-xs leading-none"
                aria-label="画像を削除"
              >
                ×
              </button>
            </div>
          ))}
          {images.length < MAX_LINE_IMAGES_PER_PUSH && !uploading && (
            <button
              type="button"
              onClick={onAddClick}
              className="h-14 w-14 rounded-lg border border-dashed border-gray-300 text-gray-500 text-xl"
              aria-label="画像を追加"
            >
              +
            </button>
          )}
        </div>
      )}
      <p className="text-[10px] text-gray-500">
        {images.length}/{MAX_LINE_IMAGES_PER_PUSH}枚 · 最大{MAX_LINE_IMAGES_PER_PUSH}枚まで1回で送信
      </p>
    </div>
  )
}

function StickerMessageImage({ content }: { content: string }) {
  const [failed, setFailed] = useState(false)
  const sticker = parseStickerMessageContent(content)
  const fallback = stickerFallback(content)

  if (!sticker || failed) return <span>{fallback}</span>

  return (
    <img
      src={sticker.stickerUrl}
      alt={fallback}
      className="max-h-[140px] max-w-[140px] object-contain"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

function formatDatetime(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function sameYmd(aIso: string, bIso: string): boolean {
  const a = new Date(aIso)
  const b = new Date(bIso)
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function formatYmdSlash(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

const ccPrompts = [
  {
    title: 'チャット対応テンプレート',
    prompt: `チャット対応で使えるテンプレートメッセージを作成してください。
1. よくある質問への回答テンプレート（挨拶、FAQ、サポート）
2. クレーム対応用の丁寧な返信テンプレート
3. フォローアップメッセージのテンプレート
手順を示してください。`,
  },
  {
    title: '未対応チャット確認',
    prompt: `未対応のチャットを確認し、対応優先度を整理してください。
1. 未読・対応中のチャット数を集計
2. 最終メッセージからの経過時間で優先度を判定
3. 長時間未対応のチャットへの対応アクションを提案
結果をレポートしてください。`,
  },
]

interface FriendItem {
  id: string
  displayName: string
  pictureUrl: string | null
  isFollowing: boolean
}

interface MessageLog {
  id: string
  direction: 'incoming' | 'outgoing'
  messageType: string
  content: string
  createdAt: string
}

function DirectMessagePanel({ friendId, friend, onBack, onSent }: {
  friendId: string
  friend: FriendItem | null
  onBack: () => void
  onSent: () => void
}) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [messages, setMessages] = useState<MessageLog[]>([])
  const [loadingMessages, setLoadingMessages] = useState(true)
  const isComposingRef = useRef(false)
  const sendLockRef = useRef(false)

  useEffect(() => {
    const loadMessages = async () => {
      setLoadingMessages(true)
      try {
        const res = await fetchApi<{ success: boolean; data: MessageLog[] }>(
          `/api/friends/${friendId}/messages`
        )
        if (res.success) setMessages(res.data)
      } catch { /* silent */ }
      setLoadingMessages(false)
    }
    loadMessages()
  }, [friendId])

  const handleSend = async () => {
    if (!message.trim() || sending || sendLockRef.current) return
    sendLockRef.current = true
    setSending(true)
    try {
      await fetchApi(`/api/friends/${friendId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: message, messageType: 'text' }),
      })
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        direction: 'outgoing',
        messageType: 'text',
        content: message,
        createdAt: new Date().toISOString(),
      }])
      setMessage('')
    } catch { /* silent */ }
    setSending(false)
    sendLockRef.current = false
  }

  function renderContent(msg: MessageLog) {
    if (msg.messageType === 'text') return msg.content
    if (msg.messageType === 'flex') {
      try {
        const parsed = JSON.parse(msg.content)
        // Extract ALL text from flex (up to 200 chars)
        const texts: string[] = []
        const collectText = (obj: Record<string, unknown>) => {
          if (texts.join(' ').length > 200) return
          if (obj.type === 'text' && typeof obj.text === 'string') {
            const t = (obj.text as string).trim()
            if (t && !t.startsWith('{{')) texts.push(t)
          }
          for (const key of ['header', 'body', 'footer']) {
            if (obj[key]) collectText(obj[key] as Record<string, unknown>)
          }
          if (Array.isArray(obj.contents)) {
            for (const c of obj.contents) collectText(c as Record<string, unknown>)
          }
        }
        collectText(parsed)
        return texts.slice(0, 4).join('\n') || '[Flex Message]'
      } catch { return '[Flex Message]' }
    }
    if (msg.messageType === 'sticker') {
      return <StickerMessageImage content={msg.content} />
    }
    return `[${msg.messageType}]`
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 py-2 lg:px-4 lg:py-4 border-b border-gray-200 flex items-center gap-2 bg-white shrink-0 pt-[max(8px,env(safe-area-inset-top))] lg:pt-4">
        <button onClick={onBack} className="lg:hidden min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-700">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        {friend?.pictureUrl ? (
          <img src={friend.pictureUrl} alt="" className="w-8 h-8 rounded-full" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
            <span className="text-gray-500 text-xs">{(friend?.displayName || '?').charAt(0)}</span>
          </div>
        )}
        <div>
          <p className="text-sm font-bold text-gray-900">{friend?.displayName || '不明'}</p>
          <p className="text-xs text-gray-400">メッセージ履歴</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loadingMessages ? (
          <p className="text-center text-gray-400 text-sm">読み込み中...</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-gray-400 text-sm">メッセージ履歴がありません</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                msg.direction === 'outgoing'
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-100 text-gray-900'
              }`}>
                <div className="text-sm whitespace-pre-wrap break-words">{renderContent(msg)}</div>
                <p className={`text-xs mt-1 ${msg.direction === 'outgoing' ? 'text-green-200' : 'text-gray-400'}`}>
                  {new Date(msg.createdAt).toLocaleString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="lg:hidden border-t border-gray-200 bg-[#efefef] px-2 pt-2 pb-[max(10px,env(safe-area-inset-bottom))] shrink-0">
        <div className="flex items-end gap-1.5">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onCompositionStart={() => { isComposingRef.current = true }}
            onCompositionEnd={() => { isComposingRef.current = false }}
            placeholder="メッセージ"
            enterKeyHint="send"
            className="flex-1 text-base border-0 rounded-3xl px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/40 min-h-[44px]"
          />
          <button
            onClick={handleSend}
            disabled={!message.trim() || sending}
            className="min-w-[44px] min-h-[44px] rounded-full text-white flex items-center justify-center shrink-0 disabled:opacity-40"
            style={{ backgroundColor: '#06C755' }}
            aria-label="送信"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
      <div className="hidden lg:block px-4 py-3 border-t border-gray-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onCompositionStart={() => { isComposingRef.current = true }}
            onCompositionEnd={() => { isComposingRef.current = false }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || isComposingRef.current || e.keyCode === 229) return
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="メッセージを入力..."
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          <button
            onClick={handleSend}
            disabled={!message.trim() || sending}
            className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: '#06C755' }}
          >
            {sending ? '...' : '送信'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ChatsPage() {
  const { selectedAccountId } = useAccount()
  const [chats, setChats] = useState<Chat[]>([])
  const [allFriends, setAllFriends] = useState<FriendItem[]>([])
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null)
  const [chatDetail, setChatDetail] = useState<ChatDetail | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const statusFilterRef = useRef<StatusFilter>('all')
  const unansweredOnlyRef = useRef(false)
  const [unansweredOnly, setUnansweredOnly] = useState(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('unanswered') === '1'
  })

  // unansweredOnly 変更時に URL を書き戻す
  useEffect(() => {
    if (typeof window === 'undefined') return
    const urlParams = new URLSearchParams(window.location.search)
    if (unansweredOnly) urlParams.set('unanswered', '1')
    else urlParams.delete('unanswered')
    const qs = urlParams.toString()
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    window.history.replaceState(null, '', url)
  }, [unansweredOnly])
  // Send mode: 'enter' = Enter sends, Shift+Enter = newline; 'shift-enter' = reverse
  const [sendMode, setSendMode] = useState<'enter' | 'shift-enter'>('enter')
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [messageContent, setMessageContent] = useState('')
  const [pendingImages, setPendingImages] = useState<LineImageUrls[]>([])
  const [imageUploading, setImageUploading] = useState(false)
  const [pendingPdf, setPendingPdf] = useState<PendingPdf | null>(null)
  const [pdfUploading, setPdfUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const sendLockRef = useRef(false)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [showLoadingIndicator, setShowLoadingIndicator] = useState(false)
  const [loadingSeconds, setLoadingSeconds] = useState(5)
  const lastLoadingTriggerAtRef = useRef<Record<string, number>>({})
  const [isMessageInputFocused, setIsMessageInputFocused] = useState(false)
  const isComposingRef = useRef(false)
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mobileTextareaRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [sendTiming, setSendTiming] = useState<'now' | 'scheduled'>('now')
  const [scheduledAtLocal, setScheduledAtLocal] = useState(defaultScheduledLocalValue)
  const [pendingScheduled, setPendingScheduled] = useState<ScheduledChatMessage[]>([])
  const [cancellingScheduledId, setCancellingScheduledId] = useState<string | null>(null)
  const [editingScheduledId, setEditingScheduledId] = useState<string | null>(null)

  const loadPendingScheduled = useCallback(async (chatId: string) => {
    try {
      const res = await api.chats.listScheduled(chatId)
      if (res.success) setPendingScheduled(res.data)
    } catch {
      setPendingScheduled([])
    }
  }, [])

  useEffect(() => {
    try {
      const rawEnabled = localStorage.getItem(SHOW_LOADING_PREF_KEY)
      const rawSeconds = localStorage.getItem(LOADING_SECONDS_PREF_KEY)
      if (rawEnabled !== null) setShowLoadingIndicator(rawEnabled === '1')
      if (rawSeconds) {
        const n = Number.parseInt(rawSeconds, 10)
        if (Number.isFinite(n) && n >= 5 && n <= 60) setLoadingSeconds(n)
      }
    } catch {
      // localStorage unavailable
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(SHOW_LOADING_PREF_KEY, showLoadingIndicator ? '1' : '0')
      localStorage.setItem(LOADING_SECONDS_PREF_KEY, String(loadingSeconds))
    } catch {
      // localStorage unavailable
    }
  }, [showLoadingIndicator, loadingSeconds])

  const loadChats = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: { status?: string; accountId?: string; unansweredOnly?: boolean } = {}
      if (statusFilter !== 'all' && !unansweredOnly) params.status = statusFilter
      if (selectedAccountId) params.accountId = selectedAccountId
      if (unansweredOnly) params.unansweredOnly = true
      const chatRes = await api.chats.list(params)
      if (chatRes.success) {
        setChats(chatRes.data as unknown as Chat[])
      }
    } catch {
      setError('チャットの読み込みに失敗しました。もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, selectedAccountId, unansweredOnly])

  // Friends list (for the "new direct message" modal) — loaded lazily in the background
  // Previously fetched 800 friends in parallel with chats, which blocked the initial render.
  const loadAllFriends = useCallback(async () => {
    try {
      const friendRes = await api.friends.list({ accountId: selectedAccountId || undefined, limit: '800' })
      if (friendRes.success) {
        setAllFriends((friendRes.data as unknown as { items: FriendItem[] }).items)
      }
    } catch { /* silent */ }
  }, [selectedAccountId])

  useEffect(() => { void loadAllFriends() }, [loadAllFriends])

  // Keep refs in sync so setChats updater can read the latest filter without stale closure
  useEffect(() => { statusFilterRef.current = statusFilter }, [statusFilter])
  useEffect(() => { unansweredOnlyRef.current = unansweredOnly }, [unansweredOnly])

  // Load/save sendMode preference (guarded — privacy-restricted browsers throw)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('chat.sendMode')
      if (saved === 'enter' || saved === 'shift-enter') setSendMode(saved)
    } catch { /* localStorage unavailable */ }
  }, [])
  useEffect(() => {
    try { localStorage.setItem('chat.sendMode', sendMode) } catch { /* ignore */ }
  }, [sendMode])

  const loadChatDetail = useCallback(async (chatId: string) => {
    setDetailLoading(true)
    setError('')
    try {
      const res = await api.chats.get(chatId)
      if (res.success) {
        setChatDetail(res.data as unknown as ChatDetail)
        setNotes((res.data as unknown as ChatDetail).notes || '')
      } else {
        // API は 200 で success:false を返す可能性 (例: 404 lookup)。詳細を画面に出す。
        const errMsg = (res as { error?: string }).error ?? '不明なエラー'
        setError(`チャット詳細の読み込みに失敗しました: ${errMsg}`)
      }
    } catch (err) {
      // ネットワーク / parse / auth fail などの例外。empty catch だと原因不明だったので詳細を出す。
      const msg = err instanceof Error ? err.message : String(err)
      setError(`チャット詳細の読み込みに失敗しました: ${msg}`)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    loadChats()
  }, [loadChats])

  // Deep-link from other pages (e.g. /form-submissions): ?friend=<friendId>
  // chat list returns id = friend_id, so selectedChatId === friendId is correct.
  // If no chat exists yet, loadChatDetail will fail and the user can fall back to
  // the friend list — acceptable for now.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const friendId = params.get('friend')
    if (friendId) setSelectedChatId(friendId)
  }, [])

  useEffect(() => {
    if (selectedChatId) {
      loadChatDetail(selectedChatId)
      void loadPendingScheduled(selectedChatId)
    } else {
      setChatDetail(null)
      setPendingScheduled([])
    }
  }, [selectedChatId, loadChatDetail, loadPendingScheduled])

  // Surface deep-linked chats in the sidebar even when the current account
  // filter or status filter would exclude them — otherwise the user replies
  // and the conversation stays invisible until they refresh.
  // Re-runs when `chats` changes (e.g. after loadChats refetches on filter
  // change) so the synthetic entry is re-injected if the next API result
  // does not include it. Returning `prev` unchanged when already present
  // avoids any update loop.
  useEffect(() => {
    if (!chatDetail) return
    setChats((prev) => {
      if (prev.some((c) => c.id === chatDetail.id)) return prev
      // /api/chats/:id may not populate the lastMessage* fields; derive
      // from the messages array as a fallback so the sidebar preview is
      // not stuck on "(まだメッセージなし)".
      const lastMsg = chatDetail.messages?.[chatDetail.messages.length - 1]
      const entry: Chat = {
        id: chatDetail.id,
        friendId: chatDetail.friendId,
        friendName: chatDetail.friendName,
        friendPictureUrl: chatDetail.friendPictureUrl,
        operatorId: chatDetail.operatorId ?? null,
        status: chatDetail.status,
        notes: chatDetail.notes ?? null,
        lastMessageAt: chatDetail.lastMessageAt ?? lastMsg?.createdAt ?? null,
        lastMessageContent: chatDetail.lastMessageContent ?? lastMsg?.content ?? null,
        lastMessageDirection: chatDetail.lastMessageDirection ?? lastMsg?.direction ?? null,
        lastMessageType: chatDetail.lastMessageType ?? lastMsg?.messageType ?? null,
        createdAt: chatDetail.createdAt,
        updatedAt: chatDetail.updatedAt,
      }
      return [entry, ...prev]
    })
  }, [chatDetail, chats])

  // 詳細が新しくロードされたら最下部（＝最新メッセージ）までスクロールする。
  // そこから上にスクロールすれば過去のメッセージを辿れる（LINE受信画面と同じUX）。
  // ユーザーが手動でスクロールしたら delayed auto-scroll は発動させない。
  useEffect(() => {
    if (!chatDetail?.messages || chatDetail.messages.length === 0) return
    const el = messagesScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    let userScrolled = false
    const onScroll = () => {
      if (!messagesScrollRef.current) return
      const current = messagesScrollRef.current
      // 下端から一定以上離れたらユーザー操作とみなす
      if (current.scrollHeight - current.scrollTop - current.clientHeight > 20) {
        userScrolled = true
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    // 画像/Flex の表示後に高さが増える場合に追従するフォロワー（ユーザーがスクロール済みなら発動させない）
    const id = window.setTimeout(() => {
      if (userScrolled || !messagesScrollRef.current) return
      messagesScrollRef.current.scrollTop = messagesScrollRef.current.scrollHeight
    }, 150)
    return () => {
      window.clearTimeout(id)
      el.removeEventListener('scroll', onScroll)
    }
  }, [chatDetail?.id, chatDetail?.messages?.length])

  // Auto-resize textarea as messageContent grows
  useEffect(() => {
    for (const el of [textareaRef.current, mobileTextareaRef.current]) {
      if (!el) continue
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, el === mobileTextareaRef.current ? 128 : 200)}px`
    }
  }, [messageContent])

  const clearComposerDraft = useCallback(() => {
    setMessageContent('')
    setPendingImages([])
    setPendingPdf(null)
  }, [])

  const clearScheduledEdit = useCallback(() => {
    setEditingScheduledId(null)
    clearComposerDraft()
    setSendTiming('now')
  }, [clearComposerDraft])

  const handleSelectChat = (chatId: string) => {
    setSelectedChatId(chatId)
    clearScheduledEdit()
  }

  const handleStartEditScheduled = (item: ScheduledChatMessage) => {
    setError('')
    setEditingScheduledId(item.id)
    setSendTiming('scheduled')
    setScheduledAtLocal(toScheduledLocalValue(item.scheduledAt))
    setMessageContent('')
    setPendingImages([])
    setPendingPdf(null)

    if (item.messageType === 'text') {
      setMessageContent(item.messageContent)
      return
    }
    if (item.messageType === 'image') {
      const images = parseScheduledImages(item.messageContent)
      if (images.length === 0) {
        setError('予約画像の読み込みに失敗しました。日時のみ変更するか、画像を選び直してください。')
        return
      }
      setPendingImages(images)
      return
    }
    if (item.messageType === 'file') {
      const pdf = parseScheduledPdf(item.messageContent)
      if (!pdf) {
        setError('予約PDFの読み込みに失敗しました。日時のみ変更するか、PDFを選び直してください。')
        return
      }
      setPendingPdf(pdf)
    }
  }

  const triggerLoadingAnimation = useCallback(async (chatId: string) => {
    if (!showLoadingIndicator) return

    const now = Date.now()
    const last = lastLoadingTriggerAtRef.current[chatId] ?? 0
    if (now - last < LOADING_REFRESH_INTERVAL_MS) return
    lastLoadingTriggerAtRef.current[chatId] = now

    try {
      await fetchApi<{ success: boolean }>(`/api/chats/${chatId}/loading`, {
        method: 'POST',
        body: JSON.stringify({ loadingSeconds }),
      })
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown'
      setError(`ローディング表示の開始に失敗しました: ${detail}`)
    }
  }, [showLoadingIndicator, loadingSeconds])

  const handleCancelScheduled = async (id: string) => {
    if (!window.confirm('この予約送信を取り消しますか？\n（送信前であればいつでも取消できます）')) {
      return
    }
    setCancellingScheduledId(id)
    setError('')
    try {
      const res = await api.scheduledMessages.cancel(id)
      if (!res.success) {
        setError('予約の取消に失敗しました。')
        return
      }
      if (editingScheduledId === id) {
        clearScheduledEdit()
      }
      if (selectedChatId) {
        await loadPendingScheduled(selectedChatId)
      }
    } catch {
      setError('予約の取消に失敗しました。')
    } finally {
      setCancellingScheduledId(null)
    }
  }

  const handleSendMessage = async () => {
    if (!selectedChatId || sending || sendLockRef.current) return
    if (!messageContent.trim() && pendingImages.length === 0 && !pendingPdf) return
    const sendingChatId = selectedChatId
    sendLockRef.current = true
    setSending(true)
    setError('')

    try {
      if (sendTiming === 'scheduled') {
        if (!scheduledAtLocal.trim()) {
          setError('予約日時を指定してください。')
          return
        }
        const scheduledAt = scheduledAtLocal.trim()

        let messageType: 'text' | 'image' | 'file' = 'text'
        let content = ''
        if (pendingPdf) {
          messageType = 'file'
          content = JSON.stringify({
            url: pendingPdf.url,
            fileName: pendingPdf.fileName,
            fileSize: pendingPdf.size,
            expiresAt: pendingPdf.expiresAt,
            expiresAtLabel: pendingPdf.expiresAtLabel,
          })
        } else if (pendingImages.length > 0) {
          messageType = 'image'
          content = JSON.stringify(pendingImages)
        } else if (messageContent.trim()) {
          messageType = 'text'
          content = messageContent.trim()
        } else {
          setError('送信内容を入力してください。')
          return
        }

        if (editingScheduledId) {
          const res = await api.scheduledMessages.update(editingScheduledId, {
            messageType,
            content,
            scheduledAt,
          })
          if (!res.success) {
            setError(res.error ?? '予約の更新に失敗しました。')
            return
          }
          clearComposerDraft()
          setEditingScheduledId(null)
          setSendTiming('now')
          await loadPendingScheduled(sendingChatId)
          return
        }

        await api.chats.send(sendingChatId, {
          messageType,
          content,
          scheduledAt,
        })
        clearComposerDraft()
        await loadPendingScheduled(sendingChatId)
        return
      }

      const now = new Date().toISOString()
      // --- PDF send path ---
      if (pendingPdf) {
        const pdfPayload = JSON.stringify({
          url: pendingPdf.url,
          fileName: pendingPdf.fileName,
          fileSize: pendingPdf.size,
          expiresAt: pendingPdf.expiresAt,
          expiresAtLabel: pendingPdf.expiresAtLabel,
        })
        await api.chats.send(sendingChatId, { messageType: 'file', content: pdfPayload })
        const pdfLabel = `📎 ${pendingPdf.fileName}`
        setPendingPdf(null)
        setChatDetail((prev) => (prev && prev.id === sendingChatId) ? {
          ...prev,
          lastMessageAt: now,
          status: 'in_progress',
          messages: [
            ...(prev.messages ?? []),
            {
              id: crypto.randomUUID(),
              direction: 'outgoing',
              messageType: 'file',
              content: pdfPayload,
              createdAt: now,
            },
          ],
        } : prev)
        setChats((prev) => {
          const exists = prev.some((c) => c.id === sendingChatId)
          if (!exists) return prev
          const currentFilter = statusFilterRef.current
          const currentUnansweredOnly = unansweredOnlyRef.current
          const updated = prev.map((c) => c.id === sendingChatId ? {
            ...c,
            lastMessageAt: now,
            status: 'in_progress' as const,
            lastMessageContent: pdfLabel,
            lastMessageDirection: 'outgoing' as const,
            lastMessageType: 'file' as const,
          } : c)
          let filtered = currentFilter === 'all' ? updated : updated.filter((c) => c.status === currentFilter)
          if (currentUnansweredOnly) filtered = filtered.filter((c) => c.id !== sendingChatId)
          return [...filtered].sort((a, b) => {
            const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
            const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
            return bt - at
          })
        })
      }
      // --- Image send path (runs first when image is present) ---
      if (pendingImages.length > 0) {
        const imagesToSend = pendingImages
        const imgPayload = JSON.stringify(imagesToSend)
        await api.chats.send(sendingChatId, { messageType: 'image', content: imgPayload })
        setPendingImages([])
        for (const image of imagesToSend) {
          const singlePayload = JSON.stringify(image)
          setChatDetail((prev) => (prev && prev.id === sendingChatId) ? {
            ...prev,
            lastMessageAt: now,
            status: 'in_progress',
            messages: [
              ...(prev.messages ?? []),
              {
                id: crypto.randomUUID(),
                direction: 'outgoing',
                messageType: 'image',
                content: singlePayload,
                createdAt: now,
              },
            ],
          } : prev)
        }
        setChats((prev) => {
          const exists = prev.some((c) => c.id === sendingChatId)
          if (!exists) return prev
          const currentFilter = statusFilterRef.current
          const currentUnansweredOnly = unansweredOnlyRef.current
          const imageLabel = imagesToSend.length > 1 ? `[画像 ${imagesToSend.length}枚]` : '[画像]'
          const updated = prev.map((c) => c.id === sendingChatId ? {
            ...c,
            lastMessageAt: now,
            status: 'in_progress' as const,
            lastMessageContent: imageLabel,
            lastMessageDirection: 'outgoing' as const,
            lastMessageType: 'image' as const,
          } : c)
          let filtered = currentFilter === 'all' ? updated : updated.filter((c) => c.status === currentFilter)
          if (currentUnansweredOnly) {
            filtered = filtered.filter((c) => c.id !== sendingChatId)
          }
          return [...filtered].sort((a, b) => {
            const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
            const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
            return bt - at
          })
        })
      }
      // --- Text send path (runs independently — both paths execute when both image and text are present) ---
      if (messageContent.trim()) {
        const content = messageContent.trim()
        await api.chats.send(sendingChatId, { content })
        setMessageContent('')
        // Optimistic update: append message locally instead of refetching (prevents scroll jump / full reload feel)
        // Only mutate chatDetail if it still corresponds to the chat we just sent to
        setChatDetail((prev) => (prev && prev.id === sendingChatId) ? {
          ...prev,
          lastMessageAt: now,
          status: 'in_progress',
          messages: [
            ...(prev.messages ?? []),
            {
              id: crypto.randomUUID(),
              direction: 'outgoing',
              messageType: 'text',
              content,
              createdAt: now,
            },
          ],
        } : prev)
        setChats((prev) => {
          // Skip reconciliation if the list no longer contains this chat (e.g. tab changed mid-send)
          const exists = prev.some((c) => c.id === sendingChatId)
          if (!exists) return prev
          const currentFilter = statusFilterRef.current
          const currentUnansweredOnly = unansweredOnlyRef.current
          const updated = prev.map((c) => c.id === sendingChatId ? {
            ...c,
            lastMessageAt: now,
            status: 'in_progress' as const,
            // 一覧の preview も即時更新する。incoming 優先ロジックで上書きされ得るが、
            // 楽観 UI では「operator が今送った文面」が一瞬見えるのが期待動作。
            // 次回 loadChats() で server 側の真の最新 (incoming 優先) に reconcile される。
            lastMessageContent: content,
            lastMessageDirection: 'outgoing' as const,
            lastMessageType: 'text' as const,
          } : c)
          // Drop rows that no longer match the current tab (e.g. replying from 未読 moves chat to in_progress)
          let filtered = currentFilter === 'all' ? updated : updated.filter((c) => c.status === currentFilter)
          if (currentUnansweredOnly) {
            // 未対応モードでは、自分が返信したばかりの chat はもう未対応ではないのでリストから除外
            filtered = filtered.filter((c) => c.id !== sendingChatId)
          }
          return [...filtered].sort((a, b) => {
            const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
            const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
            return bt - at
          })
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'メッセージの送信に失敗しました。')
    } finally {
      setSending(false)
      sendLockRef.current = false
    }
  }

  const handleStatusUpdate = async (newStatus: Chat['status']): Promise<boolean> => {
    if (!selectedChatId) return false
    try {
      const res = await api.chats.update(selectedChatId, { status: newStatus })
      if (!res.success) {
        setError((res as { error?: string }).error ?? 'ステータスの更新に失敗しました。')
        return false
      }
      setChatDetail((prev) => (prev ? { ...prev, status: newStatus } : prev))
      setChats((prev) =>
        prev.map((c) => (c.id === selectedChatId ? { ...c, status: newStatus } : c)),
      )
      return true
    } catch {
      setError('ステータスの更新に失敗しました。')
      return false
    }
  }

  const handleSaveNotes = async (): Promise<boolean> => {
    if (!selectedChatId) return false
    setSavingNotes(true)
    try {
      const res = await api.chats.update(selectedChatId, { notes })
      if (!res.success) {
        setError((res as { error?: string }).error ?? 'メモの保存に失敗しました。')
        return false
      }
      setChatDetail((prev) => (prev ? { ...prev, notes } : prev))
      setChats((prev) =>
        prev.map((c) => (c.id === selectedChatId ? { ...c, notes } : c)),
      )
      return true
    } catch {
      setError('メモの保存に失敗しました。')
      return false
    } finally {
      setSavingNotes(false)
    }
  }

  const handleMobilePdfSelect = async (file: File | undefined) => {
    if (!file) return
    if (!isPdfFile(file)) {
      setError('PDF ファイルを選んでください')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('PDF は 20MB 以下にしてください')
      return
    }
    setPdfUploading(true)
    setError('')
    try {
      const res = await api.uploads.pdf(file)
      if (!res.success) {
        setError(res.error ?? 'アップロード失敗')
        return
      }
      setPendingImages([])
      setPendingPdf({
        url: res.data.url,
        fileName: res.data.fileName || file.name || 'document.pdf',
        size: res.data.size,
        expiresAt: res.data.expiresAt,
        expiresAtLabel: res.data.expiresAtLabel,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`PDF のアップロードに失敗しました: ${msg}`)
    } finally {
      setPdfUploading(false)
    }
  }

  const handleImageFilesSelect = async (fileList: FileList | File[] | null | undefined) => {
    if (!fileList?.length) return
    const files = Array.from(fileList)
    const remaining = MAX_LINE_IMAGES_PER_PUSH - pendingImages.length
    if (remaining <= 0) {
      setError(`画像は最大${MAX_LINE_IMAGES_PER_PUSH}枚までです`)
      return
    }
    const toUpload = files.slice(0, remaining)
    if (files.length > remaining) {
      setError(`最大${MAX_LINE_IMAGES_PER_PUSH}枚のため、${remaining}枚だけ追加しました`)
    } else {
      setError('')
    }
    setImageUploading(true)
    try {
      const uploaded: LineImageUrls[] = []
      for (const file of toUpload) {
        uploaded.push(await uploadLineImage(file))
      }
      setPendingImages((prev) => [...prev, ...uploaded].slice(0, MAX_LINE_IMAGES_PER_PUSH))
      setPendingPdf(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '画像のアップロードに失敗しました')
    } finally {
      setImageUploading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    // IME変換確定のEnterでは送信しない
    if (e.nativeEvent.isComposing || isComposingRef.current || e.keyCode === 229) return
    if (e.key !== 'Enter') return
    // sendMode 'enter': Enter単体で送信、Shift+Enterは改行
    // sendMode 'shift-enter': Shift+Enterで送信、Enter単体は改行
    const shouldSend = sendMode === 'enter' ? !e.shiftKey : e.shiftKey
    if (shouldSend) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <div className="h-full flex flex-col lg:h-auto">
      <div className="hidden lg:block">
        <Header title="オペレーターチャット" />
      </div>

      {/* Error */}
      {error && (
        <div className="mx-3 lg:mx-0 mb-2 lg:mb-4 p-3 lg:p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm shrink-0">
          {error}
        </div>
      )}

      <div className="flex flex-1 min-h-0 gap-0 lg:gap-4 lg:h-[calc(100vh-180px)]">
        {/* Left Panel: Chat List */}
        <div className={`w-full lg:w-96 lg:flex-shrink-0 bg-white lg:rounded-lg lg:shadow-sm lg:border lg:border-gray-200 flex-col overflow-hidden h-full ${selectedChatId ? 'hidden lg:flex' : 'flex'}`}>
          <div className="lg:hidden px-1 py-2 border-b border-gray-100 bg-white shrink-0 flex items-center justify-between pt-[max(8px,env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event('lh:open-sidebar'))}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-700"
              aria-label="メニュー"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-base font-bold text-gray-900">トーク</h1>
            <div className="min-w-[44px]" aria-hidden />
          </div>
          {/* タブ (全て / 未読 / 対応中 / 解決済) は意図的に削除。直近メッセージが見やすい LINE 風一覧を優先。 */}

          {/* Filter row */}
          <div className="px-3 py-2 border-b border-gray-100 flex flex-wrap items-center gap-2">
            {statusFilters.map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                disabled={unansweredOnly}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  statusFilter === f.key
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                } ${unansweredOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {f.label}
              </button>
            ))}
            <label className="flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ml-auto cursor-pointer select-none">
              <input
                type="checkbox"
                checked={unansweredOnly}
                onChange={(e) => setUnansweredOnly(e.target.checked)}
                className="rounded"
              />
              🔥 未対応のみ
            </label>
          </div>

          {/* Chat List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div>
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="px-4 py-3 border-b border-gray-100 animate-pulse">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-gray-200 rounded w-32" />
                        <div className="h-2 bg-gray-100 rounded w-20" />
                      </div>
                      <div className="h-5 bg-gray-100 rounded-full w-12" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {chats.map((chat) => {
                  const isSelected = selectedChatId === chat.id
                  // 「真の自発（要対応）」= chat.status='unread'。webhook 側で auto_reply に
                  // マッチしなかった incoming のみ unread に設定される。auto_reply trigger
                  // (キーワード "コスト比較" 等) は matched 扱いで unread 化しない。
                  // bold / 🟥 の表示はこの status を使う。direction だけだと button 押下も
                  // 強調してしまって S/N 比が悪化する。
                  const needsAttention = chat.status === 'unread'
                  // 最新メッセージの本文 preview。flex/image は文字列で見せても意味が薄いので type 表記に置換。
                  const previewRaw = chat.lastMessageContent ?? ''
                  const preview = (() => {
                    if (chat.lastMessageType === 'image') return '📷 画像'
                    if (chat.lastMessageType === 'flex') return '📋 Flexメッセージ'
                    if (chat.lastMessageType === 'sticker') return '🎨 スタンプ'
                    if (chat.lastMessageType === 'video') return '🎥 動画'
                    if (chat.lastMessageType === 'audio') return '🎤 音声'
                    if (chat.lastMessageType === 'file') return '📎 ファイル'
                    if (chat.lastMessageType === 'location') return '📍 位置情報'
                    return previewRaw.replace(/\n+/g, ' ').slice(0, 60)
                  })()
                  return (
                    <button
                      key={chat.id}
                      onClick={() => { setSelectedFriendId(null); handleSelectChat(chat.id); }}
                      className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors ${
                        isSelected && !selectedFriendId ? 'bg-green-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {chat.friendPictureUrl ? (
                          <img src={chat.friendPictureUrl} alt="" className="w-10 h-10 rounded-full flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                            <span className="text-gray-500 text-sm">{chat.friendName.charAt(0)}</span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              {chat.status === 'unread' && (
                                <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" aria-label="未読" />
                              )}
                              <p className="text-sm font-medium text-gray-900 truncate">{chat.friendName}</p>
                            </div>
                            <span className="text-[10px] text-gray-400 flex-shrink-0">{formatDatetime(chat.lastMessageAt)}</span>
                          </div>
                          <p
                            className={`text-xs mt-0.5 truncate ${
                              needsAttention
                                ? 'text-gray-900 font-medium'
                                : 'text-gray-400'
                            }`}
                            title={preview}
                          >
                            {chat.lastMessageDirection === 'outgoing' && (
                              <span className="text-gray-400 mr-1">↪</span>
                            )}
                            {preview || <span className="italic text-gray-300">(まだメッセージなし)</span>}
                          </p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </>
            )}
          </div>
        </div>

        {/* Right Panel: Chat Detail — モバイルは公式LINE風フルスクリーン */}
        <div className={`flex-1 bg-white lg:rounded-lg lg:shadow-sm lg:border lg:border-gray-200 flex-col overflow-hidden ${
          selectedChatId || selectedFriendId
            ? 'fixed inset-0 z-[60] flex lg:relative lg:z-auto lg:inset-auto'
            : 'hidden lg:flex'
        }`}>
          {selectedFriendId && !selectedChatId ? (
            /* Direct message to friend without existing chat */
            <DirectMessagePanel
              friendId={selectedFriendId}
              friend={allFriends.find((f) => f.id === selectedFriendId) || null}
              onBack={() => setSelectedFriendId(null)}
              onSent={() => { setSelectedFriendId(null); loadChats(); }}
            />
          ) : !selectedChatId ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-gray-400 text-sm">チャットを選択してください</p>
            </div>
          ) : detailLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-gray-400 text-sm">読み込み中...</p>
            </div>
          ) : chatDetail ? (
            <>
              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  void handleMobilePdfSelect(f)
                  e.target.value = ''
                }}
              />
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = e.target.files
                  void handleImageFilesSelect(files)
                  e.target.value = ''
                }}
              />
              {/* Chat Header */}
              <div className="px-2 py-2 lg:px-4 lg:py-4 border-b border-gray-200 flex items-center justify-between gap-2 bg-white shrink-0 pt-[max(8px,env(safe-area-inset-top))] lg:pt-4">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <button
                    onClick={() => { setSelectedChatId(null); setMobileMenuOpen(false) }}
                    className="lg:hidden flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-700"
                    aria-label="戻る"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  {chatDetail.friendPictureUrl && (
                    <img src={chatDetail.friendPictureUrl} alt="" className="w-9 h-9 lg:w-8 lg:h-8 rounded-full flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-base lg:text-sm font-semibold lg:font-medium text-gray-900 truncate">
                      {chatDetail.friendName}
                    </p>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] lg:text-xs font-medium mt-0.5 lg:mt-1 ${statusConfig[chatDetail.status].className}`}
                    >
                      {statusConfig[chatDetail.status].label}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen((v) => !v)}
                  className="lg:hidden min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600"
                  aria-label="メニュー"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
                  </svg>
                </button>
                <div className="hidden lg:flex flex-wrap items-center gap-2">
                  {unansweredOnly && chats.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const idx = chats.findIndex((c) => c.id === selectedChatId)
                        if (idx < 0) return
                        const next = chats[(idx + 1) % chats.length]
                        if (next && next.id !== selectedChatId) {
                          setSelectedChatId(next.id)
                        }
                      }}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 min-h-[44px] lg:min-h-0 text-sm font-medium text-white hover:bg-emerald-700"
                      title="次の未対応 friend に進む"
                    >
                      次の未対応 →
                    </button>
                  )}
                  {chatDetail.status !== 'unread' && (
                    <button
                      onClick={() => handleStatusUpdate('unread')}
                      className="px-3 py-1 min-h-[44px] lg:min-h-0 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                    >
                      未読に戻す
                    </button>
                  )}
                  {chatDetail.status !== 'in_progress' && (
                    <button
                      onClick={() => handleStatusUpdate('in_progress')}
                      className="px-3 py-1 min-h-[44px] lg:min-h-0 text-xs font-medium text-yellow-700 bg-yellow-50 hover:bg-yellow-100 rounded-md transition-colors"
                    >
                      対応中にする
                    </button>
                  )}
                  {chatDetail.status !== 'resolved' && (
                    <button
                      onClick={() => handleStatusUpdate('resolved')}
                      className="px-3 py-1 min-h-[44px] lg:min-h-0 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-md transition-colors"
                    >
                      解決済にする
                    </button>
                  )}
                </div>
              </div>

              {mobileMenuOpen && chatDetail.friendId && (
                <ChatCustomerPanel
                  variant="sheet"
                  friendId={chatDetail.friendId}
                  status={chatDetail.status}
                  notes={notes}
                  savingNotes={savingNotes}
                  onNotesChange={setNotes}
                  onSaveNotes={handleSaveNotes}
                  onStatusChange={handleStatusUpdate}
                  onClose={() => setMobileMenuOpen(false)}
                />
              )}

              {/* Messages — LINE-style chat bubbles */}
              <div ref={messagesScrollRef} className="flex-1 overflow-y-auto p-4 space-y-2" style={{ backgroundColor: '#7494C0' }}>
                {(!chatDetail.messages || chatDetail.messages.length === 0) ? (
                  <div className="text-center py-8">
                    <p className="text-white/60 text-sm">メッセージはまだありません。</p>
                  </div>
                ) : (
                  (chatDetail.messages ?? []).map((msg, idx) => {
                    const prevMsg = idx > 0 ? (chatDetail.messages ?? [])[idx - 1] : null
                    const showDateSep = !prevMsg || !sameYmd(prevMsg.createdAt, msg.createdAt)
                    const isOutgoing = msg.direction === 'outgoing'

                    // メッセージ表示の分岐
                    let bubbleContent: React.ReactNode
                    if (msg.messageType === 'flex') {
                      bubbleContent = (
                        <div className="max-w-[300px]">
                          <FlexPreviewComponent content={msg.content} maxWidth={280} />
                        </div>
                      )
                    } else if (msg.messageType === 'image') {
                      try {
                        const parsed = JSON.parse(msg.content)
                        bubbleContent = (
                          <img src={parsed.originalContentUrl || parsed.previewImageUrl} alt="" className="max-w-[200px] rounded" />
                        )
                      } catch {
                        bubbleContent = <span>🖼️ [画像]</span>
                      }
                    } else if (msg.messageType === 'sticker') {
                      bubbleContent = <StickerMessageImage content={msg.content} />
                    } else if (msg.messageType === 'file') {
                      bubbleContent = <PdfMessageBubble content={msg.content} outgoing={isOutgoing} />
                    } else {
                      bubbleContent = <span>{msg.content}</span>
                    }

                    return (
                      <div key={msg.id}>
                        {showDateSep && (
                          <div className="flex justify-center my-3">
                            <span className="text-[11px] text-white/85 bg-black/20 px-2.5 py-0.5 rounded-full">
                              {formatYmdSlash(msg.createdAt)}
                            </span>
                          </div>
                        )}
                        <div
                          className={`flex items-end gap-2 ${isOutgoing ? 'justify-end' : 'justify-start'}`}
                        >
                          {/* 相手のアイコン（incoming のみ） */}
                          {!isOutgoing && (
                            chatDetail.friendPictureUrl ? (
                              <img src={chatDetail.friendPictureUrl} alt="" className="w-8 h-8 rounded-full flex-shrink-0 mb-1" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gray-300 flex-shrink-0 mb-1" />
                            )
                          )}

                          <div className={`flex flex-col ${isOutgoing ? 'items-end' : 'items-start'}`}>
                            {/* メッセージバブル */}
                            <div
                              className={`max-w-[320px] px-3 py-2 text-sm break-words whitespace-pre-wrap ${
                                isOutgoing
                                  ? 'rounded-tl-2xl rounded-tr-md rounded-bl-2xl rounded-br-2xl text-white'
                                  : 'rounded-tl-md rounded-tr-2xl rounded-bl-2xl rounded-br-2xl bg-white text-gray-900'
                              }`}
                              style={isOutgoing ? { backgroundColor: '#06C755' } : undefined}
                            >
                              {bubbleContent}
                            </div>
                            {/* 時刻 */}
                            <span className="text-xs text-white/50 mt-0.5 px-1">
                              {new Date(msg.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Notes — desktop only */}
              <div className="hidden lg:block px-4 py-2 border-t border-gray-200 bg-gray-50 shrink-0">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="メモを入力..."
                    className="flex-1 text-xs border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                  <button
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50"
                  >
                    {savingNotes ? '保存中...' : 'メモ保存'}
                  </button>
                </div>
              </div>

              {/* 予約送信 */}
              <div className="border-t border-gray-200 shrink-0 px-3 lg:px-4 py-2 bg-white">
                {pendingScheduled.length > 0 && (
                  <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <div className="text-xs font-medium text-amber-900 mb-1.5">
                      予約中のメッセージ（{pendingScheduled.length}件）
                    </div>
                    <ul className="space-y-2">
                      {pendingScheduled.map((item) => (
                        <li
                          key={item.id}
                          className={`flex items-start gap-2 rounded-md border px-2 py-1.5 text-xs text-amber-950 ${
                            editingScheduledId === item.id
                              ? 'border-green-400 bg-green-50/80'
                              : 'border-amber-100 bg-white/80'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-medium tabular-nums text-amber-900">
                              {formatScheduledAtLabel(item.scheduledAt)}
                              {editingScheduledId === item.id && (
                                <span className="ml-1.5 text-[10px] font-normal text-green-700">編集中</span>
                              )}
                            </div>
                            <div className="truncate text-amber-950/90">{scheduledPreviewContent(item)}</div>
                          </div>
                          <div className="flex shrink-0 flex-col gap-1">
                            <button
                              type="button"
                              onClick={() => handleStartEditScheduled(item)}
                              disabled={cancellingScheduledId === item.id || sending}
                              className="rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                            >
                              {editingScheduledId === item.id ? '再読込' : '編集'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleCancelScheduled(item.id)}
                              disabled={cancellingScheduledId === item.id}
                              className="rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                            >
                              {cancellingScheduledId === item.id ? '取消中...' : '予約取消'}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[10px] text-amber-700 mt-1.5">※ 指定時刻から最大5分程度で送信されます</p>
                  </div>
                )}
                {editingScheduledId && (
                  <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-green-200 bg-green-50 px-2 py-1.5 text-xs text-green-900">
                    <span className="min-w-0 flex-1">予約を編集中です。内容と日時を直して「更新」を押してください。</span>
                    <button
                      type="button"
                      onClick={clearScheduledEdit}
                      className="shrink-0 rounded-md border border-green-300 bg-white px-2 py-1 text-[11px] font-medium text-green-900 hover:bg-green-100"
                    >
                      編集やめる
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                  <span className="text-gray-500">送信:</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (editingScheduledId) clearScheduledEdit()
                      else setSendTiming('now')
                    }}
                    className={`px-2 py-1 rounded-md border ${
                      sendTiming === 'now'
                        ? 'border-green-500 bg-green-50 text-green-800'
                        : 'border-gray-300 bg-white'
                    }`}
                  >
                    今すぐ
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSendTiming('scheduled')
                      if (!scheduledAtLocal) setScheduledAtLocal(defaultScheduledLocalValue())
                    }}
                    className={`px-2 py-1 rounded-md border ${
                      sendTiming === 'scheduled'
                        ? 'border-green-500 bg-green-50 text-green-800'
                        : 'border-gray-300 bg-white'
                    }`}
                  >
                    予約
                  </button>
                  {sendTiming === 'scheduled' && (
                    <input
                      type="datetime-local"
                      value={scheduledAtLocal}
                      onChange={(e) => setScheduledAtLocal(e.target.value)}
                      className="border border-gray-300 rounded-md px-2 py-1 text-xs bg-white"
                    />
                  )}
                </div>
              </div>

              {/* Mobile composer — LINE 風 */}
              <div className="lg:hidden border-t border-gray-200 bg-[#efefef] px-2 pt-2 pb-[max(10px,env(safe-area-inset-bottom))] shrink-0">
                {pdfUploading && (
                  <div className="mb-2 px-1 text-sm text-gray-600">PDF をアップロード中...</div>
                )}
                {pendingPdf && (
                  <div className="mb-2 flex items-center gap-2 px-1">
                    <div className="flex-1 min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800">
                      <div className="truncate">📎 {pendingPdf.fileName}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {formatPdfSize(pendingPdf.size)} · リンク期限 {pendingPdf.expiresAtLabel}まで
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingPdf(null)}
                      className="text-xs text-gray-600 px-2 py-1 bg-white rounded-md border border-gray-200 shrink-0"
                    >
                      取消
                    </button>
                  </div>
                )}
                {pendingImages.length > 0 || imageUploading ? (
                  <ChatPendingImages
                    images={pendingImages}
                    uploading={imageUploading}
                    onRemove={(index) => setPendingImages((prev) => prev.filter((_, i) => i !== index))}
                    onAddClick={() => imageInputRef.current?.click()}
                  />
                ) : null}
                <div className="flex items-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 shrink-0"
                    aria-label="画像を添付"
                  >
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => pdfInputRef.current?.click()}
                    disabled={pdfUploading}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 shrink-0 disabled:opacity-40"
                    aria-label="PDFを添付"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </button>
                  <textarea
                    ref={mobileTextareaRef}
                    rows={1}
                    value={messageContent}
                    onChange={(e) => {
                      const value = e.target.value
                      setMessageContent(value)
                      if (selectedChatId && isMessageInputFocused && value.trim()) {
                        void triggerLoadingAnimation(selectedChatId)
                      }
                    }}
                    onCompositionStart={() => { isComposingRef.current = true }}
                    onCompositionEnd={() => { isComposingRef.current = false }}
                    onFocus={() => {
                      setIsMessageInputFocused(true)
                      if (selectedChatId) void triggerLoadingAnimation(selectedChatId)
                    }}
                    onBlur={() => setIsMessageInputFocused(false)}
                    placeholder="メッセージ"
                    enterKeyHint="send"
                    className="flex-1 text-base leading-snug border-0 rounded-3xl px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/40 resize-none max-h-32 min-h-[44px]"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSendMessage()}
                    disabled={sending || imageUploading || (!messageContent.trim() && pendingImages.length === 0 && !pendingPdf)}
                    className="min-w-[44px] min-h-[44px] rounded-full text-white flex items-center justify-center shrink-0 disabled:opacity-40"
                    style={{ backgroundColor: '#06C755' }}
                    aria-label={editingScheduledId ? '更新' : sendTiming === 'scheduled' ? '予約' : '送信'}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Send Message Form — desktop */}
              <div className="hidden lg:block px-4 py-3 border-t border-gray-200 shrink-0">
                <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-gray-600">
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showLoadingIndicator}
                      onChange={(e) => setShowLoadingIndicator(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    入力中ローディングを表示
                  </label>
                  <select
                    value={loadingSeconds}
                    onChange={(e) => setLoadingSeconds(Number.parseInt(e.target.value, 10))}
                    disabled={!showLoadingIndicator}
                    className="border border-gray-300 rounded-md px-2 py-1 bg-white disabled:bg-gray-100 disabled:text-gray-400"
                  >
                    {[5, 10, 15, 20, 30, 45, 60].map((sec) => (
                      <option key={sec} value={sec}>{sec}秒</option>
                    ))}
                  </select>
                  <span className="text-gray-500">送信キー:</span>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      checked={sendMode === 'enter'}
                      onChange={() => setSendMode('enter')}
                      className="accent-green-600"
                    />
                    <span>Enter</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      checked={sendMode === 'shift-enter'}
                      onChange={() => setSendMode('shift-enter')}
                      className="accent-green-600"
                    />
                    <span>Shift+Enter</span>
                  </label>
                </div>
                <div className="mb-2">
                  <div className="text-sm font-medium text-gray-700 mb-1">画像を送る (任意)</div>
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={imageUploading || pendingImages.length >= MAX_LINE_IMAGES_PER_PUSH}
                    className="text-sm px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-50"
                  >
                    {imageUploading ? 'アップロード中...' : '📎 画像を選択'}
                  </button>
                  <ChatPendingImages
                    images={pendingImages}
                    uploading={imageUploading}
                    onRemove={(index) => setPendingImages((prev) => prev.filter((_, i) => i !== index))}
                    onAddClick={() => imageInputRef.current?.click()}
                  />
                </div>
                <div className="mb-2">
                  {pdfUploading ? (
                    <div className="text-sm text-gray-600 px-1">PDF をアップロード中...</div>
                  ) : pendingPdf ? (
                    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                      <span className="flex-1 truncate text-gray-800">
                        📎 {pendingPdf.fileName}
                        <span className="block text-gray-500 text-xs mt-0.5 font-normal">
                          {formatPdfSize(pendingPdf.size)} · リンク期限 {pendingPdf.expiresAtLabel}まで
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setPendingPdf(null)}
                        className="text-xs text-gray-600 px-2 py-1 bg-white rounded border border-gray-200"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => pdfInputRef.current?.click()}
                        disabled={pdfUploading}
                        className="text-sm px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-50"
                      >
                        PDFを添付
                      </button>
                      <span className="text-xs text-gray-500">最大 20MB · リンクは30日間有効（期限後は開けません）</span>
                    </div>
                  )}
                </div>
                <div className="flex items-end gap-2">
                  <textarea
                    ref={textareaRef}
                    rows={2}
                    value={messageContent}
                    style={{ maxHeight: '200px', overflowY: 'auto' }}
                    onChange={(e) => {
                      const value = e.target.value
                      setMessageContent(value)
                      if (selectedChatId && isMessageInputFocused && value.trim()) {
                        void triggerLoadingAnimation(selectedChatId)
                      }
                    }}
                    onCompositionStart={() => { isComposingRef.current = true }}
                    onCompositionEnd={() => { isComposingRef.current = false }}
                    onFocus={() => {
                      setIsMessageInputFocused(true)
                      if (selectedChatId) {
                        void triggerLoadingAnimation(selectedChatId)
                      }
                    }}
                    onBlur={() => setIsMessageInputFocused(false)}
                    onKeyDown={handleKeyDown}
                    placeholder="メッセージを入力..."
                    className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 resize-none overflow-y-auto"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={sending || imageUploading || (!messageContent.trim() && pendingImages.length === 0 && !pendingPdf)}
                    className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: '#06C755' }}
                  >
                    {sending
                      ? (editingScheduledId ? '更新中...' : '送信中...')
                      : editingScheduledId
                        ? '更新'
                        : sendTiming === 'scheduled'
                          ? '予約'
                          : '送信'}
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Right-most Panel: 友だち詳細サイドバー — chat detail を開いている時のみ表示 */}
        {/*
          friendId は **現在の selection** を優先する。chatDetail の load 中は前の chat
          のデータが残ったままなので、それを参照するとサイドバーだけ前の友だちを
          表示し続けて pane 間の不整合になる。selection ID 自体が friend_id なので
          直接渡せる (chat list SQL が `id: f.id` で friend_id を返す)。
        */}
        {(selectedChatId || selectedFriendId) && (
          <div className="hidden xl:flex">
            <FriendInfoSidebar
              friendId={selectedFriendId ?? selectedChatId}
              chatStatus={
                chatDetail &&
                chatDetail.friendId === (selectedFriendId ?? selectedChatId)
                  ? { status: chatDetail.status, notes: chatDetail.notes }
                  : undefined
              }
            />
          </div>
        )}
      </div>
      <div className="hidden lg:block">
        <CcPromptButton prompts={ccPrompts} />
      </div>
    </div>
  )
}
