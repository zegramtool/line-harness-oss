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

  test('Service Worker の URL をバージョン付きにして iOS に再取得させる', () => {
    expect(SERVICE_WORKER_URL).toMatch(/^\/sw\.js\?v=/)
  })

  test('sw.js は iOS 向けに navigator.setAppBadge を呼ぶ', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const sw = readFileSync(resolve(here, '../../public/sw.js'), 'utf8')
    expect(sw).toContain('nav.setAppBadge')
    expect(sw).toContain('self.navigator')
  })
})
