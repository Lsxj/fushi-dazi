'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')

const storage = new Map()

globalThis.wx = {
  getStorageSync(key) {
    return storage.get(key)
  },
  setStorageSync(key, value) {
    storage.set(key, value)
  },
  removeStorageSync(key) {
    storage.delete(key)
  },
}

const {
  formatDate,
  generateWeeklyPlan,
  regenerateKeepingLoggedToday,
} = require('../utils/planner.js')
const { checkinMeal } = require('../utils/checkin.js')
const { addReaction, traceback72h } = require('../utils/reactions.js')
const { analyzeSuspects, enterObservation } = require('../utils/observation.js')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function readFixture(name) {
  const fixture = path.join(__dirname, '..', 'mcp-server', 'test', 'fixtures', name)
  return JSON.parse(fs.readFileSync(fixture, 'utf8'))
}

function seedParentData() {
  const profile = readFixture('seed-babyProfile.json')
  const today = formatDate(new Date())

  // Represent a newly configured profile: categories are available for menu
  // planning, while the exact foods have not yet accumulated a stable history.
  // This makes a food eaten today eligible for reaction suspicion.
  for (const categoryState of Object.values(profile.categoryAllergies)) {
    if (categoryState.state === 'open') categoryState.passedDate = today
  }
  profile.confirmedFoods = []

  storage.set('babyProfile', profile)
  storage.set('fridge', [])
  storage.set('manualShopList', [])
  storage.set('mealJournal', [])
  storage.set('reactions', [])
  storage.set('customFoods', [])
  storage.set('weeklyPlan', [])
  return profile
}

function assertInventoryDeducted(recipe, before) {
  const after = storage.get('fridge')
  for (const ingredient of recipe.ingredients) {
    const remaining = after.find((item) => item.name === ingredient.name)
    assert(remaining, `${ingredient.name} should remain in the seeded fridge`)
    assert.strictEqual(
      remaining.portions,
      before.get(ingredient.name) - ingredient.portions,
      `${ingredient.name} inventory should be deducted by the planned portions`
    )
  }
}

function main() {
  const profile = seedParentData()
  const today = formatDate(new Date())

  const initialPlan = generateWeeklyPlan(profile, 7, new Date())
  assert.strictEqual(initialPlan.length, 7, 'profile setup should produce a seven-day menu')
  assert(initialPlan[0].meals.length > 0, 'today should contain at least one planned meal')
  storage.set('weeklyPlan', initialPlan)

  const plannedMeal = initialPlan[0].meals[0]
  const fridge = plannedMeal.recipe.ingredients.map((ingredient) => ({
    name: ingredient.name,
    portions: ingredient.portions + 2,
    storageLocation: 'refrigerated',
    purchaseDate: today,
    expiryDate: today,
    prepStatus: 'raw',
  }))
  storage.set('fridge', fridge)
  const beforeInventory = new Map(fridge.map((item) => [item.name, item.portions]))

  const checkin = checkinMeal(today, plannedMeal.mealIndex, plannedMeal.recipe)
  assert.strictEqual(storage.get('mealJournal').length, 1, 'check-in should create one meal log')
  assert.strictEqual(checkin.log.recipeId, plannedMeal.recipe.id)
  assertInventoryDeducted(plannedMeal.recipe, beforeInventory)

  const reactionTime = new Date(Date.now() + 60_000).toISOString()
  const traceback = traceback72h(reactionTime)
  assert.strictEqual(traceback.length, 1, 'reaction should trace back to the checked-in meal')

  const suspects = analyzeSuspects(profile, traceback[0].ingredients, reactionTime)
  assert(suspects.length > 0, 'a newly available food should be explainably identified as suspect')
  const suspect = suspects[0]
  const reactionId = `core-flow-${Date.now()}`
  addReaction({
    id: reactionId,
    occurredAt: reactionTime,
    type: 'rash',
    severity: 'moderate',
    note: '核心流程回归测试',
    tracebackMeals: traceback.map((meal) => ({
      date: meal.date,
      mealIndex: meal.mealIndex,
      recipeName: meal.recipeName,
      ingredients: meal.ingredients,
    })),
    suspectedFoods: [suspect.name],
  })
  assert.strictEqual(storage.get('reactions').length, 1, 'reaction should be persisted locally')

  const observedProfile = enterObservation(clone(profile), suspect.name, reactionId)
  storage.set('babyProfile', observedProfile)
  assert.strictEqual(observedProfile.individualExceptions[suspect.name].state, 'observation')

  const recomputedPlan = regenerateKeepingLoggedToday(observedProfile, initialPlan)
  storage.set('weeklyPlan', recomputedPlan)

  const loggedMeal = recomputedPlan
    .flatMap((day) => day.meals)
    .find((meal) => meal.date === today && meal.mealIndex === plannedMeal.mealIndex)
  assert.strictEqual(
    loggedMeal.recipe.id,
    plannedMeal.recipe.id,
    'menu recompute must preserve the meal the parent already checked in'
  )

  const unloggedMeals = recomputedPlan
    .flatMap((day) => day.meals)
    .filter((meal) => !(meal.date === today && meal.mealIndex === plannedMeal.mealIndex))
  assert(
    unloggedMeals.every((meal) => meal.recipe.ingredients.every((item) => item.name !== suspect.name)),
    'future and unlogged meals must exclude the food placed in observation'
  )
  assert.strictEqual(storage.get('mealJournal').length, 1, 'menu recompute must preserve meal history')
  assert.strictEqual(storage.get('reactions').length, 1, 'menu recompute must preserve reaction history')

  console.log(`core parent flow regression passed: observed=${suspect.name}, planDays=${recomputedPlan.length}`)
}

main()
