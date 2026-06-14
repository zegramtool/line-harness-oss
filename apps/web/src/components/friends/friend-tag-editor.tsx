'use client'

import { useState } from 'react'
import type { Tag } from '@line-crm/shared'
import { api } from '@/lib/api'
import TagBadge from './tag-badge'

interface FriendTagEditorProps {
  friendId: string
  tags: Tag[]
  allTags: Tag[]
  onChange: () => void
  compact?: boolean
}

export default function FriendTagEditor({
  friendId,
  tags,
  allTags,
  onChange,
  compact = false,
}: FriendTagEditorProps) {
  const [adding, setAdding] = useState(false)
  const [selectedTagId, setSelectedTagId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const availableTags = allTags.filter((t) => !tags.some((ft) => ft.id === t.id))

  const handleAdd = async () => {
    if (!selectedTagId) return
    setLoading(true)
    setError('')
    try {
      const res = await api.friends.addTag(friendId, selectedTagId)
      if (!res.success) {
        setError((res as { error?: string }).error ?? 'タグの追加に失敗しました')
        return
      }
      setAdding(false)
      setSelectedTagId('')
      onChange()
    } catch {
      setError('タグの追加に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async (tagId: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await api.friends.removeTag(friendId, tagId)
      if (!res.success) {
        setError((res as { error?: string }).error ?? 'タグの削除に失敗しました')
        return
      }
      onChange()
    } catch {
      setError('タグの削除に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 ? (
          <p className="text-xs text-gray-400 italic">タグなし</p>
        ) : (
          tags.map((tag) => (
            <TagBadge
              key={tag.id}
              tag={tag}
              onRemove={loading ? undefined : () => void handleRemove(tag.id)}
            />
          ))
        )}
      </div>
      {adding ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedTagId}
            onChange={(e) => setSelectedTagId(e.target.value)}
            className="flex-1 min-w-[120px] text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white"
            disabled={loading}
          >
            <option value="">タグを選択...</option>
            {availableTags.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={!selectedTagId || loading}
            className="px-3 py-2 text-xs font-medium text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: '#06C755' }}
          >
            追加
          </button>
          <button
            type="button"
            onClick={() => { setAdding(false); setSelectedTagId('') }}
            className="px-3 py-2 text-xs text-gray-600"
          >
            取消
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={loading || availableTags.length === 0}
          className="text-xs font-medium text-green-700 disabled:text-gray-400"
        >
          {availableTags.length === 0 ? '追加できるタグがありません' : '+ タグを追加'}
        </button>
      )}
    </div>
  )
}
