/**
 * globalThis.wx shim.
 *
 * fushi-ditu utils call `wx.getStorageSync(key)` / `wx.setStorageSync(key, value)` /
 * `wx.removeStorageSync(key)` inline in many places. From Node we cannot reach the
 * WeChat client storage, so we shim these three methods with JSON-file backed
 * implementations and stub out the rest.
 *
 * This must be imported BEFORE any fushi-ditu util is imported, otherwise the
 * inline wx.getStorageSync calls will throw `wx is not defined`.
 *
 * The shim asserts every storage key is in the known STORAGE_KEYS registry so a
 * typo or a new key fails loudly at runtime instead of silently returning
 * undefined and producing confusing downstream bugs.
 */
import { readJson, writeJson, removeJson } from './storage.js'
import { STORAGE_KEYS, type StorageKey } from './paths.js'

type WxStorage = {
  getStorageSync: <T = unknown>(key: string) => T | undefined
  setStorageSync: <T = unknown>(key: string, value: T) => void
  removeStorageSync: (key: string) => void
}

function isKnownKey(key: string): key is StorageKey {
  return (STORAGE_KEYS as readonly string[]).includes(key)
}

function get(key: string): unknown {
  if (!isKnownKey(key)) {
    throw new Error(
      `wx-shim: unknown storage key "${key}". Add it to STORAGE_KEYS in shim/paths.ts first.`
    )
  }
  return readJson(key)
}

function set(key: string, value: unknown): void {
  if (!isKnownKey(key)) {
    throw new Error(
      `wx-shim: unknown storage key "${key}". Add it to STORAGE_KEYS in shim/paths.ts first.`
    )
  }
  writeJson(key, value)
}

function remove(key: string): void {
  if (!isKnownKey(key)) {
    throw new Error(
      `wx-shim: unknown storage key "${key}". Add it to STORAGE_KEYS in shim/paths.ts first.`
    )
  }
  removeJson(key)
}

export function installWxShim(): void {
  const w = globalThis as unknown as { wx?: WxStorage }
  if (w.wx) return // already installed (e.g. test harness re-uses process)
  w.wx = {
    getStorageSync: <T = unknown>(key: string) => get(key) as T | undefined,
    setStorageSync: <T = unknown>(key: string, value: T) => set(key, value),
    removeStorageSync: (key: string) => remove(key),
  }
}