import { describe, expect, test } from 'vitest';
import { countUnreadFriends, statusAfterIncomingCustomerMessage } from '../src/chats.js';

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

describe('statusAfterIncomingCustomerMessage', () => {
  test('対応中・解決済でも未読に戻す', () => {
    expect(statusAfterIncomingCustomerMessage('in_progress')).toBe('unread');
    expect(statusAfterIncomingCustomerMessage('resolved')).toBe('unread');
    expect(statusAfterIncomingCustomerMessage('unread')).toBe('unread');
  });
});
