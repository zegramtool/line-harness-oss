import { describe, expect, test } from 'vitest'
import { urlBase64ToUint8Array, isIosDevice, isStandaloneDisplay } from './web-push-client'

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
})
