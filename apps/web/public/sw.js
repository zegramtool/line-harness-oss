/* v4: 購読は必ず /sw.js。iOS バッジは navigator.setAppBadge。届いた通知では最低 1 */
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
    badgeCount: 1,
    title: '未読のチャット',
    body: '新しいメッセージがあります',
    url: '/chats/',
  }
  try {
    if (!event.data) return fallback
    let parsed = event.data.json()
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed)
      } catch {
        return fallback
      }
    }
    if (!parsed || typeof parsed !== 'object') return fallback
    return { ...fallback, ...parsed }
  } catch {
    return fallback
  }
}

function applyAppBadgeFromWorker(count) {
  const n = Math.max(1, Math.floor(Number(count) || 1))
  const tasks = []
  const trySet = (target) => {
    if (!target) return
    try {
      const fn = target.setAppBadge
      if (typeof fn === 'function') tasks.push(fn.call(target, n))
    } catch {
      // 非対応
    }
  }
  // iOS は navigator.setAppBadge。registration だけだと無視されることがある
  trySet(self.navigator)
  trySet(typeof navigator !== 'undefined' ? navigator : null)
  trySet(self.registration)
  return tasks.length ? Promise.allSettled(tasks) : Promise.resolve()
}

async function handlePush(event) {
  const data = readPushData(event)
  const count = data.badgeCount ?? data.unreadCount
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
  // iOS は通知表示後の setAppBadge が効くことがある
  await applyAppBadgeFromWorker(count)
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
