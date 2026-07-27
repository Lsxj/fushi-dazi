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

function buildProfile() {
  return {
    babyName: '宝宝',
    birthday: '2025-05-10',
    ageMonths: 14,
    mealsPerDay: 3,
    currentStatus: 'normal',
    categoryAllergies: {
      rice: { state: 'open', passedDate: '2026-04-01' },
      leafy: { state: 'open', passedDate: '2026-04-01' },
      root: { state: 'open', passedDate: '2026-04-01' },
      redMeat: { state: 'open', passedDate: '2026-04-01' },
    },
    individualExceptions: {},
    recentlyAddedFoods: [],
  }
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
    historyRes.storageSnapshot.mealJournal,
    originalMealJournal,
    'get_feeding_history must not mutate or clear mealJournal'
  )
  assert.deepStrictEqual(
    historyRes.storageSnapshot.reactions,
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
    menuRes.storageSnapshot.mealJournal,
    originalMealJournal,
    'menu generation must preserve existing mealJournal history'
  )
  assert.deepStrictEqual(
    menuRes.storageSnapshot.reactions,
    originalReactions,
    'menu generation must preserve existing reaction history'
  )

  fs.rmSync(dataDir, { recursive: true, force: true })
  console.log('chat-ai history regression tests passed')
}

main().catch((err) => {
  fs.rmSync(dataDir, { recursive: true, force: true })
  console.error(err)
  process.exit(1)
})
