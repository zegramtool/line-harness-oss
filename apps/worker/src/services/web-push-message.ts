export type UnreadPushData = {
  unreadCount: number;
  badgeCount: number;
  title: string;
  body: string;
  url: string;
  friendId: string | null;
};

/** iOS 18.4+ が Service Worker なしで通知とホーム画面バッジを付ける形式。 */
export type DeclarativeUnreadPush = {
  web_push: 8030;
  mutable: false;
  app_badge: number;
  notification: {
    title: string;
    lang: string;
    dir: 'ltr';
    body: string;
    navigate: string;
    silent: false;
    app_badge: string;
    data: {
      url: string;
      unreadCount: number;
      badgeCount: number;
      friendId: string | null;
    };
  };
};

export function chatUrlForFriend(friendId?: string | null): string {
  const id = friendId?.trim();
  return id ? `/chats/?friend=${encodeURIComponent(id)}` : '/chats/';
}

function previewText(raw?: string | null): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function buildUnreadPushData(opts: {
  unreadCount: number;
  friendName?: string | null;
  friendId?: string | null;
  preview?: string | null;
}): UnreadPushData {
  const name = opts.friendName?.trim() || 'お客さま';
  const count = Math.max(0, Math.floor(opts.unreadCount));
  const badgeCount = Math.max(count, 1);
  const preview = previewText(opts.preview);
  const body = preview
    ? count <= 1
      ? preview
      : `${preview}（未読 ${count} 件）`
    : count <= 1
      ? `${name}からメッセージ`
      : `${name}からメッセージ（未読 ${count} 件）`;
  const friendId = opts.friendId?.trim() || null;
  return {
    unreadCount: count,
    badgeCount,
    title: name,
    body,
    url: chatUrlForFriend(friendId),
    friendId,
  };
}

export function buildDeclarativeUnreadPush(
  data: UnreadPushData,
  adminOrigin: string,
): DeclarativeUnreadPush {
  const origin = adminOrigin.replace(/\/+$/, '');
  const badgeCount = Math.max(1, Math.floor(Number(data.badgeCount) || 1));
  const path = data.url.startsWith('/') ? data.url : `/${data.url}`;
  return {
    web_push: 8030,
    // OS が app_badge を付ける。true だと古い SW が数字を消すことがある
    mutable: false,
    app_badge: badgeCount,
    notification: {
      title: data.title,
      lang: 'ja',
      dir: 'ltr',
      body: data.body,
      navigate: `${origin}${path}`,
      silent: false,
      app_badge: String(badgeCount),
      data: {
        url: data.url,
        unreadCount: data.unreadCount,
        badgeCount,
        friendId: data.friendId,
      },
    },
  };
}
