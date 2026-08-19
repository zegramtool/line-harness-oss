import { describe, expect, test } from 'vitest';
import { countUnreadFriends, inferChatStatus, statusAfterIncomingCustomerMessage } from '../src/chats.js';

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

describe('inferChatStatus', () => {
  test('保存済み status を優先する', () => {
    expect(inferChatStatus({ storedStatus: 'resolved', lastMessageDirection: 'incoming' })).toBe(
      'resolved',
    );
    expect(inferChatStatus({ storedStatus: 'in_progress', lastMessageDirection: 'incoming' })).toBe(
      'in_progress',
    );
  });

  test('chats 行が無く最後が incoming なら未読', () => {
    expect(inferChatStatus({ storedStatus: null, lastMessageDirection: 'incoming' })).toBe('unread');
  });

  test('chats 行が無く最後が outgoing なら解決済', () => {
    expect(inferChatStatus({ lastMessageDirection: 'outgoing' })).toBe('resolved');
  });
});
