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
 *   - cloudDbShim: reads/writes a `user_data` document keyed by openid in the
 *                  WeChat cloud database. Used in production.
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
 * Cloud-database shim. Each user (openid) has one document in the
 * `user_data` collection with 7 fields (one per storage key). Lazy load
 * + write-through: the document is cached in memory, written back to
 * the database on every setStorageSync.
 *
 * Usage in a cloud function:
 *   const cloud = require('wx-server-sdk')
 *   cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
 *   const { OPENID } = cloud.getWXContext()
 *   const shim = require('./_shared/wx-shim')
 *   await shim.installCloudDbShim(cloud, OPENID)
 *   // Now any fushi-ditu util that calls wx.getStorageSync works.
 */
async function installCloudDbShim(cloud, openid) {
  if (!openid) throw new Error('wx-shim cloudDb: openid is required')
  const db = cloud.database()
  const _ = db.command
  const docId = `u_${openid}`
  const cache = {}

  // Load the document once. Missing doc = new user = empty object.
  try {
    const res = await db.collection('user_data').doc(docId).get()
    Object.assign(cache, res.data || {})
  } catch (err) {
    // doc doesn't exist yet — start fresh
    if (err && err.errCode && err.errCode !== 'DATABASE_DOC_NOT_EXIST') throw err
  }

  globalThis.wx = {
    getStorageSync(key) {
      assertKnownKey(key)
      return cache[key]
    },
    setStorageSync(key, value) {
      assertKnownKey(key)
      cache[key] = value
      // Fire-and-forget; we don't await the network write because
      // fushi-ditu code expects sync semantics. The next setStorageSync
      // is the durable boundary.
      db.collection('user_data').doc(docId)
        .update({ data: { [key]: value, _updatedAt: Date.now() } })
        .catch((err) => {
          // If the doc doesn't exist yet (first write for a new user),
          // create it. Otherwise surface the error.
          if (err && err.errCode === 'DATABASE_DOC_NOT_EXIST') {
            db.collection('user_data').doc(docId).set({
              data: { _openid: openid, [key]: value, _createdAt: Date.now(), _updatedAt: Date.now() },
            }).catch((e) => console.error('wx-shim cloudDb set failed:', e))
          } else {
            console.error('wx-shim cloudDb update failed:', err)
          }
        })
    },
  }
}

module.exports = { STORAGE_KEYS, installFileShim, installCloudDbShim }
