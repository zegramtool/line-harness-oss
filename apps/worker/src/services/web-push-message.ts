export type UnreadPushData = {
  unreadCount: number;
  badgeCount: number;
  title: string;
  body: string;
  url: string;
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
    };
  };
};

export function buildUnreadPushData(opts: {
  unreadCount: number;
  friendName?: string | null;
}): UnreadPushData {
  const name = opts.friendName?.trim() || 'お客さま';
  const count = Math.max(0, Math.floor(opts.unreadCount));
  const badgeCount = Math.max(count, 1);
  const body =
    count <= 1 ? `${name}からメッセージ` : `${name}からメッセージ（未読 ${count} 件）`;
  return {
    unreadCount: count,
    badgeCount,
    title: '未読のチャット',
    body,
    url: '/chats/',
  };
}

export function buildDeclarativeUnreadPush(
  data: UnreadPushData,
  adminOrigin: string,
): DeclarativeUnreadPush {
  const origin = adminOrigin.replace(/\/+$/, '');
  const badgeCount = Math.max(1, Math.floor(Number(data.badgeCount) || 1));
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
      navigate: `${origin}/chats/`,
      silent: false,
      app_badge: String(badgeCount),
      data: {
        url: data.url,
        unreadCount: data.unreadCount,
        badgeCount,
      },
    },
  };
}
