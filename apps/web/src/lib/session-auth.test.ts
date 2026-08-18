import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  BEARER_STORAGE_KEY,
  REMEMBER_DEVICE_KEY,
  clearBearerToken,
  getBearerToken,
  getRememberDevicePreference,
  setBearerToken,
  setRememberDevicePreference,
} from './session-auth'

type Store = Record<string, string>

function mockStorage(store: Store) {
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value)
    },
    removeItem: (key: string) => {
      delete store[key]
    },
  }
}

describe('bearer token storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('persist=true ならタブを閉じても localStorage から復元できる', () => {
    const session: Store = {}
    const local: Store = {}
    vi.stubGlobal('sessionStorage', mockStorage(session))
    vi.stubGlobal('localStorage', mockStorage(local))

    setBearerToken('lh_sess_abc', true)
    expect(session[BEARER_STORAGE_KEY]).toBe('lh_sess_abc')
    expect(local[BEARER_STORAGE_KEY]).toBe('lh_sess_abc')

    delete session[BEARER_STORAGE_KEY]
    expect(getBearerToken()).toBe('lh_sess_abc')
  })

  test('persist=false なら sessionStorage のみ', () => {
    const session: Store = {}
    const local: Store = { [BEARER_STORAGE_KEY]: 'old' }
    vi.stubGlobal('sessionStorage', mockStorage(session))
    vi.stubGlobal('localStorage', mockStorage(local))

    setBearerToken('lh_sess_tmp', false)
    expect(session[BEARER_STORAGE_KEY]).toBe('lh_sess_tmp')
    expect(local[BEARER_STORAGE_KEY]).toBeUndefined()
    expect(getBearerToken()).toBe('lh_sess_tmp')

    delete session[BEARER_STORAGE_KEY]
    expect(getBearerToken()).toBe('')
  })

  test('clear は両方消す', () => {
    const session: Store = { [BEARER_STORAGE_KEY]: 'a' }
    const local: Store = { [BEARER_STORAGE_KEY]: 'a' }
    vi.stubGlobal('sessionStorage', mockStorage(session))
    vi.stubGlobal('localStorage', mockStorage(local))

    clearBearerToken()
    expect(getBearerToken()).toBe('')
  })

  test('記憶する設定のデフォルトは true', () => {
    const local: Store = {}
    vi.stubGlobal('localStorage', mockStorage(local))
    expect(getRememberDevicePreference()).toBe(true)
    setRememberDevicePreference(false)
    expect(local[REMEMBER_DEVICE_KEY]).toBe('0')
    expect(getRememberDevicePreference()).toBe(false)
  })
})
