'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { restoreSession } from '@/lib/session-auth'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let cancelled = false

    if (pathname === '/login') {
      setChecked(true)
      return () => { cancelled = true }
    }

    const checkSession = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL
        if (!apiUrl) throw new Error('missing api url')
        const staff = await restoreSession(apiUrl)
        if (!staff) throw new Error('unauthenticated')
        if (!cancelled) setChecked(true)
      } catch {
        if (!cancelled) router.replace('/login')
      }
    }

    checkSession()
    return () => { cancelled = true }
  }, [pathname, router])

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-[3px] border-gray-200 border-t-green-500 rounded-full" />
      </div>
    )
  }

  return <>{children}</>
}
