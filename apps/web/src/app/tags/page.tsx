'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { Tag } from '@line-crm/shared'
import TagBadge from '@/components/friends/tag-badge'

const PRESET_COLORS = [
  '#ABC003',
  '#714F9D',
  '#3B82F6',
  '#22C55E',
  '#F59E0B',
  '#EF4444',
  '#6B7280',
  '#FF8C00',
]

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadTags = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.tags.list()
      if (res.success) {
        setTags(res.data)
      } else {
        setError(res.error ?? 'タグの読み込みに失敗しました')
      }
    } catch {
      setError('タグの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTags()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setCreating(true)
    setError('')
    try {
      const res = await api.tags.create({ name: trimmed, color })
      if (!res.success) {
        setError(res.error ?? 'タグの作成に失敗しました')
        return
      }
      setName('')
      await loadTags()
    } catch {
      setError('タグの作成に失敗しました')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (tag: Tag) => {
    if (!window.confirm(`タグ「${tag.name}」を削除しますか？\n友だちからも外れます。`)) return
    setDeletingId(tag.id)
    setError('')
    try {
      const res = await api.tags.delete(tag.id)
      if (!res.success) {
        setError(res.error ?? 'タグの削除に失敗しました')
        return
      }
      await loadTags()
    } catch {
      setError('タグの削除に失敗しました')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-2">タグ管理</h1>
      <p className="text-sm text-gray-500 mb-6">
        ここでタグの追加・削除ができます。友だちへの付け外しは
        <strong className="font-medium text-gray-700"> 友だち管理 </strong>
        または
        <strong className="font-medium text-gray-700"> 個別チャット </strong>
        のメニューから行います。
      </p>

      {error && (
        <div className="text-red-700 bg-red-50 p-3 rounded mb-4 text-sm">{error}</div>
      )}

      <form onSubmit={handleCreate} className="bg-white border rounded-lg p-4 mb-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">新しいタグを追加</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 見積もり済み"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            maxLength={40}
          />
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-10 h-10 rounded border border-gray-300 cursor-pointer"
              title="タグの色"
            />
            <div className="flex gap-1">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-gray-900' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: '#06C755' }}
          >
            {creating ? '追加中...' : '追加'}
          </button>
        </div>
        {name.trim() && (
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
            プレビュー:
            <TagBadge tag={{ id: 'preview', name: name.trim(), color, createdAt: '' }} />
          </div>
        )}
      </form>

      <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
        <h2 className="text-sm font-semibold text-gray-700 px-4 py-3 border-b bg-gray-50">
          登録済みタグ ({tags.length})
        </h2>
        {loading ? (
          <p className="p-4 text-sm text-gray-500">読み込み中...</p>
        ) : tags.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">タグがまだありません。</p>
        ) : (
          <ul className="divide-y">
            {tags.map((tag) => (
              <li key={tag.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <TagBadge tag={tag} />
                <button
                  type="button"
                  onClick={() => handleDelete(tag)}
                  disabled={deletingId === tag.id}
                  className="text-xs text-red-600 hover:underline disabled:opacity-50 shrink-0"
                >
                  {deletingId === tag.id ? '削除中...' : '削除'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 text-sm text-gray-500 space-y-2 border-t pt-4">
        <p className="font-medium text-gray-700">友だちへのタグ付け</p>
        <ul className="list-disc list-inside space-y-1 text-xs leading-relaxed">
          <li>
            <strong>個別チャット</strong> — 右上 ⋮ メニュー → タグ欄で追加・削除
          </li>
          <li>
            <strong>友だち管理</strong> — 各行の「タグ編集」から追加・削除
          </li>
          <li>
            <strong>問合せ済</strong> — お問い合わせフォーム送信時に自動付与（フォーム設定で指定）
          </li>
        </ul>
        <p className="text-xs">
          タグ名の変更は未対応です。名前を変えたい場合は新しいタグを作成し、古いタグを削除してください。
        </p>
      </div>
    </div>
  )
}
