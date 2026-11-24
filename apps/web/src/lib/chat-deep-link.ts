/** Consume a query once on resume; a real history navigation may revisit it. */
export function createChatDeepLinkConsumer() {
  let lastFriendId: string | null | undefined
  return (friendId: string | null, eventType: 'initial' | 'pageshow' | 'popstate') => {
    if (eventType !== 'popstate' && friendId === lastFriendId) return false
    lastFriendId = friendId
    return friendId !== null || eventType === 'popstate'
  }
}
