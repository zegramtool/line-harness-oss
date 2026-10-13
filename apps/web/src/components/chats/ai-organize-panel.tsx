'use client'

import { useEffect, useRef, useState } from 'react'
import type { AiOrganizeJob, AiOrganizeSection, AiOrganizeSummary } from '@line-crm/shared'
import { fetchApi } from '@/lib/api'

const labels: Record<AiOrganizeSection, string> = {
  needs: '用件', history: '経緯', reply: '返事が必要な候補', unfinished: '未完了の候補', next: '次にやること',
}
type Saved = { friendId: string; displayName: string | null; updatedAt: string; from: string; to: string; summary: AiOrganizeSummary }
type Response<T> = { success: boolean; data: T; error?: string }
const usd = (n: number) => `$${n.toFixed(5)}`
const jstDate = (date: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
const errorLabels: Record<string, string> = {
  AI_NOT_ENABLED: 'AI接続は未有効です。管理者による設定・承認が必要です。',
  AI_BUDGET_OR_CONCURRENCY_LIMIT: '月の予算上限、または他の実行中ジョブのため開始できません。',
  AI_PREVIEW_STALE: '保存要約が更新されました。対象件数を確認し直してください。',
  AI_PREVIEW_EXPIRED: '確認内容の有効期限が切れました。対象件数を確認し直してください。',
  AI_CONFIG_CHANGED: 'モデルまたは予算設定が変わりました。新しい確認が必要です。',
  AI_MESSAGE_TOO_LARGE: '長すぎる発言、または保存要約のため今回は処理できません。原文の手動確認が必要です。',
  AI_JOB_BUDGET_TOO_SMALL: '1会話の処理にも予算が足りません。上限設定を管理者に確認してください。',
}
async function call<T>(path: string, body?: unknown): Promise<T> {
  let result: Response<T>
  try {
    result = await fetchApi<Response<T>>(`/api/ai-organize/${path}`, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) }, true)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    throw new Error(errorLabels[message] || (message === 'API error: 403' ? '管理者権限が必要です。' : message || '処理に失敗しました。'))
  }
  if (!result.success) throw new Error(errorLabels[result.error ?? ''] || result.error || '読み込みに失敗しました。')
  return result.data
}
function Summary({ value }: { value: AiOrganizeSummary }) {
  return <div className="space-y-3">
    {(Object.keys(labels) as AiOrganizeSection[]).map(key => <div key={key}>
      <h4 className="text-sm font-semibold text-gray-800">{labels[key]}</h4>
      {value[key].length === 0 ? <p className="text-sm text-gray-500">根拠付きの候補なし</p> : <ul className="space-y-2 mt-1">
        {value[key].map((entry, index) => <li key={index} className="text-sm text-gray-800 bg-gray-50 rounded-lg p-2">
          <p className="whitespace-pre-wrap">{entry.text}</p>
          <p className="text-xs text-amber-800 mt-1">要確認{entry.replyState === 'reply_observed' ? ' · 返信を観測（作業完了とは別）' : ''}{entry.workState === 'completion_reported' ? ' · 完了の申告あり（確定ではありません）' : ''}</p>
          <div className="flex flex-wrap gap-2 mt-1">{entry.evidence.map(e => <a key={e.id} href={e.href} className="text-xs text-blue-700 underline">{e.at} の会話</a>)}</div>
        </li>)}
      </ul>}
    </div>)}
  </div>
}

