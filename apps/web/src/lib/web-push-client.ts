export function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

export type WebPushStatus =
  | 'unsupported'
  | 'needs-home-screen'
  | 'needs-permission'
  | 'denied'
  | 'subscribed'

export async function getWebPushStatus(): Promise<WebPushStatus> {
  if (typeof window === 'undefined') return 'unsupported'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported'
  }
  if (isIosDevice() && !isStandaloneDisplay()) return 'needs-home-screen'
  if (Notification.permission === 'denied') return 'denied'
  const registration = await navigator.serviceWorker.getRegistration()
  const existing = await registration?.pushManager.getSubscription()
  if (existing && Notification.permission === 'granted') return 'subscribed'
  return 'needs-permission'
}

export const SERVICE_WORKER_URL = '/sw.js'

function scriptUrlOf(reg: ServiceWorkerRegistration): string {
  return reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || ''
}

/** Push 購読は最初に登録した SW に紐づく。?v= 付きは別 SW になるので外す。 */
export async function registerChatServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    const regs = await navigator.serviceWorker.getRegistrations()
    for (const reg of regs) {
      if (scriptUrlOf(reg).includes('sw.js?')) {
        try {
          const sub = await reg.pushManager.getSubscription()
          if (sub) await sub.unsubscribe()
        } catch {
          // 購読解除に失敗しても unregister は続ける
        }
        await reg.unregister()
      }
    }
    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' })
    try {
      await registration.update()
    } catch {
      // オフライン時など
    }
    return registration
  } catch {
    return null
  }
}

export async function subscribeWebPush(): Promise<WebPushStatus> {
  const { api } = await import('@/lib/api')
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported'
  }
  if (isIosDevice() && !isStandaloneDisplay()) return 'needs-home-screen'

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission()
  if (permission !== 'granted') {
    return permission === 'denied' ? 'denied' : 'needs-permission'
  }

  const registration = (await registerChatServiceWorker())
    ?? (await navigator.serviceWorker.getRegistration())
  if (!registration) return 'unsupported'
  await navigator.serviceWorker.ready

  const vapid = await api.webPush.vapidPublicKey()
  if (!vapid.success || !vapid.data.publicKey) return 'unsupported'
  const keyBytes = urlBase64ToUint8Array(vapid.data.publicKey)
  const applicationServerKey = Uint8Array.from(keyBytes)

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    })
  }
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return 'unsupported'
  await api.webPush.subscribe({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  })
  return 'subscribed'
}

/** すでに通知許可済みなら、裏で購読を張り直す（iOS が endpoint を更新することがある）。 */
export async function resubscribeWebPushIfGranted(): Promise<void> {
  if (typeof window === 'undefined') return
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    await subscribeWebPush()
  } catch {
    // オフライン時など
  }
}
