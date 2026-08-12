'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')

process.env.LOCAL = '1'
process.env.LLM_PROVIDER = 'mock'

const chatAi = require('../cloudfunctions/chat-ai/index.js')

const openid = `history-regression-${Date.now()}`
const dataDir = path.join(__dirname, '..', 'cloudfunctions', 'chat-ai', '_localdata', openid)

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function readStored(key) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, `${key}.json`), 'utf8'))
}

function buildProfile() {
  const fixture = path.join(__dirname, '..', 'mcp-server', 'test', 'fixtures', 'seed-babyProfile.json')
  return JSON.parse(fs.readFileSync(fixture, 'utf8'))
}

const originalMealJournal = [
  {
    date: '2026-05-10',
    mealIndex: 0,
    recipeId: 'r024',
    recipeName: '猪肝菠菜粥',
    ingredients: ['猪肝', '菠菜', '大米'],
    loggedAt: '2026-05-10T08:11:53.284Z',
    preference: 'love',
  },
  {
    date: '2026-05-10',
    mealIndex: 1,
    recipeId: 'r021',
    recipeName: '牛肉南瓜粥',
    ingredients: ['牛肉', '南瓜', '大米'],
    loggedAt: '2026-05-10T08:11:57.004Z',
  },
  {
    date: '2026-05-10',
    mealIndex: 2,
    recipeId: 'r010',
    recipeName: '牛肉土豆粥',
    ingredients: ['牛肉', '土豆', '大米'],
    loggedAt: '2026-05-10T08:12:01.020Z',
  },
]

const originalReactions = [
  {
    id: 'r-1778400740965-vomit',
    occurredAt: '2026-05-09T12:00:00.000Z',
    type: 'vomit',
    severity: 'mild',
    note: '',
    tracebackMeals: [],
    suspectedFoods: [],
  },
]

async function callChat(question) {
  return chatAi.main({
    _testOpenid: openid,
    question,
    history: [],
    _localBackup: {
      babyProfile: buildProfile(),
      mealJournal: clone(originalMealJournal),
      reactions: clone(originalReactions),
      weeklyPlan: [],
      fridge: [],
      manualShopList: [],
      customFoods: [],
    },
  }, {})
}

async function main() {
  fs.rmSync(dataDir, { recursive: true, force: true })

  const historyRes = await callChat('最近记录了哪些辅食？')
  assert.strictEqual(historyRes.ok, true, 'history request should succeed')
  assert(
    historyRes.toolCalls.some((tc) => tc.name === 'get_feeding_history' && tc.ok),
    'history request should call get_feeding_history successfully'
  )
  assert.deepStrictEqual(
    historyRes.storageSnapshot,
    {},
    'read-only AI tools must not echo a full cloud snapshot back to local storage'
  )
  assert.deepStrictEqual(
    readStored('mealJournal'),
    originalMealJournal,
    'get_feeding_history must not mutate or clear mealJournal'
  )
  assert.deepStrictEqual(
    readStored('reactions'),
    originalReactions,
    'get_feeding_history must not mutate or clear reactions'
  )

  const menuRes = await callChat('今天吃什么？')
  assert.strictEqual(menuRes.ok, true, 'menu request should succeed')
  assert(
    menuRes.toolCalls.some((tc) => tc.name === 'generate_today_menu' && tc.ok),
    'menu request should still call generate_today_menu successfully'
  )
  assert.deepStrictEqual(
    Object.keys(menuRes.storageSnapshot),
    ['weeklyPlan'],
    'menu generation may return only the weeklyPlan delta, never babyProfile or unrelated keys'
  )
  assert(Array.isArray(menuRes.storageSnapshot.weeklyPlan) && menuRes.storageSnapshot.weeklyPlan.length > 0)
  assert.deepStrictEqual(
    readStored('mealJournal'),
    originalMealJournal,
    'menu generation must preserve existing mealJournal history'
  )
  assert.deepStrictEqual(
    readStored('reactions'),
    originalReactions,
    'menu generation must preserve existing reaction history'
  )
  assert.deepStrictEqual(
    readStored('babyProfile'),
    buildProfile(),
    'menu generation must preserve the complete local allergy profile'
  )

  const reactionRes = await callChat('宝宝刚刚有点拉稀了')
  assert.strictEqual(reactionRes.ok, true, 'reaction request should succeed')
  assert(
    reactionRes.toolCalls.some((tc) => tc.name === 'record_reaction' && tc.ok),
    'reaction request should call record_reaction successfully'
  )
  assert.deepStrictEqual(
    Object.keys(reactionRes.storageSnapshot),
    ['reactions'],
    'recording a reaction may return only the reactions delta'
  )
  assert.strictEqual(
    reactionRes.storageSnapshot.reactions.length,
    originalReactions.length + 1,
    'reaction delta should contain the newly appended reaction'
  )
  assert.deepStrictEqual(
    readStored('babyProfile'),
    buildProfile(),
    'recording a reaction must not replace the allergy profile'
  )

  fs.rmSync(dataDir, { recursive: true, force: true })
  console.log('chat-ai history regression tests passed')
}

main().catch((err) => {
  fs.rmSync(dataDir, { recursive: true, force: true })
  console.error(err)
  process.exit(1)
})
