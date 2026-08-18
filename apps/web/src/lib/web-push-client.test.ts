import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { urlBase64ToUint8Array, isIosDevice, isStandaloneDisplay, SERVICE_WORKER_URL } from './web-push-client'

describe('urlBase64ToUint8Array', () => {
  test('VAPID 公開鍵の base64url をバイト列に戻す', () => {
    const bytes = new Uint8Array([4, 1, 2, 3, 4])
    const b64 = Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(Array.from(urlBase64ToUint8Array(b64))).toEqual([4, 1, 2, 3, 4])
  })
})

describe('display mode helpers', () => {
  test('navigator が無ければ iOS 判定は false', () => {
    expect(isIosDevice()).toBe(false)
  })

  test('window が無ければ standalone は false', () => {
    expect(isStandaloneDisplay()).toBe(false)
  })

  test('Service Worker は /sw.js に固定する（クエリ付きは別 SW になり Push が古い方に残る）', () => {
    expect(SERVICE_WORKER_URL).toBe('/sw.js')
  })

  test('sw.js は iOS 向けに navigator.setAppBadge を呼ぶ', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const sw = readFileSync(resolve(here, '../../public/sw.js'), 'utf8')
    expect(sw).toContain('setAppBadge')
    expect(sw).toContain('self.navigator')
    expect(sw).toContain('badgeCount')
    expect(sw).toContain('web_push')
    expect(sw).toContain('Math.max(1')
    expect(sw).not.toContain('clearAppBadge')
    expect(SERVICE_WORKER_URL.includes('?')).toBe(false)
  })
})