export default function AiOrganizePanel({ accountId }: { accountId: string | null }) {
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(() => jstDate(new Date(Date.now() - 30 * 86400_000)))
  const [to, setTo] = useState(() => jstDate(new Date()))
  const [job, setJob] = useState<AiOrganizeJob | null>(null)
  const [saved, setSaved] = useState<Saved[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const active = useRef(true)
  const continueRun = useRef(false)
  const title = useRef<HTMLHeadingElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  useEffect(() => { active.current = true; return () => { active.current = false; continueRun.current = false } }, [])
  useEffect(() => {
    if (!open) return
    title.current?.focus()
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { continueRun.current = false; setOpen(false); opener.current?.focus() }
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [open])
  const guard = async (operation: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await operation() }
    catch (e) { if (active.current) setError(e instanceof Error ? e.message : '処理に失敗しました。') }
    finally { if (active.current) setBusy(false) }
  }
  const load = async () => {
    if (!accountId) return
    const data = await call<{ summaries: Saved[]; job: AiOrganizeJob | null }>(`summaries?accountId=${encodeURIComponent(accountId)}`)
    if (active.current) { setSaved(data.summaries); setJob(data.job) }
  }
  const preview = () => guard(async () => {
    // Dates are JST calendar days. Today ends at now, not tomorrow/future.
    const end = Math.min(new Date(`${to}T23:59:59.999+09:00`).getTime() + 1, Date.now())
    const value = await call<AiOrganizeJob>('preview', { accountId, from: new Date(`${from}T00:00:00+09:00`).toISOString(), to: new Date(end).toISOString() })
    if (active.current) setJob(value)
  })
  const run = (start: boolean, retry = false) => guard(async () => {
    if (!job || !accountId) return
    continueRun.current = true
    let current = start ? await call<AiOrganizeJob>(`jobs/${job.id}/start`, { accountId }) : job
    if (active.current) setJob(current)
    for (let i = 0; i < 10 && active.current && continueRun.current && current.status === 'ready'; i++) {
      current = await call<AiOrganizeJob>(`jobs/${job.id}/step`, { accountId, retry: i === 0 && retry })
      if (!active.current) break
      setJob(current)
      // A failure/in-flight request requires an explicit resume, never auto retry.
      if (current.items.some(item => item.status === 'failed' || item.status === 'processing')) break
    }
    if (active.current) {
      const data = await call<{ summaries: Saved[] }>(`summaries?accountId=${encodeURIComponent(accountId)}`)
      setSaved(data.summaries)
    }
  })
  const close = () => { continueRun.current = false; setOpen(false); opener.current?.focus() }
  const estimate = job?.estimate
  return <>
    <button ref={opener} type="button" aria-expanded={open} disabled={!accountId} onClick={() => { setOpen(true); void guard(load) }} className="rounded-lg px-3 py-2 text-sm font-semibold bg-indigo-600 text-white disabled:opacity-50">AIで整理</button>
    {open && <div className="fixed inset-0 z-[100] bg-black/40 p-3 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="ai-organize-title">
      <section className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto p-5" onKeyDown={event => {
        if (event.key !== 'Tab') return
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),a[href],summary')].filter(element => element.offsetParent !== null)
        if (!controls.length) return
        const index = controls.indexOf(document.activeElement as HTMLElement)
        if (event.shiftKey && index <= 0) { event.preventDefault(); controls[controls.length - 1].focus() }
        else if (!event.shiftKey && index === controls.length - 1) { event.preventDefault(); controls[0].focus() }
      }}>
        <div className="flex justify-between items-center gap-3"><h2 ref={title} tabIndex={-1} id="ai-organize-title" className="text-xl font-bold">AIで整理</h2><button onClick={close} aria-label="AI整理を閉じる" className="p-2 rounded-lg border">閉じる</button></div>
        <p className="text-sm text-gray-600 mt-2">お客様ごとに用件と次の対応を整理します。返信や状態の変更は行いません。候補は原文を確認して判断してください。</p>
        <p className="text-sm text-gray-600 mt-2">初回は指定期間、次回はそのお客様の保存要約と新着だけを使います。対象はテキストと担当者の返信です。画像・PDF・自動配信は解析しません。</p>
        {error && <p role="alert" className="mt-3 bg-red-50 text-red-700 rounded-lg p-3 text-sm">{error}</p>}
        <div className="flex flex-wrap items-end gap-3 mt-4">
          <label className="text-sm">初回の開始日（日本時間）<input type="date" value={from} onChange={e => { setFrom(e.target.value); if (job?.status === 'preview') setJob(null) }} disabled={busy || job?.status === 'ready'} className="block border rounded p-2" /></label>
          <label className="text-sm">終了日（日本時間）<input type="date" value={to} onChange={e => { setTo(e.target.value); if (job?.status === 'preview') setJob(null) }} disabled={busy || job?.status === 'ready'} className="block border rounded p-2" /></label>
          <button disabled={busy || job?.status === 'ready'} onClick={preview} className="border rounded-lg px-3 py-2 text-sm disabled:opacity-50">対象件数と費用を確認</button>
        </div>
        {job && estimate && <div className="border rounded-lg p-3 mt-4 text-sm space-y-2">
          <p>{estimate.conversations} 会話 · {estimate.messages} 発言 · {estimate.model}</p>
          <p>1回目の保守的な概算：{usd(estimate.estimatedUsd)} ／ 再試行1回を含む予約予算：{usd(estimate.reservedUsd)}</p>
          <p>アプリ上限：1回 {usd(estimate.perJobLimitUsd)} · 月 {usd(estimate.monthlyLimitUsd)}（UTC月）</p>
          <p className="text-xs text-gray-600">入力は最大24,000トークン相当／会話、出力は推論込み最大2,048トークン。概算は実請求の保証ではありません。料金変更時は設定更新が必要です。</p>
          {estimate.moreAvailable && <p className="text-amber-800">上限のため未処理分が残ります。処理後にもう一度件数確認すると、続きだけを対象にします。</p>}
          {!estimate.configured && <p className="text-amber-800">AI接続は未有効です。本番利用の承認・設定後に実行できます。</p>}
          {job.status === 'preview' && <>
            <p>実行すると対象会話のテキスト・発言日時・お客様を区別するアプリ内の会話ID・発言ID・保存要約をOpenAI APIへ送信します。プロフィールの氏名・LINE user ID・添付本体は送信しません。本文に含まれる氏名や住所などは送信対象です。</p>
            <button disabled={busy || !estimate.configured || !estimate.messages} onClick={() => run(true)} className="bg-indigo-600 text-white rounded-lg px-3 py-2 disabled:opacity-50">この範囲と予算で実行</button>
            {!estimate.messages && <p>対象の新着テキストはありません。APIは呼び出しません。</p>}
          </>}
          {job.status === 'ready' && <div className="flex flex-wrap gap-3">
            <button disabled={busy || job.items.some(i => i.status === 'failed' && i.attempts >= 2)} onClick={() => run(false, job.items.some(i => i.status === 'failed'))} className="border rounded px-3 py-2 disabled:opacity-50">{job.items.some(i => i.status === 'failed') ? '予約予算内で1回再試行して再開' : '続きから再開'}</button>
            <button disabled={busy} onClick={() => guard(async () => { const value = await call<AiOrganizeJob>(`jobs/${job.id}/cancel`, { accountId }); setJob(value) })} className="border rounded px-3 py-2">中止して予算を精算</button>
          </div>}
          <p>{busy ? '処理中。閉じると次の会話から一時停止します。' : job.status === 'completed' ? '今回の処理は完了しました。' : job.status === 'cancelled' ? '中止しました。成功済みの要約は保存されています。' : ''}</p>
          {job.items.map(item => <p key={item.id} className="text-xs">{item.displayName || 'お客様'}：{item.status === 'done' ? '保存済み' : item.status === 'failed' ? `停止（${item.errorCode}）· 前の要約を保持` : item.status === 'processing' ? '処理中' : '未処理'} · 試行 {item.attempts}/2 · 記録額 {usd(item.chargedUsd)}</p>)}
        </div>}
        <h3 className="font-bold mt-6 mb-3">保存済みの整理（更新順・最大100会話）</h3>
        {!saved.length && <p className="text-sm text-gray-500">保存済みの整理はまだありません。</p>}
        <div className="space-y-3">{saved.map(entry => <details key={entry.friendId} className="border rounded-lg p-3">
          <summary className="font-medium cursor-pointer">{entry.displayName || 'お客様'} <span className="text-xs text-gray-500">更新 {entry.updatedAt}</span></summary>
          <p className="text-xs text-gray-500 my-2">開始 {entry.from} · 今回の最後の発言 {entry.to}（全履歴を読み終えた保証ではありません）</p>
          <Summary value={entry.summary} />
        </details>)}</div>
      </section>
    </div>}
  </>
}
