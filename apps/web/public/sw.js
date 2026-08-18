/* v3: iOS は Service Worker でも navigator.setAppBadge を使う（WebKit 公式） */
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  event.waitUntil(handlePush(event))
})

function readPushData(event) {
  const fallback = {
    unreadCount: 1,
    title: '未読のチャット',
    body: '新しいメッセージがあります',
    url: '/chats/',
  }
  try {
    if (!event.data) return fallback
    const parsed = event.data.json()
    if (!parsed || typeof parsed !== 'object') return fallback
    return { ...fallback, ...parsed }
  } catch {
    return fallback
  }
}

function applyAppBadgeFromWorker(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0))
  const nav = self.navigator
  if (n > 0) {
    if (nav && typeof nav.setAppBadge === 'function') return nav.setAppBadge(n)
    if (typeof self.registration.setAppBadge === 'function') return self.registration.setAppBadge(n)
  } else {
    if (nav && typeof nav.clearAppBadge === 'function') return nav.clearAppBadge()
    if (typeof self.registration.clearAppBadge === 'function') return self.registration.clearAppBadge()
  }
  return Promise.resolve()
}

async function handlePush(event) {
  const data = readPushData(event)
  const count = Number(data.unreadCount) || 0
  await Promise.all([
    applyAppBadgeFromWorker(count),
    self.registration.showNotification(data.title || '未読のチャット', {
      body: data.body || '新しいメッセージがあります',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'tacteq-unread',
      renotify: true,
      data: { url: data.url || '/chats/' },
    }),
  ])
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/chats/'
  event.waitUntil(openChat(url))
})

async function openChat(url) {
  const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const client of all) {
    if ('focus' in client) {
      await client.focus()
      if ('navigate' in client) {
        try {
          await client.navigate(url)
        } catch {
          // navigate 非対応
        }
      }
      return
    }
  }
  await self.clients.openWindow(url)
}
