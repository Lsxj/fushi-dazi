'use strict'

const assert = require('assert')

const storage = {}
globalThis.wx = {
  getStorageSync(key) {
    return storage[key]
  },
  setStorageSync(key, value) {
    storage[key] = value
  },
  removeStorageSync(key) {
    delete storage[key]
  },
}

const {
  BACKUP_PREFIX,
  BEFORE_RESTORE_BACKUP_KEY,
  createDataBackup,
  parseBackup,
  restoreDataBackup,
  serializeBackup,
} = require('../utils/backup.js')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

const original = {
  babyProfile: {
    babyName: '宝宝',
    birthday: '2025-05-10',
    ageMonths: 14,
    mealsPerDay: 3,
    currentStatus: 'normal',
    categoryAllergies: {},
    individualExceptions: {},
  },
  mealJournal: [
    {
      date: '2026-05-10',
      mealIndex: 0,
      recipeId: 'r024',
      recipeName: '猪肝菠菜粥',
      ingredients: ['猪肝', '菠菜', '大米'],
      loggedAt: '2026-05-10T08:11:53.284Z',
    },
  ],
  reactions: [
    {
      id: 'r-1778400740965-vomit',
      occurredAt: '2026-05-09T12:00:00.000Z',
      type: 'vomit',
      severity: 'mild',
      tracebackMeals: [],
      suspectedFoods: [],
    },
  ],
  weeklyPlan: [{ date: '2026-05-10', meals: [] }],
  fridge: [{ name: '南瓜', portions: 2 }],
  customFoods: [{ name: '自制肉松' }],
  setupDone: true,
  onboardingDone: true,
}

function seed(value) {
  for (const key of Object.keys(storage)) delete storage[key]
  for (const [key, item] of Object.entries(value)) storage[key] = clone(item)
}

seed(original)

const backup = createDataBackup(new Date('2026-07-12T00:00:00.000Z'))
assert.strictEqual(backup.app, 'fushi-ditu')
assert.strictEqual(backup.version, 1)
assert.strictEqual(backup.summary.babyName, '宝宝')
assert.strictEqual(backup.summary.mealJournalCount, 1)
assert.strictEqual(backup.summary.reactionCount, 1)

const serialized = serializeBackup(backup)
assert(serialized.startsWith(BACKUP_PREFIX), 'serialized backup should include prefix')

const parsed = parseBackup(serialized)
assert.deepStrictEqual(parsed.data.mealJournal, original.mealJournal)
assert.deepStrictEqual(parsed.data.reactions, original.reactions)

storage.babyProfile = { babyName: '错误档案', birthday: '2024-01-01' }
storage.mealJournal = []
storage.reactions = []
storage.weeklyPlan = []

const result = restoreDataBackup(parsed)
assert(result.restoredKeys.includes('babyProfile'), 'restore should include babyProfile')
assert(result.restoredKeys.includes('mealJournal'), 'restore should include mealJournal')
assert.deepStrictEqual(storage.babyProfile, original.babyProfile)
assert.deepStrictEqual(storage.mealJournal, original.mealJournal)
assert.deepStrictEqual(storage.reactions, original.reactions)
assert.deepStrictEqual(storage.weeklyPlan, original.weeklyPlan)
assert.strictEqual(storage.setupDone, true)
assert.strictEqual(storage.onboardingDone, true)

assert(storage[BEFORE_RESTORE_BACKUP_KEY], 'restore should keep a before-restore snapshot')
assert.deepStrictEqual(storage[BEFORE_RESTORE_BACKUP_KEY].data.mealJournal, [])
assert.deepStrictEqual(storage[BEFORE_RESTORE_BACKUP_KEY].data.reactions, [])

assert.throws(() => parseBackup('not a backup'), /JSON|备份/)

console.log('backup regression tests passed')
