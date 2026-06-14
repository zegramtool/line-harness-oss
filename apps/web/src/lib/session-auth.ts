/** Session cookie auth (desktop) + Bearer fallback (iOS Safari cross-site). */

export const BEARER_STORAGE_KEY = 'lh_bearer_token'
export const CSRF_STORAGE_KEY = 'lh_csrf'

export type SessionMode = 'cookie' | 'bearer'

export interface StaffSession {
  id: string
  name: string
  role: string
}

interface SessionPayload {
  success?: boolean
  data?: StaffSession
  csrfToken?: string
  sessionToken?: string
  error?: string
}

function staffFromPayload(payload: SessionPayload): StaffSession | null {
  if (!payload?.success || !payload.data) return null
  return payload.data
}

export function getBearerToken(): string {
  if (typeof window === 'undefined') return ''
  try {
    return sessionStorage.getItem(BEARER_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function setBearerToken(token: string): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(BEARER_STORAGE_KEY, token)
}

export function clearBearerToken(): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(BEARER_STORAGE_KEY)
}

export function cacheStaffSession(payload: SessionPayload): SessionMode | null {
  const staff = staffFromPayload(payload)
  if (!staff) return null
  localStorage.setItem('lh_staff_name', staff.name)
  localStorage.setItem('lh_staff_role', staff.role)
  if (payload.csrfToken) {
    localStorage.setItem(CSRF_STORAGE_KEY, payload.csrfToken)
  }
  return getBearerToken() ? 'bearer' : 'cookie'
}

export function clearClientSession(): void {
  clearBearerToken()
  localStorage.removeItem('lh_api_key')
  localStorage.removeItem('lh_csrf')
  localStorage.removeItem('lh_staff_name')
  localStorage.removeItem('lh_staff_role')
}

async function fetchSession(
  apiUrl: string,
  opts: { bearer?: string; credentials?: RequestCredentials } = {},
): Promise<SessionPayload | null> {
  const headers: Record<string, string> = {}
  if (opts.bearer) {
    headers.Authorization = `Bearer ${opts.bearer}`
  }
  try {
    const res = await fetch(`${apiUrl}/api/auth/session`, {
      credentials: opts.credentials ?? (opts.bearer ? 'omit' : 'include'),
      headers,
    })
    if (!res.ok) return null
    return (await res.json()) as SessionPayload
  } catch {
    return null
  }
}

/** iOS Safari はクロスサイト Cookie が不安定なため Bearer を優先する */
export function shouldPreferBearerAuth(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isMobile = isIOS || /Android/i.test(ua)
  return isMobile
}

/** True when HttpOnly session cookie is accepted by the browser. */
export async function probeCookieSession(apiUrl: string): Promise<StaffSession | null> {
  if (shouldPreferBearerAuth()) return null
  const payload = await fetchSession(apiUrl, { credentials: 'include' })
  return staffFromPayload(payload ?? {})
}

/**
 * After a successful POST /api/auth/login, pick cookie or Bearer mode.
 * iOS Safari often blocks cross-site session cookies (pages.dev ↔ workers.dev).
 */
export async function establishSessionAfterLogin(
  apiUrl: string,
  _apiKey: string,
  loginPayload: SessionPayload,
): Promise<SessionMode> {
  cacheStaffSession(loginPayload)

  const cookieStaff = await probeCookieSession(apiUrl)
  if (cookieStaff) {
    clearBearerToken()
    return 'cookie'
  }

  const sessionToken = loginPayload.sessionToken?.trim()
  if (!sessionToken) {
    throw new Error('ログインに失敗しました（モバイル認証）')
  }

  setBearerToken(sessionToken)
  const bearerPayload = await fetchSession(apiUrl, { bearer: sessionToken })
  const bearerStaff = staffFromPayload(bearerPayload ?? {})
  if (!bearerStaff) {
    clearBearerToken()
    throw new Error('ログインに失敗しました（モバイル認証）')
  }
  cacheStaffSession(bearerPayload!)
  return 'bearer'
}

/** Restore an existing session on page load. */
export async function restoreSession(apiUrl: string): Promise<StaffSession | null> {
  if (!shouldPreferBearerAuth()) {
    const cookiePayload = await fetchSession(apiUrl, { credentials: 'include' })
    const cookieStaff = staffFromPayload(cookiePayload ?? {})
    if (cookieStaff) {
      clearBearerToken()
      cacheStaffSession(cookiePayload!)
      return cookieStaff
    }
  }

  const bearer = getBearerToken()
  if (!bearer) return null

  const bearerPayload = await fetchSession(apiUrl, { bearer })
  const bearerStaff = staffFromPayload(bearerPayload ?? {})
  if (!bearerStaff) {
    clearBearerToken()
    return null
  }
  cacheStaffSession(bearerPayload!)
  return bearerStaff
}

export function authHeadersForFetch(): Record<string, string> {
  const bearer = getBearerToken()
  if (!bearer) return {}
  return { Authorization: `Bearer ${bearer}` }
}

export function usesBearerAuth(): boolean {
  return Boolean(getBearerToken())
}
