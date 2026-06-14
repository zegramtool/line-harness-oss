import type { Viewport } from 'next'

/** チャット画面はアプリ風に表示。Safari のピンチ・入力フォーカス時の自動ズームを抑止 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#06C755',
}

export default function ChatsLayout({ children }: { children: React.ReactNode }) {
  return children
}
