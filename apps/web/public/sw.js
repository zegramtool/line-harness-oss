/* TacTeQ 管理画面 Web Push — アプリ終了中の未読バッジ更新 */
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  event.waitUntil(handlePush(event))
})

async function handlePush(event) {
  let data = {
    unreadCount: 1,
    title: '未読のチャット',
    body: '新しいメッセージがあります',
    url: '/chats/',
  }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    // ペイロード無しでも通知は出す（iOS は表示必須）
  }
  const count = Number(data.unreadCount) || 0
  try {
    if (count > 0 && self.registration.setAppBadge) {
      await self.registration.setAppBadge(count)
    } else if (self.registration.clearAppBadge) {
      await self.registration.clearAppBadge()
    }
  } catch {
    // Badging API 非対応
  }
  await self.registration.showNotification(data.title || '未読のチャット', {
    body: data.body || '新しいメッセージがあります',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'tacteq-unread',
    renotify: true,
    data: { url: data.url || '/chats/' },
  })
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
