'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  clearClientSession,
  establishSessionAfterLogin,
  shouldPreferBearerAuth,
} from '@/lib/session-auth'

export default function LoginPage() {
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL
      if (!apiUrl) {
        setError('NEXT_PUBLIC_API_URL is not set in build env')
        setLoading(false)
        return
      }

      const trimmedKey = apiKey.trim()
      const res = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: trimmedKey,
          preferBearer: shouldPreferBearerAuth(),
        }),
      })

      if (res.status === 401) {
        setError('APIキーが正しくありません')
        return
      }

      if (!res.ok) {
        let message = 'ログインに失敗しました'
        try {
          const data = await res.json()
          if (data?.error) message = data.error
        } catch {
          // keep default
        }
        setError(message)
        return
      }

      const loginData = await res.json()
      const mode = await establishSessionAfterLogin(apiUrl, trimmedKey, loginData)
      if (mode === 'bearer') {
        console.info('[auth] mobile bearer session established')
      }
      router.push('/')
    } catch (err) {
      clearClientSession()
      setError(err instanceof Error ? err.message : '接続に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#06C755' }}>
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg mx-auto mb-3" style={{ backgroundColor: '#06C755' }}>
            H
          </div>
          <h1 className="text-xl font-bold text-gray-900">L Harness</h1>
          <p className="text-sm text-gray-500 mt-1">管理画面にログイン</p>
        </div>

        <form onSubmit={handleLogin}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="APIキーを入力"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 mb-4">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !apiKey.trim()}
            className="w-full py-3 text-white font-medium rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#06C755' }}
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        <p className="text-xs text-gray-400 mt-4 leading-relaxed">
          iPhone の Safari では Cookie の代わりに短命セッショントークンで認証します（タブを閉じると再ログインが必要です）。APIキー自体は端末に保存しません。
        </p>
      </div>
    </div>
  )
}
