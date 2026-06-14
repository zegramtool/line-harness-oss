'use client'

import { useEffect, useState } from 'react'
import type { Tag } from '@line-crm/shared'
import { api } from '@/lib/api'
import FriendTagEditor from '@/components/friends/friend-tag-editor'

type ChatStatus = 'unread' | 'in_progress' | 'resolved'

const statusOptions: { key: ChatStatus; label: string; className: string }[] = [
  { key: 'unread', label: '未対応', className: 'bg-red-100 text-red-700 border-red-200' },
  { key: 'in_progress', label: '対応中', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { key: 'resolved', label: '解決済', className: 'bg-green-100 text-green-700 border-green-200' },
]

interface Props {
  friendId: string
  status: ChatStatus
  notes: string
  savingNotes: boolean
  onNotesChange: (value: string) => void
  onSaveNotes: () => Promise<boolean>
  onStatusChange: (status: ChatStatus) => Promise<boolean>
  onClose?: () => void
  variant?: 'sheet' | 'inline'
}

export default function ChatCustomerPanel({
  friendId,
  status,
  notes,
  savingNotes,
  onNotesChange,
  onSaveNotes,
  onStatusChange,
  onClose,
  variant = 'inline',
}: Props) {
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [friendTags, setFriendTags] = useState<Tag[]>([])
  const [statusLoading, setStatusLoading] = useState(false)
  const [saveHint, setSaveHint] = useState('')

  const loadTags = async () => {
    const [tagsRes, friendRes] = await Promise.all([
      api.tags.list(),
      api.friends.get(friendId),
    ])
    if (tagsRes.success) setAllTags(tagsRes.data)
    if (friendRes.success) {
      const f = friendRes.data as { tags?: Tag[] }
      setFriendTags(f.tags ?? [])
    }
  }

  useEffect(() => {
    void loadTags()
  }, [friendId])

  const handleStatus = async (next: ChatStatus) => {
    if (next === status) return
    setStatusLoading(true)
    const ok = await onStatusChange(next)
    setStatusLoading(false)
    if (ok) setSaveHint('ステータスを保存しました')
  }

  const handleSave = async () => {
    const ok = await onSaveNotes()
    setSaveHint(ok ? 'メモを保存しました' : 'メモの保存に失敗しました')
  }

  const body = (
    <div className="space-y-5">
      <section>
        <h4 className="text-xs font-semibold text-gray-500 mb-2">対応状況</h4>
        <div className="flex flex-wrap gap-2">
          {statusOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              disabled={statusLoading}
              onClick={() => void handleStatus(opt.key)}
              className={`px-4 py-2.5 min-h-[44px] rounded-full text-sm font-medium border transition-opacity ${
                status === opt.key
                  ? opt.className + ' ring-2 ring-offset-1 ring-green-500/40'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-gray-500">メモ</h4>
          {saveHint && (
            <span className={`text-[11px] ${saveHint.includes('失敗') ? 'text-red-600' : 'text-green-600'}`}>
              {saveHint}
            </span>
          )}
        </div>
        <textarea
          value={notes}
          onChange={(e) => {
            onNotesChange(e.target.value)
            setSaveHint('')
          }}
          onBlur={() => { void handleSave() }}
          placeholder="対応内容・引き継ぎメモ..."
          rows={3}
          className="w-full text-base border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/40 resize-none"
        />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={savingNotes}
          className="mt-2 w-full min-h-[44px] rounded-xl text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: '#06C755' }}
        >
          {savingNotes ? '保存中...' : 'メモを保存'}
        </button>
      </section>

      <section>
        <h4 className="text-xs font-semibold text-gray-500 mb-2">タグ</h4>
        <FriendTagEditor
          friendId={friendId}
          tags={friendTags}
          allTags={allTags}
          onChange={() => void loadTags()}
          compact
        />
      </section>
    </div>
  )

  if (variant === 'sheet') {
    return (
      <>
        <div
          className="fixed inset-0 z-[70] bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
        <div className="fixed inset-x-0 bottom-0 z-[71] lg:hidden max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white shadow-xl pb-[max(16px,env(safe-area-inset-bottom))]">
          <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">顧客情報</h3>
            <button
              type="button"
              onClick={onClose}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-500"
              aria-label="閉じる"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="p-4">{body}</div>
        </div>
      </>
    )
  }

  return <div className="p-4">{body}</div>
}
