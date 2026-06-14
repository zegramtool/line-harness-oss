'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from './layout/sidebar'
import { UpdateBanner } from './update/update-banner'
import AuthGuard from './auth-guard'
import { AccountProvider } from '@/contexts/account-context'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isMobileChat = pathname === '/chats'

  useEffect(() => {
    if (!isMobileChat) return
    document.documentElement.classList.add('lh-chat-app')
    document.body.classList.add('lh-chat-app')
    return () => {
      document.documentElement.classList.remove('lh-chat-app')
      document.body.classList.remove('lh-chat-app')
    }
  }, [isMobileChat])

  if (pathname === '/login') {
    return <>{children}</>
  }

  return (
    <AuthGuard>
      <AccountProvider>
        <div className={`flex flex-col ${isMobileChat ? 'h-[100dvh] max-h-[100dvh] overflow-hidden' : 'min-h-screen'}`}>
          {/* Phase 6: banner above sidebar+header so it pins to the top of the
              admin shell. Renders nothing while loading; one of latest/fork/
              upgrade once /admin/version + manifest resolve. */}
          {!isMobileChat && <UpdateBanner />}
          <div className="flex flex-1 min-h-0">
            <Sidebar />
            <main
              className={`flex-1 min-h-0 ${
                isMobileChat
                  ? 'overflow-hidden pt-0 lg:pt-0 lg:overflow-auto'
                  : 'overflow-auto pt-[72px] lg:pt-0'
              }`}
            >
              <div
                className={
                  isMobileChat
                    ? 'h-full lg:h-auto lg:px-8 lg:pt-8 lg:pb-8 px-0 pb-0'
                    : 'px-4 pb-6 sm:px-6 lg:pt-8 lg:px-8 lg:pb-8'
                }
              >
                {children}
              </div>
            </main>
          </div>
        </div>
      </AccountProvider>
    </AuthGuard>
  )
}
