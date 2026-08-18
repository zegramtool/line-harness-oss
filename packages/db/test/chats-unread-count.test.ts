import { describe, expect, test } from 'vitest';
import { countUnreadFriends } from '../src/chats.js';

describe('countUnreadFriends', () => {
  test('友だち単位で unread だけを数える', () => {
    expect(
      countUnreadFriends([
        { friendId: 'a', status: 'unread' },
        { friendId: 'b', status: 'resolved' },
        { friendId: 'c', status: 'in_progress' },
        { friendId: 'd', status: 'unread' },
      ]),
    ).toBe(2);
  });

  test('同一友だちは in_progress > unread > resolved でマージする', () => {
    expect(
      countUnreadFriends([
        { friendId: 'a', status: 'unread' },
        { friendId: 'a', status: 'in_progress' },
        { friendId: 'b', status: 'resolved' },
        { friendId: 'b', status: 'unread' },
      ]),
    ).toBe(1);
  });

  test('未読が無ければ 0', () => {
    expect(
      countUnreadFriends([
        { friendId: 'a', status: 'resolved' },
        { friendId: 'b', status: 'in_progress' },
      ]),
    ).toBe(0);
  });
});
