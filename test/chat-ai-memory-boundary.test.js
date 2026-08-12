'use strict'

const assert = require('assert')
const fs = require('fs')
const Module = require('module')
const path = require('path')

delete process.env.LOCAL
process.env.LLM_PROVIDER = 'mock'

const originalLoad = Module._load
Module._load = function guardedLoad(request, parent, isMain) {
  if (request === 'wx-server-sdk') {
    throw new Error('chat-ai production path must not load wx-server-sdk')
  }
  return originalLoad.call(this, request, parent, isMain)
}

const chatAi = require('../cloudfunctions/chat-ai/index.js')

function buildLocalSnapshot() {
  const fixture = path.join(__dirname, '..', 'mcp-server', 'test', 'fixtures', 'seed-babyProfile.json')
  return {
    babyProfile: JSON.parse(fs.readFileSync(fixture, 'utf8')),
    fridge: [],
    manualShopList: [],
    mealJournal: [],
    reactions: [],
    customFoods: [],
    weeklyPlan: [],
  }
}

async function main() {
  const localSnapshot = buildLocalSnapshot()
  const readOnly = await chatAi.main({
    question: '最近记录了哪些辅食？',
    history: [],
    _localBackup: localSnapshot,
  }, { OPENID: 'memory-boundary-readonly' })

  assert.strictEqual(readOnly.ok, true)
  assert.deepStrictEqual(readOnly.storageSnapshot, {})
  assert.deepStrictEqual(localSnapshot.weeklyPlan, [], 'cloud tools must not mutate the request payload')

  const menu = await chatAi.main({
    question: '今天吃什么？',
    history: [],
    _localBackup: localSnapshot,
  }, { OPENID: 'memory-boundary-menu' })

  assert.strictEqual(menu.ok, true)
  assert.deepStrictEqual(Object.keys(menu.storageSnapshot), ['weeklyPlan'])
  assert(menu.storageSnapshot.weeklyPlan.length > 0)
  assert(!Object.prototype.hasOwnProperty.call(menu.storageSnapshot, 'babyProfile'))
  assert.deepStrictEqual(localSnapshot.weeklyPlan, [], 'response delta must not mutate the local input object')

  Module._load = originalLoad
  console.log('chat-ai request-scoped memory boundary tests passed')
}

main().catch((error) => {
  Module._load = originalLoad
  console.error(error)
  process.exit(1)
})
