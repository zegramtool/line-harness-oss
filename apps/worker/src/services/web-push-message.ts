export function buildUnreadPushData(opts: {
  unreadCount: number;
  friendName?: string | null;
}): {
  unreadCount: number;
  title: string;
  body: string;
  url: string;
} {
  const name = opts.friendName?.trim() || 'お客さま';
  const count = Math.max(0, Math.floor(opts.unreadCount));
  const body =
    count <= 1 ? `${name}からメッセージ` : `${name}からメッセージ（未読 ${count} 件）`;
  return {
    unreadCount: count,
    title: '未読のチャット',
    body,
    url: '/chats/',
  };
}
