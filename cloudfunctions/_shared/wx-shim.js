/**
 * wx shim for cloud functions.
 *
 * fushi-ditu/utils/*.js (compiled from .ts) calls `wx.getStorageSync(key)` and
 * `wx.setStorageSync(key, value)` inline — but those are WeChat **mini-program**
 * APIs. In a cloud function, we replace them with backend-backed equivalents
 * so the same fushi-ditu code runs unchanged.
 *
 * Two backends:
 *   - fileShim:    reads/writes JSON files under a directory. Used in local
 *                  dev (`node chat-ai.js --local`) and unit tests.
 *   - memoryShim:  request-scoped, non-persistent storage seeded from the
 *                  mini-program's local snapshot. Used in production.
 *
 * Both shims enforce the 7-key STORAGE_KEYS registry so a typo or a new key
 * fails fast at runtime, not silently returning undefined.
 */
'use strict'

const fs = require('fs')
const path = require('path')

// MUST match the 7 keys fushi-ditu reads/writes (same list as
// mcp-server/src/shim/paths.ts). If you add a new key in fushi-ditu,
// add it here too or the shim will throw.
const STORAGE_KEYS = [
  'babyProfile',
  'fridge',
  'manualShopList',
  'mealJournal',
  'reactions',
  'customFoods',
  'weeklyPlan',
]

function assertKnownKey(key) {
  if (!STORAGE_KEYS.includes(key)) {
    throw new Error(`wx-shim: unknown storage key "${key}". Add it to STORAGE_KEYS in _shared/wx-shim.js first.`)
  }
}

/**
 * File-backed shim. Each storage key maps to one JSON file in `dataDir`.
 * Reads return undefined for missing files; writes are synchronous.
 */
function installFileShim(dataDir) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
  globalThis.wx = {
    getStorageSync(key) {
      assertKnownKey(key)
      const file = path.join(dataDir, `${key}.json`)
      if (!fs.existsSync(file)) return undefined
      try {
        const raw = fs.readFileSync(file, 'utf-8')
        if (!raw.trim()) return undefined
        return JSON.parse(raw)
      } catch (err) {
        throw new Error(`wx-shim[${key}] parse failed: ${err.message}`)
      }
    },
    setStorageSync(key, value) {
      assertKnownKey(key)
      fs.writeFileSync(path.join(dataDir, `${key}.json`), JSON.stringify(value, null, 2), 'utf-8')
    },
  }
}

/**
 * Request-scoped memory shim. Production AI calls seed this store from the
 * mini-program's local snapshot. No values are read from or written to a
 * database. The cloud function returns a delta for the client to persist
 * locally after the tool loop finishes.
 */
function installMemoryShim(seed = {}) {
  const cache = {}
  for (const [key, value] of Object.entries(seed)) {
    if (!STORAGE_KEYS.includes(key) || value === undefined) continue
    cache[key] = cloneValue(value)
  }

  globalThis.wx = {
    getStorageSync(key) {
      assertKnownKey(key)
      return cache[key]
    },
    setStorageSync(key, value) {
      assertKnownKey(key)
      cache[key] = value
    },
  }
}

function cloneValue(value) {
  if (value === null) return null
  return JSON.parse(JSON.stringify(value))
}

module.exports = { STORAGE_KEYS, installFileShim, installMemoryShim }
