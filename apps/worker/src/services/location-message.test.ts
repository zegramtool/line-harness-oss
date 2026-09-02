import { describe, expect, test } from 'vitest';
import {
  buildGoogleMapsUrl,
  createLocationMessageContent,
  parseLocationMessageContent,
  locationPreviewLabel,
} from '@line-crm/shared';

describe('location message content', () => {
  test('緯度経度から Google マップ URL を作る', () => {
    const created = createLocationMessageContent({
      title: '東京駅',
      address: '東京都千代田区',
      latitude: 35.681236,
      longitude: 139.767125,
    });
    expect(created).toMatchObject({
      type: 'location',
      title: '東京駅',
      latitude: 35.681236,
      longitude: 139.767125,
    });
    expect(created?.mapsUrl).toBe(buildGoogleMapsUrl(35.681236, 139.767125));
    expect(created?.mapsUrl).toContain('google.com/maps?q=35.681236,139.767125');
  });

  test('JSON から読み直せる', () => {
    const json = JSON.stringify(createLocationMessageContent({
      title: '現場',
      latitude: 35.1,
      longitude: 139.2,
    }));
    const parsed = parseLocationMessageContent(json);
    expect(parsed?.title).toBe('現場');
    expect(parsed?.mapsUrl).toContain('35.1,139.2');
    expect(locationPreviewLabel(json)).toBe('📍 現場');
  });

  test('旧テキストはリンクなしで名前だけ', () => {
    expect(parseLocationMessageContent('[位置情報: 東京駅]')).toBeNull();
    expect(locationPreviewLabel('[位置情報: 東京駅]')).toBe('📍 東京駅');
  });

  test('範囲外の座標は捨てる', () => {
    expect(createLocationMessageContent({ latitude: 95, longitude: 10 })).toBeNull();
  });
});
